import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { validateEnv } from "./config/env.validation";
import logger from "./lib/logger";
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  performanceLoggingMiddleware,
  securityLoggingMiddleware,
  deploymentLoggingMiddleware,
  databaseLoggingMiddleware,
} from "./middleware/logging.middleware";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import metricsRegistry, { startSystemMetricsCollection } from "./lib/metrics";
import { MetricsCollectorService } from "./services/metrics/metrics-collector.service";
import { RateLimitMetricsCollector } from "./services/metrics/rate-limit-metrics-collector";
import { getAuditRetentionService } from "./services/audit/audit-retention.service";
import { getDataRetentionService } from "./services/compliance/data-retention.service";
import { getSecurityEventMonitor } from "./services/security/security-event-monitor.service";
import { initializeSentry, getSentryHandlers } from "./lib/sentry";
import { performanceMiddleware } from "./lib/performance";
import { getWebhookService } from "./services/webhook/webhook.service";

// Import routes
import { authRouter, jwtService } from "./routes/auth";
import waitlistRouter from "./routes/waitlist";
import { billingRouter } from "./routes/billing";
import { usageRouter } from "./routes/usage";
import { subscriptionsRouter } from "./routes/subscriptions";
import { logsRouter } from "./routes/logs";
import { alertsRouter } from "./routes/alerts";
import { rateLimitRouter } from "./routes/rate-limit";
import { auditRouter } from "./routes/audit";
import { oauthRouter } from "./routes/oauth";
import { teamRouter } from "./routes/team";
import { permissionsRouter } from "./routes/permissions";
import { complianceRouter } from "./routes/compliance";
import { performanceRouter } from "./routes/performance";
import { onboardingRouter } from "./routes/onboarding";
import { versionRouter } from "./routes/version";
import { webhooksRouter } from "./routes/webhooks";
import { samlRoutes } from "./routes/auth/saml.routes";

// Import middleware
import { jwtMiddleware } from "./services/auth/jwt-rotation.service";
import { teamLoaderMiddleware } from "./middleware/team-loader.middleware";
import { rateLimiterService } from "./services/rate-limit/rate-limiter.service";
import { auditMiddleware } from "./middleware/audit.middleware";
import { apiVersionMiddleware } from "./middleware/api-version.middleware";
import { v1Router } from "./routes/v1";
import { v2Router } from "./routes/v2";

export function createServer() {
  // Validate environment first
  validateEnv();

  const app = express();
  const prisma = new PrismaClient();

  // Initialize Sentry error tracking
  initializeSentry(app);
  
  // Initialize database logging
  databaseLoggingMiddleware(prisma);

  // Start metrics collection
  startSystemMetricsCollection();
  const metricsCollector = new MetricsCollectorService(prisma);
  metricsCollector.startCollection();
  const rateLimitMetricsCollector = new RateLimitMetricsCollector(prisma);
  rateLimitMetricsCollector.startCollection();
  
  // Start audit retention service
  const auditRetentionService = getAuditRetentionService(prisma);
  auditRetentionService.startRetentionJob();
  
  // Start data retention service
  const dataRetentionService = getDataRetentionService(prisma);
  dataRetentionService.startRetentionJobs();
  
  // Initialize security event monitor
  getSecurityEventMonitor(prisma);
  
  // Initialize webhook service and start retry job
  const webhookService = getWebhookService(prisma);
  // Retry failed webhook deliveries every 5 minutes
  setInterval(() => {
    webhookService.retryFailedDeliveries().catch(err => 
      logger.error("Failed to retry webhook deliveries", { error: err })
    );
  }, 5 * 60 * 1000);

  // Get Sentry handlers
  const sentryHandlers = getSentryHandlers();
  
  // Middleware - order matters!
  app.use(sentryHandlers.requestHandler); // Sentry request handler must be first
  app.use(sentryHandlers.tracingHandler); // Sentry tracing
  app.use(performanceMiddleware()); // Performance monitoring
  app.use(requestLoggingMiddleware); // Request logging
  app.use(metricsMiddleware); // Collect HTTP metrics
  app.use(performanceLoggingMiddleware(1000)); // Log requests over 1s
  app.use(securityLoggingMiddleware);
  app.use(deploymentLoggingMiddleware);
  
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Apply rate limiting globally (after body parsing, before routes)
  app.use(rateLimiterService.getMiddleware());
  
  // Apply audit logging middleware globally
  app.use(auditMiddleware);
  
  // Apply API versioning middleware
  app.use(apiVersionMiddleware);

  // Metrics endpoint (no auth required for Prometheus scraping)
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", metricsRegistry.contentType);
      const metrics = await metricsRegistry.metrics();
      res.end(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to collect metrics" });
    }
  });

  // Health check endpoints
  app.get("/api/health", async (req, res) => {
    const deep = req.query.deep === "true";

    const health: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      uptime: process.uptime(),
    };

    if (deep) {
      // Check database
      try {
        const startTime = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        health.database = {
          status: "connected",
          latency: Date.now() - startTime,
        };
      } catch (error) {
        health.database = {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
        health.status = "degraded";
      }

      // Check Redis (if configured)
      health.redis = process.env.REDIS_URL ? "configured" : "not configured";

      // Check Stripe
      health.stripe = process.env.STRIPE_SECRET_KEY
        ? "configured"
        : "not configured";

      // Add memory usage
      const memUsage = process.memoryUsage();
      health.memory = {
        rss: Math.round(memUsage.rss / 1024 / 1024) + " MB",
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + " MB",
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + " MB",
      };

      // Add CPU usage
      const cpuUsage = process.cpuUsage();
      health.cpu = {
        user: Math.round(cpuUsage.user / 1000) + " ms",
        system: Math.round(cpuUsage.system / 1000) + " ms",
      };
    }

    res.status(health.status === "healthy" ? 200 : 503).json(health);
  });

  // Version info endpoints (no auth required)
  app.use("/api", versionRouter);
  
  // Version-specific routes
  app.use("/api/v1", v1Router);
  app.use("/api/v2", v2Router);
  
  // Legacy routes (default to v1 for backward compatibility)
  app.use("/api", waitlistRouter);
  app.use("/api", authRouter);
  app.use("/api", oauthRouter);
  app.use("/api", samlRoutes);

  // Protected routes - Apply team loader middleware for authenticated routes
  app.use("/api", teamLoaderMiddleware, billingRouter);
  app.use("/api", teamLoaderMiddleware, usageRouter);
  app.use("/api", teamLoaderMiddleware, subscriptionsRouter);
  app.use("/api", teamLoaderMiddleware, logsRouter);
  app.use("/api", teamLoaderMiddleware, alertsRouter);
  app.use("/api", teamLoaderMiddleware, rateLimitRouter);
  app.use("/api", teamLoaderMiddleware, auditRouter);
  app.use("/api", teamLoaderMiddleware, teamRouter);
  app.use("/api", teamLoaderMiddleware, permissionsRouter);
  app.use("/api", teamLoaderMiddleware, complianceRouter);
  app.use("/api", teamLoaderMiddleware, performanceRouter);
  app.use("/api", teamLoaderMiddleware, onboardingRouter);
  app.use("/api", teamLoaderMiddleware, webhooksRouter);
  
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
    async (req: any, res) => {
      try {
        const { projectId } = req.params;

        // Verify project belongs to user's team
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            teamId: req.user.teamId,
          },
        });

        if (!project) {
          return res.status(403).json({ error: "Project not found" });
        }

        // Get current month usage
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const usage = await prisma.usageEvent.groupBy({
          by: ["metricType"],
          where: {
            projectId,
            timestamp: { gte: startDate },
          },
          _sum: {
            quantity: true,
          },
        });

        // Calculate costs
        let totalCost = 0;
        const breakdown: any = {};

        for (const item of usage) {
          const quantity = item._sum.quantity?.toNumber() || 0;
          let cost = 0;

          switch (item.metricType) {
            case "cpu_seconds":
              cost = quantity * (0.05 / 3600);
              breakdown.compute = { 
                cost: cost.toFixed(2), 
                cpuHours: (quantity / 3600).toFixed(2) 
              };
              break;
            case "memory_gb_hours":
              cost = quantity * 0.01;
              if (!breakdown.compute) breakdown.compute = { cost: "0.00", cpuHours: "0" };
              breakdown.compute.cost = (parseFloat(breakdown.compute.cost) + cost).toFixed(2);
              break;
            case "storage_gb_hours":
              cost = quantity * 0.0001;
              breakdown.storage = { 
                cost: cost.toFixed(2), 
                gbHours: quantity.toFixed(2) 
              };
              break;
            case "egress_gb":
              cost = quantity * 0.09;
              breakdown.bandwidth = { 
                cost: cost.toFixed(2), 
                egressGB: quantity.toFixed(2) 
              };
              break;
          }

          totalCost += cost;
        }

        const limit = parseFloat(process.env.DEFAULT_BUDGET_LIMIT || "100");
        const percentUsed = (totalCost / limit) * 100;
        
        res.json({
          projectId,
          used: totalCost,
          limit,
          remaining: Math.max(0, limit - totalCost),
          percentUsed,
          status: percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "healthy",
          breakdown,
        });
      } catch (error) {
        req.logger?.error("Failed to get budget status", { 
          error: error instanceof Error ? error.message : error,
          projectId: req.params.projectId 
        });
        res.status(500).json({ error: "Failed to get budget status" });
      }
    },
  );


  // 404 handler - must be before error handler
  app.use((req, res) => {
    req.logger?.warn("Endpoint not found", { 
      path: req.path,
      method: req.method 
    });
    res.status(404).json({ error: "Endpoint not found" });
  });

  // Error logging middleware - must be before Sentry
  app.use(errorLoggingMiddleware);
  
  // Sentry error handler - must be before other error handlers
  app.use(sentryHandlers.errorHandler);
  
  // Error handling - must be last
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      // Don't log again - already logged by errorLoggingMiddleware
      res.status(err.status || 500).json({
        error: err.message || "Internal server error",
        requestId: req.headers["x-request-id"],
      });
    },
  );

  logger.info("Server initialized", {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT || 4000,
    corsOrigin: process.env.CORS_ORIGIN || "*",
  });

  return app;
}
