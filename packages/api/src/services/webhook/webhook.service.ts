import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import axios from "axios";
import logger from "../../lib/logger";
import { performanceMonitor } from "../../lib/performance";

export interface WebhookEvent {
  id: string;
  type: string;
  teamId: string;
  projectId?: string;
  data: any;
  timestamp: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: "pending" | "success" | "failed";
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  nextRetryAt?: Date;
  completedAt?: Date;
}

export class WebhookService {
  private prisma: PrismaClient;
  private readonly maxRetries = 3;
  private readonly retryDelays = [60000, 300000, 900000]; // 1min, 5min, 15min
  private readonly timeout = 30000; // 30 seconds
  private readonly signatureAlgorithm = "sha256";

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Create a new webhook endpoint
  async createWebhook(
    teamId: string,
    data: {
      url: string;
      events: string[];
      description?: string;
      headers?: Record<string, string>;
      enabled?: boolean;
    }
  ): Promise<any> {
    try {
      // Validate URL
      const parsedUrl = new URL(data.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Webhook URL must use HTTP or HTTPS protocol");
      }

      // Generate signing secret
      const signingSecret = this.generateSigningSecret();

      const webhook = await this.prisma.webhook.create({
        data: {
          teamId,
          url: data.url,
          events: data.events,
          description: data.description,
          headers: data.headers || {},
          signingSecret,
          enabled: data.enabled ?? true,
          metadata: {
            createdAt: new Date(),
            version: "1.0",
          },
        },
      });

      logger.info("Webhook created", {
        webhookId: webhook.id,
        teamId,
        url: data.url,
        events: data.events,
      });

      return {
        ...webhook,
        signingSecret, // Only return on creation
      };
    } catch (error) {
      logger.error("Failed to create webhook", { error, teamId });
      throw error;
    }
  }

  // List webhooks for a team
  async listWebhooks(teamId: string): Promise<any[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { teamId },
      include: {
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return webhooks.map(webhook => ({
      ...webhook,
      signingSecret: undefined, // Don't expose secret
      deliveryCount: webhook._count.deliveries,
    }));
  }

  // Get webhook details
  async getWebhook(teamId: string, webhookId: string): Promise<any> {
    const webhook = await this.prisma.webhook.findFirst({
      where: {
        id: webhookId,
        teamId,
      },
      include: {
        deliveries: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    return {
      ...webhook,
      signingSecret: undefined, // Don't expose secret
    };
  }

  // Update webhook
  async updateWebhook(
    teamId: string,
    webhookId: string,
    data: {
      url?: string;
      events?: string[];
      description?: string;
      headers?: Record<string, string>;
      enabled?: boolean;
    }
  ): Promise<any> {
    // Verify ownership
    const webhook = await this.prisma.webhook.findFirst({
      where: {
        id: webhookId,
        teamId,
      },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    // Validate URL if provided
    if (data.url) {
      const parsedUrl = new URL(data.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Webhook URL must use HTTP or HTTPS protocol");
      }
    }

    const updated = await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        ...data,
        metadata: {
          ...(webhook.metadata as any),
          updatedAt: new Date(),
        },
      },
    });

    logger.info("Webhook updated", { webhookId, teamId });

    return {
      ...updated,
      signingSecret: undefined,
    };
  }

  // Delete webhook
  async deleteWebhook(teamId: string, webhookId: string): Promise<void> {
    // Verify ownership
    const webhook = await this.prisma.webhook.findFirst({
      where: {
        id: webhookId,
        teamId,
      },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    await this.prisma.webhook.delete({
      where: { id: webhookId },
    });

    logger.info("Webhook deleted", { webhookId, teamId });
  }

  // Test webhook endpoint
  async testWebhook(teamId: string, webhookId: string): Promise<any> {
    const webhook = await this.prisma.webhook.findFirst({
      where: {
        id: webhookId,
        teamId,
      },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const testEvent: WebhookEvent = {
      id: `test_${Date.now()}`,
      type: "webhook.test",
      teamId,
      data: {
        message: "This is a test webhook event",
        timestamp: new Date(),
      },
      timestamp: new Date(),
    };

    const delivery = await this.deliverWebhook(webhook, testEvent);

    return {
      success: delivery.status === "success",
      statusCode: delivery.statusCode,
      response: delivery.response,
      error: delivery.error,
    };
  }

  // Trigger webhook event
  async triggerEvent(event: WebhookEvent): Promise<void> {
    try {
      // Find all webhooks subscribed to this event type
      const webhooks = await this.prisma.webhook.findMany({
        where: {
          teamId: event.teamId,
          enabled: true,
          events: {
            has: event.type,
          },
        },
      });

      logger.info("Triggering webhook event", {
        eventType: event.type,
        teamId: event.teamId,
        webhookCount: webhooks.length,
      });

      // Deliver to all matching webhooks
      const deliveries = await Promise.allSettled(
        webhooks.map(webhook => this.deliverWebhook(webhook, event))
      );

      // Log results
      const successful = deliveries.filter(d => d.status === "fulfilled").length;
      const failed = deliveries.filter(d => d.status === "rejected").length;

      logger.info("Webhook event delivered", {
        eventType: event.type,
        successful,
        failed,
        total: webhooks.length,
      });
    } catch (error) {
      logger.error("Failed to trigger webhook event", { error, event });
    }
  }

  // Deliver webhook to endpoint
  private async deliverWebhook(
    webhook: any,
    event: WebhookEvent
  ): Promise<WebhookDelivery> {
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventId: event.id,
        eventType: event.type,
        status: "pending",
        attempts: 0,
        payload: event,
      },
    });

    try {
      const result = await this.attemptDelivery(webhook, event, delivery.id);
      return result;
    } catch (error) {
      logger.error("Failed to deliver webhook", {
        webhookId: webhook.id,
        eventId: event.id,
        error,
      });
      throw error;
    }
  }

  // Attempt webhook delivery
  private async attemptDelivery(
    webhook: any,
    event: WebhookEvent,
    deliveryId: string
  ): Promise<WebhookDelivery> {
    const stopTracking = performanceMonitor.startMeasure("webhook-delivery", {
      webhookId: webhook.id,
      eventType: event.type,
    });

    try {
      // Generate signature
      const signature = this.generateSignature(webhook.signingSecret, event);

      // Prepare headers
      const headers = {
        "Content-Type": "application/json",
        "X-Webhook-Id": webhook.id,
        "X-Webhook-Event": event.type,
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": event.timestamp.toISOString(),
        "User-Agent": "Cygni-Webhook/1.0",
        ...(webhook.headers as Record<string, string>),
      };

      // Make HTTP request
      const response = await axios.post(webhook.url, event, {
        headers,
        timeout: this.timeout,
        validateStatus: () => true, // Don't throw on any status
      });

      const success = response.status >= 200 && response.status < 300;

      // Update delivery record
      const delivery = await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: success ? "success" : "failed",
          statusCode: response.status,
          response: JSON.stringify(response.data).substring(0, 1000), // Limit response size
          attempts: { increment: 1 },
          completedAt: success ? new Date() : undefined,
          nextRetryAt: success ? undefined : this.calculateNextRetry(1),
        },
      });

      // Update webhook last delivery status
      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: success ? "success" : "failed",
        },
      });

      stopTracking();

      if (!success) {
        logger.warn("Webhook delivery failed", {
          webhookId: webhook.id,
          statusCode: response.status,
          url: webhook.url,
        });
      }

      return delivery;
    } catch (error: any) {
      stopTracking();

      // Update delivery record with error
      const delivery = await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "failed",
          error: error.message,
          attempts: { increment: 1 },
          nextRetryAt: this.calculateNextRetry(1),
        },
      });

      logger.error("Webhook delivery error", {
        webhookId: webhook.id,
        error: error.message,
        url: webhook.url,
      });

      return delivery;
    }
  }

  // Retry failed webhook deliveries
  async retryFailedDeliveries(): Promise<void> {
    const failedDeliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        status: "failed",
        attempts: { lt: this.maxRetries },
        nextRetryAt: { lte: new Date() },
      },
      include: {
        webhook: true,
      },
    });

    logger.info("Retrying failed webhook deliveries", {
      count: failedDeliveries.length,
    });

    for (const delivery of failedDeliveries) {
      if (!delivery.webhook.enabled) continue;

      try {
        const event = delivery.payload as WebhookEvent;
        await this.attemptDelivery(delivery.webhook, event, delivery.id);
      } catch (error) {
        logger.error("Failed to retry webhook delivery", {
          deliveryId: delivery.id,
          error,
        });
      }
    }
  }

  // Get webhook deliveries
  async getDeliveries(
    teamId: string,
    filters?: {
      webhookId?: string;
      status?: "pending" | "success" | "failed";
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<any[]> {
    const where: any = {
      webhook: { teamId },
    };

    if (filters?.webhookId) {
      where.webhookId = filters.webhookId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where,
      include: {
        webhook: {
          select: {
            id: true,
            url: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return deliveries;
  }

  // Helper methods

  private generateSigningSecret(): string {
    return `whsec_${crypto.randomBytes(32).toString("hex")}`;
  }

  private generateSignature(secret: string, event: WebhookEvent): string {
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac(this.signatureAlgorithm, secret)
      .update(payload)
      .digest("hex");
    return `${this.signatureAlgorithm}=${signature}`;
  }

  private calculateNextRetry(attempts: number): Date {
    const delayMs = this.retryDelays[Math.min(attempts - 1, this.retryDelays.length - 1)];
    return new Date(Date.now() + delayMs);
  }

  // Verify webhook signature (for incoming webhooks)
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const [algorithm, hash] = signature.split("=");
    if (!algorithm || !hash) return false;

    const expectedHash = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(expectedHash)
    );
  }
}

// Export singleton instance
let webhookService: WebhookService | null = null;

export function getWebhookService(prisma: PrismaClient): WebhookService {
  if (!webhookService) {
    webhookService = new WebhookService(prisma);
  }
  return webhookService;
}