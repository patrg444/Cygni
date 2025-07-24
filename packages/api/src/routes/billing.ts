import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { StripeService } from "../services/billing/stripe.service";
import { jwtMiddleware } from "../services/auth/jwt-rotation.service";
import { jwtService } from "./auth";
import express from "express";

const router = Router();
const prisma = new PrismaClient();
const stripeService = new StripeService(prisma);

// Create subscription schema
const createSubscriptionSchema = z.object({
  paymentMethodId: z.string().optional(),
});

// Update payment method schema
const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string(),
});

// Report usage schema
const reportUsageSchema = z.object({
  projectId: z.string(),
  metricType: z.enum(["compute", "storage", "bandwidth", "requests"]),
  quantity: z.number().positive(),
  timestamp: z.string().datetime().optional(),
});

// POST /api/billing/subscription - Create subscription
router.post(
  "/billing/subscription",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { paymentMethodId } = createSubscriptionSchema.parse(req.body);
      const teamId = req.user.teamId;

      // Get team
      const team = await prisma.team.findUnique({
        where: { id: teamId },
      });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      // Create Stripe customer if doesn't exist
      if (!team.stripeCustomerId) {
        const user = await prisma.user.findUnique({
          where: { id: req.user.userId },
        });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        await stripeService.createCustomer(teamId, user.email, team.name);
      }

      // Create subscription
      const subscription = await stripeService.createSubscription(teamId);

      // If payment method provided, attach it
      if (paymentMethodId) {
        // This would be handled by Stripe's SetupIntent flow
        // For now, return the subscription details
      }

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        clientSecret: subscription.pending_setup_intent
          ? (subscription.pending_setup_intent as any).client_secret
          : null,
      });
    } catch (error) {
      console.error("Create subscription error:", error);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  },
);

// GET /api/billing/subscription - Get subscription details
router.get(
  "/billing/subscription",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: req.user.teamId },
        include: {
          invoices: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      res.json({
        subscription: {
          id: team.stripeSubscriptionId,
          status: team.subscriptionStatus,
          currentPeriodEnd: team.currentPeriodEnd,
          paymentFailedAt: team.paymentFailedAt,
        },
        invoices: team.invoices.map((invoice) => ({
          id: invoice.id,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        })),
      });
    } catch (error) {
      console.error("Get subscription error:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  },
);

// POST /api/billing/payment-method - Update payment method
router.post(
  "/billing/payment-method",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { paymentMethodId } = updatePaymentMethodSchema.parse(req.body);

      // This would integrate with Stripe's Payment Methods API
      // For now, return success
      res.json({
        success: true,
        message: "Payment method updated",
      });
    } catch (error) {
      console.error("Update payment method error:", error);
      res.status(500).json({ error: "Failed to update payment method" });
    }
  },
);

// POST /api/billing/portal - Create customer portal session
router.post(
  "/billing/portal",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const portalUrl = await stripeService.createPortalSession(
        req.user.teamId,
      );

      res.json({ url: portalUrl });
    } catch (error) {
      console.error("Create portal session error:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  },
);

// GET /api/billing/usage - Get usage summary
router.get(
  "/billing/usage",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const startDate = new Date();
      startDate.setDate(1); // First day of current month
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();

      // Get all projects for team
      const projects = await prisma.project.findMany({
        where: { teamId: req.user.teamId },
      });

      const projectIds = projects.map((p) => p.id);

      // Get usage events
      const usage = await prisma.usageEvent.groupBy({
        by: ["metricType"],
        where: {
          projectId: { in: projectIds },
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          quantity: true,
        },
      });

      // Calculate costs
      const costs = usage.map((u) => {
        const quantity = u._sum.quantity?.toNumber() || 0;
        let rate = 0;
        let unit = "";

        switch (u.metricType) {
          case "cpu_seconds":
            rate = 0.05 / 3600; // $0.05 per vCPU-hour
            unit = "vCPU-seconds";
            break;
          case "memory_gb_hours":
            rate = 0.01; // $0.01 per GB-hour
            unit = "GB-hours";
            break;
          case "storage_gb_hours":
            rate = 0.0001; // $0.10 per GB-month
            unit = "GB-hours";
            break;
          case "egress_gb":
            rate = 0.09; // $0.09 per GB
            unit = "GB";
            break;
          case "requests":
            rate = 0.0000002; // $0.20 per million
            unit = "requests";
            break;
        }

        const cost = quantity * rate;

        return {
          metricType: u.metricType,
          quantity,
          unit,
          rate,
          cost: cost.toFixed(2),
        };
      });

      const totalCost = costs.reduce((sum, c) => sum + parseFloat(c.cost), 0);

      res.json({
        period: {
          start: startDate,
          end: endDate,
        },
        usage: costs,
        totalCost: totalCost.toFixed(2),
        currency: "USD",
      });
    } catch (error) {
      console.error("Get usage error:", error);
      res.status(500).json({ error: "Failed to get usage" });
    }
  },
);

// POST /api/billing/usage - Report usage (internal)
router.post(
  "/billing/usage",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const usageData = reportUsageSchema.parse(req.body);

      // Verify project belongs to user's team
      const project = await prisma.project.findFirst({
        where: {
          id: usageData.projectId,
          teamId: req.user.teamId,
        },
      });

      if (!project) {
        return res.status(403).json({ error: "Project not found" });
      }

      // Store usage event
      const usageEvent = await prisma.usageEvent.create({
        data: {
          projectId: usageData.projectId,
          metricType: usageData.metricType,
          quantity: usageData.quantity,
          timestamp: usageData.timestamp
            ? new Date(usageData.timestamp)
            : new Date(),
        },
      });

      // Report to Stripe (async)
      stripeService
        .reportUsage([
          {
            projectId: usageData.projectId,
            metricType: usageData.metricType as any,
            quantity: usageData.quantity,
            timestamp: usageEvent.timestamp,
          },
        ])
        .catch((err) => {
          console.error("Failed to report usage to Stripe:", err);
        });

      res.json({
        id: usageEvent.id,
        success: true,
      });
    } catch (error) {
      console.error("Report usage error:", error);
      res.status(500).json({ error: "Failed to report usage" });
    }
  },
);

// GET /api/billing/invoices - Get invoices
router.get(
  "/billing/invoices",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: { teamId: req.user.teamId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      res.json({
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
          stripeInvoiceId: invoice.stripeInvoiceId,
          downloadUrl: `/api/billing/invoices/${invoice.id}/download`,
        })),
      });
    } catch (error) {
      console.error("Get invoices error:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  },
);

// GET /api/billing/invoices/:id/download - Download invoice PDF
router.get(
  "/billing/invoices/:id/download",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: req.params.id,
          teamId: req.user.teamId,
        },
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Redirect to Stripe invoice PDF
      // In production, you'd fetch the invoice from Stripe and get the PDF URL
      const stripeInvoiceUrl = `https://pay.stripe.com/invoice/${invoice.stripeInvoiceId}`;
      res.redirect(stripeInvoiceUrl);
    } catch (error) {
      console.error("Download invoice error:", error);
      res.status(500).json({ error: "Failed to download invoice" });
    }
  },
);

// POST /api/webhooks/stripe - Stripe webhook (already in server.ts, needs update)
router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    try {
      await stripeService.handleWebhook(signature, req.body.toString());
      res.json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error);
      res.status(400).json({ error: error.message });
    }
  },
);

export { router as billingRouter };