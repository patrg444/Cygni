import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { requireRole } from "../middleware/auth";
import { Role } from "../types/auth";
import { nanoid } from "nanoid";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        "deployment.created",
        "deployment.updated",
        "deployment.failed",
        "deployment.succeeded",
      ]),
    )
    .optional(),
  secret: z.string().optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z
    .array(
      z.enum([
        "deployment.created",
        "deployment.updated",
        "deployment.failed",
        "deployment.succeeded",
      ]),
    )
    .optional(),
  active: z.boolean().optional(),
});

export const projectWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Create webhook
  app.post(
    "/projects/:projectId/webhooks",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const body = createWebhookSchema.parse(request.body);

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { members: { some: { userId: request.auth!.user.id } } },
            {
              organization: {
                members: { some: { userId: request.auth!.user.id } },
              },
            },
          ],
        },
      });

      if (!project) {
        return reply.status(404).send({ error: "Project not found" });
      }

      // Generate secret if not provided
      const secret = body.secret || nanoid(32);

      const webhook = await prisma.webhook.create({
        data: {
          projectId,
          url: body.url,
          secret,
          events: body.events || [
            "deployment.created",
            "deployment.updated",
            "deployment.failed",
            "deployment.succeeded",
          ],
        },
      });

      return webhook;
    },
  );

  // List webhooks for project
  app.get(
    "/projects/:projectId/webhooks",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { members: { some: { userId: request.auth!.user.id } } },
            {
              organization: {
                members: { some: { userId: request.auth!.user.id } },
              },
            },
          ],
        },
        include: {
          webhooks: true,
        },
      });

      if (!project) {
        return reply.status(404).send({ error: "Project not found" });
      }

      return project.webhooks;
    },
  );

  // Get webhook
  app.get(
    "/webhooks/:webhookId",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, reply) => {
      const { webhookId } = request.params as { webhookId: string };

      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
        include: {
          project: {
            include: {
              members: { where: { userId: request.auth!.user.id } },
              organization: {
                include: {
                  members: { where: { userId: request.auth!.user.id } },
                },
              },
            },
          },
        },
      });

      if (!webhook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      // Check access
      if (
        webhook.project.members.length === 0 &&
        webhook.project.organization.members.length === 0
      ) {
        return reply.status(403).send({ error: "Access denied" });
      }

      return webhook;
    },
  );

  // Update webhook
  app.patch(
    "/webhooks/:webhookId",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, reply) => {
      const { webhookId } = request.params as { webhookId: string };
      const body = updateWebhookSchema.parse(request.body);

      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
        include: {
          project: {
            include: {
              members: { where: { userId: request.auth!.user.id } },
              organization: {
                include: {
                  members: { where: { userId: request.auth!.user.id } },
                },
              },
            },
          },
        },
      });

      if (!webhook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      // Check access
      if (
        webhook.project.members.length === 0 &&
        webhook.project.organization.members.length === 0
      ) {
        return reply.status(403).send({ error: "Access denied" });
      }

      const updatedWebhook = await prisma.webhook.update({
        where: { id: webhookId },
        data: body,
      });

      return updatedWebhook;
    },
  );

  // Delete webhook
  app.delete(
    "/webhooks/:webhookId",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, reply) => {
      const { webhookId } = request.params as { webhookId: string };

      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
        include: {
          project: {
            include: {
              members: { where: { userId: request.auth!.user.id } },
              organization: {
                include: {
                  members: { where: { userId: request.auth!.user.id } },
                },
              },
            },
          },
        },
      });

      if (!webhook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      // Check access
      if (
        webhook.project.members.length === 0 &&
        webhook.project.organization.members.length === 0
      ) {
        return reply.status(403).send({ error: "Access denied" });
      }

      await prisma.webhook.delete({
        where: { id: webhookId },
      });

      return { success: true };
    },
  );

  // Test webhook
  app.post(
    "/webhooks/:webhookId/test",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, reply) => {
      const { webhookId } = request.params as { webhookId: string };

      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
        include: {
          project: true,
        },
      });

      if (!webhook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      // Create test payload
      const testPayload = {
        event: "deployment.created" as const,
        timestamp: new Date().toISOString(),
        deployment: {
          id: "test-deployment-id",
          projectId: webhook.projectId,
          environmentId: "test-env-id",
          status: "active",
          buildId: "test-build-id",
          userId: request.auth!.user.id,
          createdAt: new Date(),
        },
        project: {
          id: webhook.project.id,
          name: webhook.project.name,
          slug: webhook.project.slug,
        },
        environment: {
          id: "test-env-id",
          name: "test",
          slug: "test",
        },
        user: {
          id: request.auth!.user.id,
          email: request.auth!.user.email,
          name: request.auth!.user.name,
        },
      };

      // Send test webhook
      const { WebhookService } = await import("../services/webhook.service");
      const result = await WebhookService["sendWebhook"](
        webhook.url,
        testPayload,
        webhook.secret || undefined,
      );

      return result;
    },
  );
};
