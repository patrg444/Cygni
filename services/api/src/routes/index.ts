import { FastifyInstance } from "fastify";
import { projectRoutes } from "./projects";
import { deploymentRoutes } from "./deployments";
import { authRoutes } from "./auth";
import { webhookRoutes } from "./webhooks";
import { projectWebhookRoutes } from "./project-webhooks";
// import { userRoutes } from './users';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/api/auth" });
  // await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(deploymentRoutes, { prefix: "/api/deployments" });
  await app.register(webhookRoutes, { prefix: "/api" });
  await app.register(projectWebhookRoutes, { prefix: "/api" });
}
