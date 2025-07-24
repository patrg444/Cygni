import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { getWebhookService } from "../services/webhook/webhook.service";
import { WebhookEventTypes } from "../services/webhook/webhook-events";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    teamId: string;
    role: string;
  };
}

// GET /api/webhooks - List webhooks
router.get(
  "/webhooks",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const webhookService = getWebhookService(prisma);
      const webhooks = await webhookService.listWebhooks(authReq.user!.teamId);
      
      res.json({ webhooks });
    } catch (error) {
      logger.error("Failed to list webhooks", { error });
      res.status(500).json({ error: "Failed to list webhooks" });
    }
  }
);

// POST /api/webhooks - Create webhook
router.post(
  "/webhooks",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        url: z.string().url(),
        events: z.array(z.string()).min(1),
        description: z.string().optional(),
        headers: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Validate event types
      const validEvents = Object.values(WebhookEventTypes);
      const invalidEvents = data.events.filter(e => !validEvents.includes(e as any));
      
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          error: "Invalid event types",
          invalidEvents,
          validEvents,
        });
      }
      
      const webhookService = getWebhookService(prisma);
      const webhook = await webhookService.createWebhook(authReq.user!.teamId, data);
      
      res.status(201).json(webhook);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to create webhook", { error });
      res.status(500).json({ error: "Failed to create webhook" });
    }
  }
);

// GET /api/webhooks/:webhookId - Get webhook details
router.get(
  "/webhooks/:webhookId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { webhookId } = req.params;
    
    try {
      const webhookService = getWebhookService(prisma);
      const webhook = await webhookService.getWebhook(
        authReq.user!.teamId,
        webhookId
      );
      
      res.json(webhook);
    } catch (error: any) {
      if (error.message === "Webhook not found") {
        return res.status(404).json({ error: "Webhook not found" });
      }
      logger.error("Failed to get webhook", { error });
      res.status(500).json({ error: "Failed to get webhook" });
    }
  }
);

// PUT /api/webhooks/:webhookId - Update webhook
router.put(
  "/webhooks/:webhookId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { webhookId } = req.params;
    
    try {
      const schema = z.object({
        url: z.string().url().optional(),
        events: z.array(z.string()).min(1).optional(),
        description: z.string().optional(),
        headers: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Validate event types if provided
      if (data.events) {
        const validEvents = Object.values(WebhookEventTypes);
        const invalidEvents = data.events.filter(e => !validEvents.includes(e as any));
        
        if (invalidEvents.length > 0) {
          return res.status(400).json({
            error: "Invalid event types",
            invalidEvents,
            validEvents,
          });
        }
      }
      
      const webhookService = getWebhookService(prisma);
      const webhook = await webhookService.updateWebhook(
        authReq.user!.teamId,
        webhookId,
        data
      );
      
      res.json(webhook);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error.message === "Webhook not found") {
        return res.status(404).json({ error: "Webhook not found" });
      }
      logger.error("Failed to update webhook", { error });
      res.status(500).json({ error: "Failed to update webhook" });
    }
  }
);

// DELETE /api/webhooks/:webhookId - Delete webhook
router.delete(
  "/webhooks/:webhookId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { webhookId } = req.params;
    
    try {
      const webhookService = getWebhookService(prisma);
      await webhookService.deleteWebhook(authReq.user!.teamId, webhookId);
      
      res.json({ message: "Webhook deleted successfully" });
    } catch (error: any) {
      if (error.message === "Webhook not found") {
        return res.status(404).json({ error: "Webhook not found" });
      }
      logger.error("Failed to delete webhook", { error });
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  }
);

// POST /api/webhooks/:webhookId/test - Test webhook
router.post(
  "/webhooks/:webhookId/test",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { webhookId } = req.params;
    
    try {
      const webhookService = getWebhookService(prisma);
      const result = await webhookService.testWebhook(
        authReq.user!.teamId,
        webhookId
      );
      
      res.json(result);
    } catch (error: any) {
      if (error.message === "Webhook not found") {
        return res.status(404).json({ error: "Webhook not found" });
      }
      logger.error("Failed to test webhook", { error });
      res.status(500).json({ error: "Failed to test webhook" });
    }
  }
);

// GET /api/webhooks/deliveries - List webhook deliveries
router.get(
  "/webhooks/deliveries",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const {
        webhookId,
        status,
        eventType,
        startDate,
        endDate,
      } = req.query;
      
      const filters = {
        webhookId: webhookId as string | undefined,
        status: status as "pending" | "success" | "failed" | undefined,
        eventType: eventType as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };
      
      const webhookService = getWebhookService(prisma);
      const deliveries = await webhookService.getDeliveries(
        authReq.user!.teamId,
        filters
      );
      
      res.json({ deliveries });
    } catch (error) {
      logger.error("Failed to list webhook deliveries", { error });
      res.status(500).json({ error: "Failed to list webhook deliveries" });
    }
  }
);

// GET /api/webhooks/event-types - List available event types
router.get(
  "/webhooks/event-types",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    try {
      const eventTypes = Object.entries(WebhookEventTypes).map(([key, value]) => ({
        key,
        value,
        category: value.split(".")[0],
        description: getEventDescription(value),
      }));
      
      const categories = [...new Set(eventTypes.map(e => e.category))];
      
      res.json({
        eventTypes,
        categories,
      });
    } catch (error) {
      logger.error("Failed to list event types", { error });
      res.status(500).json({ error: "Failed to list event types" });
    }
  }
);

// Helper function to get event descriptions
function getEventDescription(eventType: string): string {
  const descriptions: Record<string, string> = {
    "deployment.created": "Triggered when a new deployment is created",
    "deployment.updated": "Triggered when a deployment status changes",
    "deployment.succeeded": "Triggered when a deployment completes successfully",
    "deployment.failed": "Triggered when a deployment fails",
    "deployment.cancelled": "Triggered when a deployment is cancelled",
    "project.created": "Triggered when a new project is created",
    "project.updated": "Triggered when a project is updated",
    "project.deleted": "Triggered when a project is deleted",
    "project.suspended": "Triggered when a project is suspended",
    "project.resumed": "Triggered when a project is resumed",
    "alert.triggered": "Triggered when an alert condition is met",
    "alert.resolved": "Triggered when an alert is resolved",
    "billing.payment_succeeded": "Triggered when a payment is successful",
    "billing.payment_failed": "Triggered when a payment fails",
    "billing.subscription_created": "Triggered when a subscription is created",
    "billing.subscription_updated": "Triggered when a subscription is updated",
    "billing.subscription_cancelled": "Triggered when a subscription is cancelled",
    "billing.usage_limit_exceeded": "Triggered when usage exceeds limits",
    "team.member_added": "Triggered when a team member is added",
    "team.member_removed": "Triggered when a team member is removed",
    "team.member_role_changed": "Triggered when a member's role changes",
    "security.alert": "Triggered for security-related events",
    "security.audit_log": "Triggered for audit log entries",
    "webhook.test": "Test event for webhook configuration",
  };
  
  return descriptions[eventType] || "No description available";
}

export { router as webhooksRouter };