import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { BuildStatus } from "../types/build";
import { KanikoBuilder } from "./kaniko-builder";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

// Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

// Build queue
export const buildQueue = new Queue("builds", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
      age: 7 * 24 * 3600, // Keep for 7 days
    },
  },
});

// Build worker
export const buildWorker = new Worker(
  "builds",
  async (job: Job) => {
    const { buildId, projectId, repoUrl, commitSha, branch, dockerfilePath, buildArgs } = job.data;

    logger.info({ buildId, projectId }, "Starting build job");

    try {
      // Update build status to running
      await prisma.build.update({
        where: { id: buildId },
        data: { status: BuildStatus.RUNNING },
      });

      // Initialize Kaniko builder
      const kanikoBuilder = new KanikoBuilder(
        process.env.ECR_REPOSITORY_URI || "",
        process.env.K8S_NAMESPACE || "cygni-builds"
      );

      // Execute build
      const result = await kanikoBuilder.build({
        buildId,
        gitUrl: repoUrl,
        gitRef: commitSha,
        contextPath: ".",
        dockerfilePath: dockerfilePath || "Dockerfile",
        buildArgs,
        cacheKey: `${projectId}-${branch}`,
      });

      // Update build with success
      await prisma.build.update({
        where: { id: buildId },
        data: {
          status: BuildStatus.SUCCESS,
          imageUrl: result.imageUrl,
          logs: result.logs,
          metadata: {
            ...(await prisma.build.findUnique({ where: { id: buildId } }))?.metadata,
            imageSha: result.imageSha,
            buildDuration: result.duration,
          },
        },
      });

      // Notify API service about build completion
      if (process.env.API_SERVICE_URL) {
        try {
          await fetch(`${process.env.API_SERVICE_URL}/internal/builds/complete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": process.env.INTERNAL_SECRET || "",
            },
            body: JSON.stringify({
              buildId,
              projectId,
              status: BuildStatus.SUCCESS,
              imageUrl: result.imageUrl,
              imageSha: result.imageSha,
            }),
          });
        } catch (error) {
          logger.error({ error, buildId }, "Failed to notify API service");
        }
      }

      logger.info({ buildId, imageUrl: result.imageUrl }, "Build completed successfully");

      return {
        success: true,
        imageUrl: result.imageUrl,
        imageSha: result.imageSha,
      };
    } catch (error) {
      logger.error({ error, buildId }, "Build failed");

      // Update build with failure
      await prisma.build.update({
        where: { id: buildId },
        data: {
          status: BuildStatus.FAILED,
          logs: error instanceof Error ? error.message : "Build failed",
        },
      });

      // Notify API service about build failure
      if (process.env.API_SERVICE_URL) {
        try {
          await fetch(`${process.env.API_SERVICE_URL}/internal/builds/complete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": process.env.INTERNAL_SECRET || "",
            },
            body: JSON.stringify({
              buildId,
              projectId,
              status: BuildStatus.FAILED,
              error: error instanceof Error ? error.message : "Build failed",
            }),
          });
        } catch (notifyError) {
          logger.error({ notifyError, buildId }, "Failed to notify API service");
        }
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: parseInt(process.env.BUILD_CONCURRENCY || "5"),
    autorun: true,
  }
);

// Queue event handlers
buildQueue.on("completed", (job) => {
  logger.info({ jobId: job.id, buildId: job.data.buildId }, "Build job completed");
});

buildQueue.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, buildId: job?.data.buildId, error: err }, "Build job failed");
});

// Worker event handlers
buildWorker.on("ready", () => {
  logger.info("Build worker ready");
});

buildWorker.on("error", (err) => {
  logger.error({ error: err }, "Build worker error");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing worker");
  await buildWorker.close();
  await connection.quit();
  process.exit(0);
});