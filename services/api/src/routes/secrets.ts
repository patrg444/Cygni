import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { requireRole, canManageSecrets } from "../middleware/auth";
import { Role } from "../types/auth";
import { encrypt, decrypt } from "../utils/crypto";

const createSecretSchema = z.object({
  key: z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase with underscores"),
  value: z.string(),
  environmentId: z.string().optional(),
});

const updateSecretSchema = z.object({
  value: z.string(),
});

export const secretRoutes: FastifyPluginAsync = async (app) => {
  // List secrets for project
  app.get(
    "/projects/:projectId/secrets",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, _reply) => {
      const { projectId } = request.params as { projectId: string };
      const { environmentId } = request.query as { environmentId?: string };

      // Only admins and owners can view secret values
      const canViewValues = canManageSecrets(
        request.auth!.organizations[0].role,
      );

      const secrets = await prisma.secret.findMany({
        where: {
          projectId,
          environmentId: environmentId || null,
        },
        orderBy: { key: "asc" },
      });

      // Decrypt values only for authorized users
      const secretsWithValues = secrets.map((secret: any) => ({
        ...secret,
        value: canViewValues ? decrypt(secret.value) : undefined,
        preview: canViewValues
          ? undefined
          : secret.value.substring(0, 4) + "****",
      }));

      return secretsWithValues;
    },
  );

  // Create secret
  app.post(
    "/projects/:projectId/secrets",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, _reply) => {
      const { projectId } = request.params as { projectId: string };
      const body = createSecretSchema.parse(request.body);

      // Check if secret already exists
      const existing = await prisma.secret.findFirst({
        where: {
          projectId,
          environmentId: body.environmentId || null,
          key: body.key,
        },
      });

      if (existing) {
        return _reply.status(409).send({ error: "Secret already exists" });
      }

      // Encrypt value
      const encryptedValue = encrypt(body.value);

      const secret = await prisma.secret.create({
        data: {
          projectId,
          key: body.key,
          value: encryptedValue,
          environmentId: body.environmentId,
        },
      });

      // Trigger redeployment if needed
      if (body.environmentId) {
        await triggerRedeployment(projectId, body.environmentId);
      }

      return {
        ...secret,
        value: body.value, // Return unencrypted value on creation
      };
    },
  );

  // Update secret
  app.patch(
    "/projects/:projectId/secrets/:secretId",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, _reply) => {
      const { projectId, secretId } = request.params as {
        projectId: string;
        secretId: string;
      };
      const body = updateSecretSchema.parse(request.body);

      const secret = await prisma.secret.findFirst({
        where: {
          id: secretId,
          projectId,
        },
      });

      if (!secret) {
        return _reply.status(404).send({ error: "Secret not found" });
      }

      // Encrypt new value
      const encryptedValue = encrypt(body.value);

      const updatedSecret = await prisma.secret.update({
        where: { id: secretId },
        data: { value: encryptedValue },
      });

      // Trigger redeployment if needed
      if (secret.environmentId) {
        await triggerRedeployment(projectId, secret.environmentId);
      }

      return {
        ...updatedSecret,
        value: body.value, // Return unencrypted value
      };
    },
  );

  // Delete secret
  app.delete(
    "/projects/:projectId/secrets/:secretId",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, _reply) => {
      const { projectId, secretId } = request.params as {
        projectId: string;
        secretId: string;
      };

      const secret = await prisma.secret.findFirst({
        where: {
          id: secretId,
          projectId,
        },
      });

      if (!secret) {
        return _reply.status(404).send({ error: "Secret not found" });
      }

      await prisma.secret.delete({
        where: { id: secretId },
      });

      // Trigger redeployment if needed
      if (secret.environmentId) {
        await triggerRedeployment(projectId, secret.environmentId);
      }

      return { success: true };
    },
  );

  // Bulk create/update secrets
  app.post(
    "/projects/:projectId/secrets/bulk",
    {
      preHandler: [app.authenticate, requireRole([Role.owner, Role.admin])],
    },
    async (request, _reply) => {
      const { projectId } = request.params as { projectId: string };
      const { secrets, environmentId } = z
        .object({
          secrets: z.record(z.string()),
          environmentId: z.string().optional(),
        })
        .parse(request.body);

      const results = [];

      for (const [key, value] of Object.entries(secrets)) {
        // Validate key format
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          results.push({ key, error: "Invalid key format" });
          continue;
        }

        const encryptedValue = encrypt(value);

        try {
          // Check if secret exists
          const existing = await prisma.secret.findFirst({
            where: {
              projectId,
              environmentId: environmentId || null,
              key,
            },
          });

          if (existing) {
            // Update existing secret
            await prisma.secret.update({
              where: { id: existing.id },
              data: { value: encryptedValue },
            });
          } else {
            // Create new secret
            await prisma.secret.create({
              data: {
                projectId,
                key,
                value: encryptedValue,
                environmentId,
              },
            });
          }

          results.push({ key, success: true });
        } catch (error) {
          results.push({ key, error: "Failed to save secret" });
        }
      }

      // Trigger redeployment if needed
      if (environmentId) {
        await triggerRedeployment(projectId, environmentId);
      }

      return { results };
    },
  );
};

async function triggerRedeployment(projectId: string, environmentId: string) {
  // In a real implementation, this would trigger a new deployment
  // with the updated secrets
  console.log(
    `Triggering redeployment for project ${projectId} in environment ${environmentId}`,
  );
}
