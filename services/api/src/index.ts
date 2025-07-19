import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { logger } from "./utils/logger";
import { registerRoutes } from "./routes";
import { authenticateUser } from "./middleware/auth";
import { prisma } from "./utils/prisma";
import { initializeDevelopmentEnv } from "./utils/dev-secrets";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authenticateUser;
  }
}

async function start() {
  // Initialize development secrets if needed
  await initializeDevelopmentEnv();
  const app = fastify({
    logger: logger,
    trustProxy: true,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
    bodyLimit: 1048576, // 1MB
  });

  // Register plugins
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  // Rate limiting configuration
  await app.register(rateLimit, {
    global: true,
    max: 100, // 100 requests
    timeWindow: "1 minute",
    cache: 10000, // Cache up to 10k IPs
    allowList: ["127.0.0.1"], // Whitelist localhost
    redis: config.redis.url ? config.redis.url : undefined, // Use Redis if available
    skipOnError: true, // Don't block requests if rate limiter fails
    keyGenerator: (request) => {
      // Use authenticated user ID if available, otherwise IP
      return request.auth?.user?.id || request.ip;
    },
    errorResponseBuilder: (_request, context) => {
      return {
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please retry after ${context.ttl} ms.`,
        statusCode: 429,
        date: Date.now(),
        expiresIn: context.ttl,
      };
    },
  });

  // Register auth decorator
  app.decorate("authenticate", authenticateUser);

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error({
      err: error,
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
      },
    });

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: "Validation Error",
        message: error.message,
        details: error.validation,
      });
    }

    // Handle JWT errors
    if (error.name === "JsonWebTokenError") {
      return reply.status(401).send({
        error: "Invalid Token",
        message: "The provided token is invalid",
      });
    }

    // Handle Prisma errors
    if (error.code === "P2025") {
      return reply.status(404).send({
        error: "Not Found",
        message: "The requested resource was not found",
      });
    }

    if (error.code === "P2002") {
      return reply.status(409).send({
        error: "Conflict",
        message: "A resource with this identifier already exists",
      });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const message = config.isProduction
      ? "An error occurred processing your request"
      : error.message;

    return reply.status(statusCode).send({
      error: error.name || "Internal Server Error",
      message,
      ...(config.isDevelopment && { stack: error.stack }),
    });
  });

  // Health check
  app.get("/health", async () => {
    // Check database connection
    const dbHealthy = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    return {
      status: dbHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      database: dbHealthy ? "connected" : "disconnected",
    };
  });

  // Ready check (for k8s)
  app.get("/ready", async (_request, reply) => {
    const dbHealthy = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    if (!dbHealthy) {
      return reply.status(503).send({ ready: false });
    }

    return { ready: true };
  });

  // Register application routes
  await registerRoutes(app as any);

  // Graceful shutdown
  const closeGracefully = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await app.close();
      await prisma.$disconnect();
      app.log.info("Server closed successfully");
      process.exit(0);
    } catch (err) {
      app.log.error("Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => closeGracefully("SIGTERM"));
  process.on("SIGINT", () => closeGracefully("SIGINT"));

  // Start server
  try {
    const address = await app.listen({
      port: config.port,
      host: "0.0.0.0",
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
