import { logger } from "./lib/logger";
import { buildWorker } from "./services/queue";
import { prisma } from "./lib/prisma";
import * as http from "http";

// Worker-specific configuration
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

logger.info({ workerId: WORKER_ID }, "Starting build worker");

// Health check endpoint for container orchestrators
if (process.env.HEALTH_CHECK_PORT) {
  const healthServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      const isHealthy = buildWorker.isRunning();
      res.statusCode = isHealthy ? 200 : 503;
      res.end(
        JSON.stringify({
          status: isHealthy ? "ok" : "unhealthy",
          workerId: WORKER_ID,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  const port = parseInt(process.env.HEALTH_CHECK_PORT);
  healthServer.listen(port, () => {
    logger.info({ port }, "Worker health check server started");
  });
}

// Worker lifecycle events
buildWorker.on("completed", (job) => {
  logger.info(
    {
      workerId: WORKER_ID,
      jobId: job.id,
      buildId: job.data.buildId,
      returnValue: job.returnvalue,
    },
    "Job completed",
  );
});

buildWorker.on("failed", (job, error) => {
  logger.error(
    {
      workerId: WORKER_ID,
      jobId: job?.id,
      buildId: job?.data.buildId,
      error: error.message,
      stack: error.stack,
    },
    "Job failed",
  );
});

buildWorker.on("active", (job) => {
  logger.info(
    {
      workerId: WORKER_ID,
      jobId: job.id,
      buildId: job.data.buildId,
    },
    "Job started",
  );
});

buildWorker.on("stalled", (jobId) => {
  logger.warn(
    {
      workerId: WORKER_ID,
      jobId,
    },
    "Job stalled",
  );
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal, workerId: WORKER_ID }, "Shutting down worker");

  try {
    // Stop processing new jobs
    await buildWorker.close();

    // Close database connection
    await prisma.$disconnect();

    logger.info({ workerId: WORKER_ID }, "Worker shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error(
      { error, workerId: WORKER_ID },
      "Error during worker shutdown",
    );
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.fatal({ error, workerId: WORKER_ID }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise, workerId: WORKER_ID }, "Unhandled rejection");
  process.exit(1);
});
