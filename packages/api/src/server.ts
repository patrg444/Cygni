import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { validateEnv } from "./config/env.validation";

// Import routes
import { authRouter, jwtService } from "./routes/auth";
import waitlistRouter from "./routes/waitlist";

// Import middleware
import { jwtMiddleware } from "./services/auth/jwt-rotation.service";

export function createServer() {
  // Validate environment first
  validateEnv();

  const app = express();
  const prisma = new PrismaClient();

  // Middleware
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoints
  app.get("/api/health", async (req, res) => {
    const deep = req.query.deep === "true";

    const health: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
    };

    if (deep) {
      // Check database
      try {
        await prisma.$queryRaw`SELECT 1`;
        health.database = "connected";
      } catch (error) {
        health.database = "error";
        health.status = "degraded";
      }

      // Check Redis (if configured)
      health.redis = process.env.REDIS_URL ? "configured" : "not configured";

      // Check Stripe
      health.stripe = process.env.STRIPE_SECRET_KEY
        ? "configured"
        : "not configured";
    }

    res.status(health.status === "healthy" ? 200 : 503).json(health);
  });

  // Public routes
  app.use("/api", waitlistRouter);
  app.use("/api", authRouter);

  // Protected routes
  app.get("/api/protected", jwtMiddleware(jwtService), (req, res) => {
    res.json({
      message: "This is a protected endpoint",
      user: (req as any).user,
    });
  });

  // Budget endpoint
  app.get(
    "/api/projects/:projectId/budget",
    jwtMiddleware(jwtService),
    async (req, res) => {
      try {
        const { projectId } = req.params;

        // Mock response for now
        res.json({
          projectId,
          used: 8.5,
          limit: 10.0,
          remaining: 1.5,
          percentUsed: 85,
          status: "warning",
          breakdown: {
            compute: { cost: "6.00", cpuHours: "166.67" },
            storage: { cost: "1.00", gbHours: "10000" },
            bandwidth: { cost: "1.50", egressGB: "16.67" },
          },
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to get budget status" });
      }
    },
  );

  // Stripe webhook
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (_req, res) => {
      // const signature = req.headers['stripe-signature'] as string;

      try {
        console.log("Stripe webhook received");

        // In production, verify signature and process event
        // const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

        res.json({ received: true });
      } catch (error) {
        console.error("Stripe webhook error:", error);
        res.status(400).json({ error: "Webhook processing failed" });
      }
    },
  );

  // Error handling
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Error:", err);
      res.status(err.status || 500).json({
        error: err.message || "Internal server error",
      });
    },
  );

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  return app;
}
