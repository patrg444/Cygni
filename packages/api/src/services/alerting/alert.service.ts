import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import {
  Alert,
  AlertRule,
  AlertStatus,
  NotificationChannel,
  AlertNotification,
  AlertEvent,
  AlertProvider,
} from "./types";
import { PagerDutyProvider } from "./providers/pagerduty.provider";
import { OpsGenieProvider } from "./providers/opsgenie.provider";
import { WebhookProvider } from "./providers/webhook.provider";
import logger from "../../lib/logger";
import { recordError, recordAlert, recordAlertNotification } from "../../lib/metrics";

export class AlertService {
  private prisma: PrismaClient;
  private providers: Map<AlertProvider, any>;
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Map<string, AlertEvent[]> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.providers = new Map([
      ["pagerduty", new PagerDutyProvider()],
      ["opsgenie", new OpsGenieProvider()],
      ["webhook", new WebhookProvider()],
    ]);
  }

  async createAlert(
    rule: AlertRule,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<Alert> {
    const fingerprint = this.generateFingerprint(rule, labels);
    
    // Check if alert already exists
    const existingAlert = this.activeAlerts.get(fingerprint);
    if (existingAlert && existingAlert.status === "firing") {
      return existingAlert;
    }

    const alert: Alert = {
      id: crypto.randomUUID(),
      name: rule.name,
      severity: rule.severity,
      status: "firing",
      message: this.interpolateTemplate(rule.annotations.summary, { value, ...labels }),
      description: rule.annotations.description
        ? this.interpolateTemplate(rule.annotations.description, { value, ...labels })
        : undefined,
      source: "cygni-metrics",
      metric: rule.metric,
      value,
      threshold: rule.condition.value,
      tags: { ...rule.labels, ...labels },
      startsAt: new Date(),
      fingerprint,
      generatorURL: this.buildGeneratorURL(rule, labels),
    };

    // Store alert
    this.activeAlerts.set(fingerprint, alert);
    this.addEvent(alert.id, "created");

    // Record metrics
    recordAlert(alert.severity, alert.name);

    // Send notifications
    await this.sendNotifications(alert, rule.notificationChannels);

    logger.info("Alert created", {
      alertId: alert.id,
      name: alert.name,
      severity: alert.severity,
      value,
    });

    return alert;
  }

  async resolveAlert(fingerprint: string): Promise<void> {
    const alert = this.activeAlerts.get(fingerprint);
    if (!alert || alert.status === "resolved") {
      return;
    }

    alert.status = "resolved";
    alert.endsAt = new Date();
    this.addEvent(alert.id, "resolved");

    // Get notification channels from the original rule
    const rule = await this.getRuleByName(alert.name);
    if (rule) {
      await this.sendNotifications(alert, rule.notificationChannels);
    }

    // Remove from active alerts after 5 minutes
    setTimeout(() => {
      this.activeAlerts.delete(fingerprint);
    }, 5 * 60 * 1000);

    logger.info("Alert resolved", {
      alertId: alert.id,
      name: alert.name,
      duration: alert.endsAt.getTime() - alert.startsAt.getTime(),
    });
  }

  async sendNotifications(
    alert: Alert,
    channelIds: string[]
  ): Promise<AlertNotification[]> {
    const notifications: AlertNotification[] = [];
    
    for (const channelId of channelIds) {
      const channel = await this.getNotificationChannel(channelId);
      if (!channel || !channel.enabled) {
        continue;
      }

      const provider = this.providers.get(channel.provider);
      if (!provider) {
        logger.error("Alert provider not found", { provider: channel.provider });
        continue;
      }

      try {
        const notification = await provider.send(alert, channel.config);
        notifications.push(notification);
        
        recordAlertNotification(channel.provider, notification.success);
        
        if (!notification.success) {
          recordError("alert_notification_failed", "warning");
        }
      } catch (error) {
        logger.error("Failed to send alert notification", {
          alertId: alert.id,
          channel: channel.name,
          error: error instanceof Error ? error.message : error,
        });
        recordAlertNotification(channel.provider, false);
        recordError("alert_notification_error", "error");
      }
    }

    return notifications;
  }

  async acknowledgeAlert(alertId: string, user?: string): Promise<void> {
    const alert = Array.from(this.activeAlerts.values()).find(a => a.id === alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }

    this.addEvent(alertId, "acknowledged", user);

    // Notify providers that support acknowledgment
    const rule = await this.getRuleByName(alert.name);
    if (rule) {
      for (const channelId of rule.notificationChannels) {
        const channel = await this.getNotificationChannel(channelId);
        if (!channel || !channel.enabled) continue;

        const provider = this.providers.get(channel.provider);
        if (provider && typeof provider.acknowledge === "function") {
          try {
            await provider.acknowledge(alert.fingerprint, channel.config);
          } catch (error) {
            logger.error("Failed to acknowledge alert in provider", {
              alertId,
              provider: channel.provider,
              error,
            });
          }
        }
      }
    }
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.activeAlerts.values());
  }

  async getAlertHistory(alertId: string): Promise<AlertEvent[]> {
    return this.alertHistory.get(alertId) || [];
  }

  // Private helper methods
  private generateFingerprint(rule: AlertRule, labels: Record<string, string>): string {
    const data = {
      rule: rule.id,
      labels: Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)),
    };
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  private interpolateTemplate(
    template: string,
    values: Record<string, any>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return values[key] !== undefined ? String(values[key]) : match;
    });
  }

  private buildGeneratorURL(rule: AlertRule, labels: Record<string, string>): string {
    const baseUrl = process.env.GRAFANA_URL || "http://localhost:3000";
    const params = new URLSearchParams({
      "var-rule": rule.name,
      ...labels,
    });
    return `${baseUrl}/d/alerts?${params.toString()}`;
  }

  private addEvent(
    alertId: string,
    type: AlertEvent["type"],
    user?: string,
    message?: string
  ): void {
    const event: AlertEvent = {
      type,
      alertId,
      timestamp: new Date(),
      user,
      message,
    };

    const events = this.alertHistory.get(alertId) || [];
    events.push(event);
    this.alertHistory.set(alertId, events);
  }

  private async getRuleByName(name: string): Promise<AlertRule | null> {
    // In a real implementation, this would fetch from database
    // For now, return a mock rule
    return null;
  }

  private async getNotificationChannel(id: string): Promise<NotificationChannel | null> {
    // In a real implementation, this would fetch from database
    // For now, return based on environment variables
    if (process.env.PAGERDUTY_INTEGRATION_KEY && id === "pagerduty-default") {
      return {
        id: "pagerduty-default",
        name: "PagerDuty Default",
        provider: "pagerduty",
        enabled: true,
        config: {
          integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
          severity: ["critical", "warning"],
        },
      };
    }

    if (process.env.OPSGENIE_API_KEY && id === "opsgenie-default") {
      return {
        id: "opsgenie-default",
        name: "OpsGenie Default",
        provider: "opsgenie",
        enabled: true,
        config: {
          apiKey: process.env.OPSGENIE_API_KEY,
          teamName: process.env.OPSGENIE_TEAM_NAME,
          priority: {
            critical: "P1",
            warning: "P3",
            info: "P5",
          },
        },
      };
    }

    return null;
  }
}