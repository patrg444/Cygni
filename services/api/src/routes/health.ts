import { FastifyPluginAsync } from "fastify";
import { prisma } from "../utils/prisma";
import Redis from "ioredis";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Basic health check
  app.get("/health", async (_request, _reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "unknown",
    };
  });

  // Readiness check - verifies all dependencies are available
  app.get("/ready", async (_request, reply) => {
    const checks = {
      database: "checking",
      redis: "checking",
    };

    try {
      // Check database
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "healthy";
    } catch (error) {
      checks.database = "unhealthy";
      app.log.error({ error }, "Database health check failed");
    }

    try {
      // Check Redis
      const redis = new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      await redis.ping();
      checks.redis = "healthy";
      await redis.quit();
    } catch (error) {
      checks.redis = "unhealthy";
      app.log.error({ error }, "Redis health check failed");
    }

    const allHealthy = Object.values(checks).every(
      (status) => status === "healthy",
    );

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? "ready" : "not ready",
      checks,
    });
  });

  // Liveness check - simple check to verify the service is running
  app.get("/live", async (_request, _reply) => {
    return {
      status: "alive",
      timestamp: new Date().toISOString(),
    };
  });
};
