import { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { BuildStatus, BuildRequest } from "../types/build";
import { buildQueue } from "../services/queue";
import { prisma } from "../lib/prisma";
import { KanikoBuilder } from "../services/kaniko-builder";
import { authenticateApiKey, checkProjectAccess } from "../middleware/auth";

interface BuildParams {
  buildId: string;
}

interface BuildQuery {
  projectId?: string;
  status?: BuildStatus;
  limit?: number;
  offset?: number;
}

const buildsRoutes: FastifyPluginAsync = async (app) => {
  // Create a new build
  app.post<{ Body: BuildRequest }>(
    "/api/builds",
    {
      preHandler: [authenticateApiKey, checkProjectAccess],
    },
    async (request, reply) => {
      const {
        projectId,
        repoUrl,
        commitSha,
        branch,
        dockerfilePath,
        buildArgs,
      } = request.body;

      // Validate required fields
      if (!projectId) {
        return reply.status(400).send({ error: "projectId is required" });
      }
      if (!repoUrl) {
        return reply.status(400).send({ error: "repoUrl is required" });
      }
      if (!commitSha) {
        return reply.status(400).send({ error: "commitSha is required" });
      }

      // Validate project exists
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return reply.status(404).send({ error: "Project not found" });
      }

      // Create build record
      const build = await prisma.build.create({
        data: {
          id: randomUUID(),
          projectId,
          commitSha,
          branch: branch || "main",
          status: BuildStatus.PENDING,
          metadata: {
            repoUrl,
            dockerfilePath,
            buildArgs,
          },
        },
      });

      // Queue the build job
      await buildQueue.add("build", {
        buildId: build.id,
        projectId,
        repoUrl,
        commitSha,
        branch: branch || "main",
        dockerfilePath,
        buildArgs,
      });

      app.log.info({ buildId: build.id }, "Build queued");

      return reply.status(201).send({
        id: build.id,
        status: build.status,
        createdAt: build.createdAt,
      });
    },
  );

  // Get build details
  app.get<{ Params: BuildParams }>(
    "/api/builds/:buildId",
    {
      preHandler: authenticateApiKey,
    },
    async (request, reply) => {
      const { buildId } = request.params;

      const build = await prisma.build.findUnique({
        where: { id: buildId },
        include: {
          project: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      return reply.send(build);
    },
  );

  // Get build logs
  app.get<{ Params: BuildParams; Querystring: { stream?: boolean } }>(
    "/api/builds/:buildId/logs",
    {
      preHandler: authenticateApiKey,
    },
    async (request, reply) => {
      const { buildId } = request.params;
      const { stream } = request.query;

      const build = await prisma.build.findUnique({
        where: { id: buildId },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      // If build is running and stream is requested, stream logs from Kubernetes
      if (build.status === BuildStatus.RUNNING && stream) {
        const kanikoBuilder = new KanikoBuilder(
          process.env.ECR_REPOSITORY_URI || "",
          "cygni-builds",
        );

        try {
          const logStream = await kanikoBuilder.streamLogs(buildId);

          reply.type("text/plain");
          reply.header("Cache-Control", "no-cache");
          reply.header("Connection", "keep-alive");

          return reply.send(logStream);
        } catch (error) {
          app.log.error({ error, buildId }, "Failed to stream logs");
          return reply.status(500).send({ error: "Failed to stream logs" });
        }
      }

      // Return stored logs
      return reply.send({
        logs: build.logs || "",
        status: build.status,
      });
    },
  );

  // List builds for a project
  app.get<{ Querystring: BuildQuery }>(
    "/api/builds",
    {
      preHandler: authenticateApiKey,
    },
    async (request, reply) => {
      const { projectId, status, limit = 20, offset = 0 } = request.query;

      if (!projectId) {
        return reply.status(400).send({ error: "projectId is required" });
      }

      const where: any = { projectId };
      if (status) {
        where.status = status;
      }

      // Convert query params to integers
      const take = parseInt(String(limit), 10);
      const skip = parseInt(String(offset), 10);

      const [builds, total] = await Promise.all([
        prisma.build.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: isNaN(take) ? 20 : take,
          skip: isNaN(skip) ? 0 : skip,
        }),
        prisma.build.count({ where }),
      ]);

      return reply.send({
        builds,
        total,
        limit: take,
        offset: skip,
      });
    },
  );

  // Cancel a build
  app.post<{ Params: BuildParams }>(
    "/api/builds/:buildId/cancel",
    {
      preHandler: authenticateApiKey,
    },
    async (request, reply) => {
      const { buildId } = request.params;

      const build = await prisma.build.findUnique({
        where: { id: buildId },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      if (
        build.status !== BuildStatus.PENDING &&
        build.status !== BuildStatus.RUNNING
      ) {
        return reply.status(400).send({
          error: "Build cannot be cancelled",
          status: build.status,
        });
      }

      // If running, cancel the Kubernetes job
      if (build.status === BuildStatus.RUNNING) {
        const kanikoBuilder = new KanikoBuilder(
          process.env.ECR_REPOSITORY_URI || "",
          "cygni-builds",
        );

        try {
          await kanikoBuilder.cancelBuild(buildId);
        } catch (error) {
          app.log.error({ error, buildId }, "Failed to cancel Kubernetes job");
        }
      }

      // Update build status
      const updatedBuild = await prisma.build.update({
        where: { id: buildId },
        data: {
          status: BuildStatus.CANCELLED,
          updatedAt: new Date(),
        },
      });

      // Remove from queue if pending
      if (build.status === BuildStatus.PENDING) {
        const jobs = await buildQueue.getJobs(["waiting", "delayed"]);
        const job = jobs.find((j) => j.data.buildId === buildId);
        if (job) {
          await job.remove();
        }
      }

      app.log.info({ buildId }, "Build cancelled");

      return reply.send({
        id: updatedBuild.id,
        status: updatedBuild.status,
      });
    },
  );

  // Webhook for build status updates (internal use)
  app.post<{
    Body: {
      buildId: string;
      status: BuildStatus;
      logs?: string;
      imageUrl?: string;
    };
  }>("/internal/builds/update", async (request, reply) => {
    const { buildId, status, logs, imageUrl } = request.body;

    await prisma.build.update({
      where: { id: buildId },
      data: {
        status,
        logs: logs || undefined,
        imageUrl: imageUrl || undefined,
        updatedAt: new Date(),
      },
    });

    app.log.info({ buildId, status }, "Build status updated");

    return reply.send({ success: true });
  });
};

export default buildsRoutes;
