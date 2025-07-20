import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { requireRole } from "../middleware/auth";
import { Role } from "../types/auth";
import { BuildStatus } from "@prisma/client-api";
import axios from "axios";

const createBuildSchema = z.object({
  projectId: z.string(),
  commitSha: z.string(),
  branch: z.string(),
  dockerfilePath: z.string().optional(),
  buildArgs: z.record(z.string()).optional(),
});

const BUILDER_SERVICE_URL =
  process.env.BUILDER_SERVICE_URL || "http://builder:3001";

export const buildRoutes: FastifyPluginAsync = async (app) => {
  // Create build
  app.post(
    "/builds",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, reply) => {
      const body = createBuildSchema.parse(request.body);

      // Get project to verify access and get repo URL
      const project = await prisma.project.findUnique({
        where: { id: body.projectId },
      });

      if (!project) {
        return reply.status(404).send({ error: "Project not found" });
      }

      if (!project.repository) {
        return reply
          .status(400)
          .send({ error: "Project has no repository configured" });
      }

      // Create build record
      const build = await prisma.build.create({
        data: {
          projectId: body.projectId,
          commitSha: body.commitSha,
          branch: body.branch,
          status: BuildStatus.pending,
        },
      });

      // Trigger build in builder service
      try {
        await axios.post(`${BUILDER_SERVICE_URL}/api/builds`, {
          buildId: build.id,
          projectId: body.projectId,
          repoUrl: project.repository,
          commitSha: body.commitSha,
          dockerfilePath: body.dockerfilePath,
          buildArgs: body.buildArgs,
        });
      } catch (error) {
        // Mark build as failed if we couldn't start it
        await prisma.build.update({
          where: { id: build.id },
          data: { status: BuildStatus.failed },
        });

        throw new Error("Failed to start build");
      }

      return build;
    },
  );

  // Get build
  app.get(
    "/builds/:buildId",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, reply) => {
      const { buildId } = request.params as { buildId: string };

      const build = await prisma.build.findUnique({
        where: { id: buildId },
        include: {
          project: true,
        },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      // Verify user has access to the project
      const hasAccess = await verifyProjectAccess(
        request.auth!.user.id,
        build.projectId,
      );
      if (!hasAccess) {
        return reply.status(403).send({ error: "Access denied" });
      }

      return build;
    },
  );

  // Get build logs
  app.get(
    "/builds/:buildId/logs",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, reply) => {
      const { buildId } = request.params as { buildId: string };
      const { follow } = request.query as { follow?: boolean };

      const build = await prisma.build.findUnique({
        where: { id: buildId },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      // Verify user has access to the project
      const hasAccess = await verifyProjectAccess(
        request.auth!.user.id,
        build.projectId,
      );
      if (!hasAccess) {
        return reply.status(403).send({ error: "Access denied" });
      }

      if (follow) {
        // WebSocket endpoint for streaming logs
        return reply
          .status(400)
          .send({ error: "Use WebSocket endpoint for streaming logs" });
      }

      // Get logs from builder service
      try {
        const response = await axios.get(
          `${BUILDER_SERVICE_URL}/api/builds/${buildId}/logs`,
        );
        return { logs: response.data.logs };
      } catch (error) {
        return { logs: build.logs || "No logs available" };
      }
    },
  );

  // List builds for project
  app.get(
    "/projects/:projectId/builds",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const { limit = 20, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };

      // Verify user has access to the project
      const hasAccess = await verifyProjectAccess(
        request.auth!.user.id,
        projectId,
      );
      if (!hasAccess) {
        return reply.status(403).send({ error: "Access denied" });
      }

      const builds = await prisma.build.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.build.count({
        where: { projectId },
      });

      return {
        builds,
        total,
        limit,
        offset,
      };
    },
  );

  // Cancel build
  app.post(
    "/builds/:buildId/cancel",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, reply) => {
      const { buildId } = request.params as { buildId: string };

      const build = await prisma.build.findUnique({
        where: { id: buildId },
      });

      if (!build) {
        return reply.status(404).send({ error: "Build not found" });
      }

      // Verify user has access to the project
      const hasAccess = await verifyProjectAccess(
        request.auth!.user.id,
        build.projectId,
      );
      if (!hasAccess) {
        return reply.status(403).send({ error: "Access denied" });
      }

      if (
        build.status !== BuildStatus.pending &&
        build.status !== BuildStatus.running
      ) {
        return reply.status(400).send({ error: "Build cannot be cancelled" });
      }

      // Cancel in builder service
      try {
        await axios.post(`${BUILDER_SERVICE_URL}/api/builds/${buildId}/cancel`);
      } catch (error) {
        // Log error but continue
        app.log.error("Failed to cancel build in builder service", {
          buildId,
          error,
        });
      }

      // Update build status
      const updatedBuild = await prisma.build.update({
        where: { id: buildId },
        data: { status: BuildStatus.cancelled },
      });

      return updatedBuild;
    },
  );
};

async function verifyProjectAccess(
  userId: string,
  projectId: string,
): Promise<boolean> {
  // Check if user is a project member or organization member
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        where: { userId },
      },
      organization: {
        include: {
          members: {
            where: { userId },
          },
        },
      },
    },
  });

  if (!project) return false;

  // User is a direct project member or organization member
  return project.members.length > 0 || project.organization.members.length > 0;
}
