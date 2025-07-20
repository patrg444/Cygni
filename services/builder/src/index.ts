import Fastify from "fastify";
import { logger } from "./lib/logger";
import buildsRoutes from "./routes/builds";
import { buildQueue, buildWorker } from "./services/queue";
import { prisma } from "./lib/prisma";

const app = Fastify({
  logger,
  requestIdHeader: "x-request-id",
  trustProxy: true,
});

const PORT = process.env.PORT || 3001; // Changed to 3001 to match API expectations

// Health checks
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

app.get("/ready", async () => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    const queueHealth = await buildQueue.getJobCounts();
    
    // Check worker status
    const workerRunning = buildWorker.isRunning();
    
    return {
      status: "ready",
      checks: {
        database: "ok",
        queue: "ok",
        worker: workerRunning ? "ok" : "not running",
      },
      queueStats: queueHealth,
    };
  } catch (error) {
    logger.error({ error }, "Readiness check failed");
    throw { statusCode: 503, message: "Service not ready" };
  }
});

// Metrics endpoint for Prometheus
app.get("/metrics", async (request, reply) => {
  const queueStats = await buildQueue.getJobCounts();
  
  // Return Prometheus-formatted metrics
  reply.type("text/plain");
  return `
# HELP cygni_builder_queue_jobs_total Total number of jobs in each state
# TYPE cygni_builder_queue_jobs_total gauge
cygni_builder_queue_jobs_total{state="waiting"} ${queueStats.waiting}
cygni_builder_queue_jobs_total{state="active"} ${queueStats.active}
cygni_builder_queue_jobs_total{state="completed"} ${queueStats.completed}
cygni_builder_queue_jobs_total{state="failed"} ${queueStats.failed}
cygni_builder_queue_jobs_total{state="delayed"} ${queueStats.delayed}

# HELP cygni_builder_worker_running Whether the worker is running
# TYPE cygni_builder_worker_running gauge
cygni_builder_worker_running ${buildWorker.isRunning() ? 1 : 0}
`;
});

// Register routes
app.register(buildsRoutes);

// Error handler
app.setErrorHandler((error, request, reply) => {
  logger.error({
    error,
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  }, "Request error");

  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: statusCode >= 500 ? "Internal Server Error" : error.message,
    requestId: request.id,
  });
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: Number(PORT), host: "0.0.0.0" });
    logger.info(`Builder service listening on port ${PORT}`);
  } catch (err) {
    logger.error(err, "Failed to start server");
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down");
  
  try {
    // Stop accepting new requests
    await app.close();
    
    // Close worker gracefully
    await buildWorker.close();
    
    // Close database connection
    await prisma.$disconnect();
    
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
