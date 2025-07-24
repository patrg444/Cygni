import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { AlertManager } from "../services/alerting/alert-manager";
import { defaultAlertRules } from "../services/alerting/alert-rules";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();
const alertManager = new AlertManager(prisma);

// Start alert manager
alertManager.start(30); // Evaluate every 30 seconds

// Webhook validation schemas
const pagerDutyWebhookSchema = z.object({
  event: z.object({
    id: z.string(),
    event_type: z.string(),
    resource: z.array(z.any()).optional(),
    occurred_at: z.string(),
    agent: z.any().optional(),
    client: z.any().optional(),
    data: z.any(),
  }),
});

const opsGenieWebhookSchema = z.object({
  action: z.string(),
  alert: z.object({
    alertId: z.string(),
    message: z.string(),
    tags: z.array(z.string()).optional(),
    details: z.record(z.string()).optional(),
  }),
});

// GET /api/alerts - Get active alerts
router.get(
  "/alerts",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const alerts = await alertManager.getActiveAlerts();
      
      res.json({
        alerts,
        count: alerts.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get alerts", { error });
      res.status(500).json({ error: "Failed to get alerts" });
    }
  }
);

// GET /api/alerts/rules - Get configured alert rules
router.get(
  "/alerts/rules",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const severity = req.query.severity as string;
      const component = req.query.component as string;
      
      let rules = defaultAlertRules;
      
      if (severity) {
        rules = rules.filter(r => r.severity === severity);
      }
      
      if (component) {
        rules = rules.filter(r => r.labels.component === component);
      }
      
      res.json({
        rules,
        count: rules.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get alert rules", { error });
      res.status(500).json({ error: "Failed to get alert rules" });
    }
  }
);

// POST /api/alerts/:alertId/acknowledge - Acknowledge an alert
router.post(
  "/alerts/:alertId/acknowledge",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { alertId } = req.params;
      
      await alertManager.acknowledgeAlert(alertId, req.user.email);
      
      req.logger?.info("Alert acknowledged", {
        alertId,
        user: req.user.email,
      });
      
      res.json({ message: "Alert acknowledged" });
    } catch (error) {
      req.logger?.error("Failed to acknowledge alert", {
        alertId: req.params.alertId,
        error,
      });
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  }
);

// GET /api/alerts/:alertId/history - Get alert history
router.get(
  "/alerts/:alertId/history",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { alertId } = req.params;
      
      const history = await alertManager.getAlertHistory(alertId);
      
      res.json({
        alertId,
        events: history,
      });
    } catch (error) {
      req.logger?.error("Failed to get alert history", {
        alertId: req.params.alertId,
        error,
      });
      res.status(500).json({ error: "Failed to get alert history" });
    }
  }
);

// POST /api/alerts/test - Test an alert rule
router.post(
  "/alerts/test",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only allow admins to test alerts
      if (req.user.role !== "owner" && req.user.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const { ruleId } = req.body;
      
      const rule = defaultAlertRules.find(r => r.id === ruleId);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      const result = await alertManager.testRule(rule);
      
      res.json({
        rule: {
          id: rule.id,
          name: rule.name,
          severity: rule.severity,
        },
        result,
      });
    } catch (error) {
      req.logger?.error("Failed to test alert", { error });
      res.status(500).json({ error: "Failed to test alert" });
    }
  }
);

// Webhook endpoints for alert providers

// POST /api/webhooks/pagerduty - PagerDuty webhook
router.post("/webhooks/pagerduty", async (req: Request, res: Response) => {
  try {
    const webhook = pagerDutyWebhookSchema.parse(req.body);
    
    logger.info("PagerDuty webhook received", {
      eventType: webhook.event.event_type,
      eventId: webhook.event.id,
    });
    
    // Handle different event types
    switch (webhook.event.event_type) {
      case "incident.acknowledged":
        // Handle acknowledgment
        break;
      case "incident.resolved":
        // Handle resolution
        break;
      case "incident.triggered":
        // Handle new incident
        break;
    }
    
    res.json({ status: "ok" });
  } catch (error) {
    logger.error("PagerDuty webhook error", { error });
    res.status(400).json({ error: "Invalid webhook payload" });
  }
});

// POST /api/webhooks/opsgenie - OpsGenie webhook
router.post("/webhooks/opsgenie", async (req: Request, res: Response) => {
  try {
    // Verify webhook authentication if configured
    const authHeader = req.headers["opsgenie-webhook-auth"];
    if (process.env.OPSGENIE_WEBHOOK_SECRET && authHeader !== process.env.OPSGENIE_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook authentication" });
    }
    
    const webhook = opsGenieWebhookSchema.parse(req.body);
    
    logger.info("OpsGenie webhook received", {
      action: webhook.action,
      alertId: webhook.alert.alertId,
    });
    
    // Handle different actions
    switch (webhook.action) {
      case "Acknowledge":
        // Handle acknowledgment
        break;
      case "Close":
        // Handle resolution
        break;
      case "Create":
        // Handle new alert
        break;
    }
    
    res.json({ status: "ok" });
  } catch (error) {
    logger.error("OpsGenie webhook error", { error });
    res.status(400).json({ error: "Invalid webhook payload" });
  }
});

// Health check for alert system
router.get(
  "/alerts/health",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const activeAlerts = await alertManager.getActiveAlerts();
      const criticalAlerts = activeAlerts.filter(a => a.severity === "critical");
      const warningAlerts = activeAlerts.filter(a => a.severity === "warning");
      
      res.json({
        status: criticalAlerts.length > 0 ? "critical" : warningAlerts.length > 0 ? "warning" : "healthy",
        activeAlerts: activeAlerts.length,
        criticalAlerts: criticalAlerts.length,
        warningAlerts: warningAlerts.length,
        rules: {
          total: defaultAlertRules.length,
          enabled: defaultAlertRules.filter(r => r.enabled).length,
        },
      });
    } catch (error) {
      req.logger?.error("Failed to get alert health", { error });
      res.status(500).json({ error: "Failed to get alert health" });
    }
  }
);

export { router as alertsRouter };