import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
// import { nanoid } from 'nanoid';
import { prisma } from "../utils/prisma";
import { requireRole } from "../middleware/auth";
import { Role } from "../types/auth";
import { DeploymentStatus } from "@prisma/client-api";
import axios from "axios";
import { WebhookService } from "../services/webhook.service";

const createDeploymentSchema = z.object({
  projectId: z.string(),
  buildId: z.string(),
  environment: z.string(),
  metadata: z.any().optional(),
});

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL || "http://runtime-orchestrator:8080";

export const deploymentRoutes: FastifyPluginAsync = async (app) => {
  // Create deployment
  app.post(
    "/deployments",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, _reply) => {
      const body = createDeploymentSchema.parse(request.body);

      // Verify build exists and is successful
      const build = await prisma.build.findUnique({
        where: { id: body.buildId },
        include: { project: true },
      });

      if (!build) {
        return _reply.status(404).send({ error: "Build not found" });
      }

      if (build.status !== "success") {
        return _reply.status(400).send({ error: "Build is not successful" });
      }

      // Verify environment exists
      const environment = await prisma.environment.findFirst({
        where: {
          projectId: body.projectId,
          slug: body.environment,
        },
      });

      if (!environment) {
        return _reply.status(404).send({ error: "Environment not found" });
      }

      // Create deployment record
      const deployment = await prisma.deployment.create({
        data: {
          projectId: body.projectId,
          buildId: body.buildId,
          environmentId: environment.id,
          userId: request.auth!.user.id,
          status: DeploymentStatus.pending,
          metadata: body.metadata || undefined,
        },
        include: {
          build: true,
          environment: true,
        },
      });

      // Create or update CloudExpressService in Kubernetes
      try {
        const namespace = getNamespaceForEnvironment(
          environment.slug,
          build.project.slug,
        );

        await axios.post(`${ORCHESTRATOR_URL}/api/services`, {
          namespace,
          name: build.project.slug,
          spec: {
            image: build.imageUrl,
            ports: [3000], // TODO: Get from project config
            envFrom: `secrets://${environment.slug}/${build.project.slug}`,
            autoscale: {
              min: 1,
              max: 10,
              cpu: 70,
            },
            serviceType: "web",
            deploymentId: deployment.id,
          },
        });

        // Update deployment status
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: DeploymentStatus.deploying },
        });
      } catch (error) {
        app.log.error("Failed to create CloudExpressService", {
          error,
          deploymentId: deployment.id,
        });

        await prisma.deployment.update({
          where: { id: deployment.id },
          data: {
            status: DeploymentStatus.failed,
            metadata: {
              ...(deployment.metadata as Record<string, unknown>),
              error: "Failed to create service in orchestrator",
            },
          },
        });

        return _reply.status(500).send({ error: "Failed to start deployment" });
      }

      // Start monitoring deployment status
      monitorDeploymentStatus(app, deployment.id);

      // Send webhook notification
      WebhookService.notifyDeploymentCreated(deployment.id).catch((err) =>
        app.log.error("Failed to send deployment webhook", { error: err }),
      );

      return deployment;
    },
  );

  // Get deployment
  app.get(
    "/deployments/:deploymentId",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, _reply) => {
      const { deploymentId } = request.params as { deploymentId: string };

      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          build: true,
          environment: true,
          project: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!deployment) {
        return _reply.status(404).send({ error: "Deployment not found" });
      }

      // Get current status from orchestrator
      try {
        const namespace = getNamespaceForEnvironment(
          deployment.environment.slug,
          deployment.project.slug,
        );
        const status = await axios.get(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${deployment.project.slug}/status`,
        );

        // Augment with live data
        return {
          ...deployment,
          currentImage: status.data.currentImage,
          previousImage: status.data.previousImage,
          replicas: status.data.replicas,
          readyReplicas: status.data.readyReplicas,
          endpoint: status.data.endpoint,
        };
      } catch (error) {
        // Return deployment data even if orchestrator is unavailable
        return deployment;
      }
    },
  );

  // Get latest deployment with optional previous deployment
  app.get(
    "/projects/:projectId/deployments/latest",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, _reply) => {
      const { projectId } = request.params as { projectId: string };
      const { environment, includePrevious = false } = request.query as {
        environment?: string;
        includePrevious?: boolean;
      };

      const where: {
        projectId: string;
        status?: DeploymentStatus;
        environmentId?: string;
      } = { projectId };

      if (environment) {
        const env = await prisma.environment.findFirst({
          where: {
            projectId,
            slug: environment,
          },
        });

        if (env) {
          where.environmentId = env.id;
        } else {
          return _reply.status(404).send({ error: "Environment not found" });
        }
      }

      // Get the latest deployment
      const latestDeployment = await prisma.deployment.findFirst({
        where: {
          ...where,
          status: DeploymentStatus.active,
        },
        orderBy: { createdAt: "desc" },
        include: {
          build: true,
          environment: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!latestDeployment) {
        return _reply.status(404).send({ error: "No active deployment found" });
      }

      let previousDeployment = null;
      if (includePrevious) {
        previousDeployment = await prisma.deployment.findFirst({
          where: {
            ...where,
            status: DeploymentStatus.active,
            createdAt: { lt: latestDeployment.createdAt },
          },
          orderBy: { createdAt: "desc" },
          include: {
            build: true,
            environment: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        });
      }

      return {
        latest: latestDeployment,
        previous: previousDeployment,
      };
    },
  );

  // List deployments for project
  app.get(
    "/projects/:projectId/deployments",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, _reply) => {
      const { projectId } = request.params as { projectId: string };
      const {
        environment,
        limit = 20,
        offset = 0,
      } = request.query as {
        environment?: string;
        limit?: number;
        offset?: number;
      };

      const where: {
        projectId: string;
        status?: DeploymentStatus;
        environmentId?: string;
      } = { projectId };

      if (environment) {
        const env = await prisma.environment.findFirst({
          where: {
            projectId,
            slug: environment,
          },
        });

        if (env) {
          where.environmentId = env.id;
        }
      }

      const deployments = await prisma.deployment.findMany({
        where,
        include: {
          build: true,
          environment: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.deployment.count({ where });

      return {
        deployments,
        total,
        limit,
        offset,
      };
    },
  );

  // Unified rollback endpoint
  app.post(
    "/rollback",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, _reply) => {
      const rollbackSchema = z.object({
        deploymentId: z.string().optional(),
        projectId: z.string().optional(),
        projectSlug: z.string().optional(),
        environment: z.string(),
      });

      const body = rollbackSchema.parse(request.body);

      // Determine project based on input
      let project: { id: string; slug: string } | null = null;
      let projectId: string;

      if (body.deploymentId) {
        // Rollback specific deployment
        const deployment = await prisma.deployment.findUnique({
          where: { id: body.deploymentId },
          include: { project: true },
        });
        if (!deployment) {
          return _reply.status(404).send({ error: "Deployment not found" });
        }
        project = deployment.project;
        projectId = deployment.projectId;
      } else if (body.projectId) {
        // Rollback by project ID
        project = await prisma.project.findUnique({
          where: { id: body.projectId },
        });
        if (!project) {
          return _reply.status(404).send({ error: "Project not found" });
        }
        projectId = project.id;
      } else if (body.projectSlug) {
        // Rollback by project slug
        project = await prisma.project.findFirst({
          where: { slug: body.projectSlug },
        });
        if (!project) {
          return _reply.status(404).send({ error: "Project not found" });
        }
        projectId = project.id;
      } else {
        return _reply.status(400).send({
          error: "Must provide either deploymentId, projectId, or projectSlug",
        });
      }

      // Verify environment exists
      const environment = await prisma.environment.findFirst({
        where: {
          projectId,
          slug: body.environment,
        },
      });

      if (!environment) {
        return _reply.status(404).send({ error: "Environment not found" });
      }

      // Get active deployment
      const activeDeployment = await prisma.deployment.findFirst({
        where: {
          projectId,
          environmentId: environment.id,
          status: DeploymentStatus.active,
        },
        include: {
          build: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!activeDeployment) {
        return _reply
          .status(404)
          .send({ error: "No active deployment found in this environment" });
      }

      // Get previous successful deployment
      const previousDeployment = await prisma.deployment.findFirst({
        where: {
          projectId,
          environmentId: environment.id,
          status: DeploymentStatus.active,
          createdAt: {
            lt: activeDeployment.createdAt,
          },
        },
        include: {
          build: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!previousDeployment) {
        return _reply
          .status(400)
          .send({ error: "No previous deployment available for rollback" });
      }

      // Trigger rollback in orchestrator
      const namespace = getNamespaceForEnvironment(
        environment.slug,
        project.slug,
      );

      try {
        await axios.post(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${project.slug}/rollback`,
          {
            targetImage: previousDeployment.build.imageUrl,
          },
        );

        // Create new deployment record for the rollback
        const rollbackDeployment = await prisma.deployment.create({
          data: {
            projectId,
            buildId: previousDeployment.buildId,
            environmentId: environment.id,
            userId: request.auth!.user.id,
            status: DeploymentStatus.deploying,
            metadata: {
              type: "rollback",
              rollbackFrom: activeDeployment.id,
              rollbackTo: previousDeployment.id,
              previousImage: activeDeployment.build.imageUrl,
              targetImage: previousDeployment.build.imageUrl,
            },
          },
          include: {
            build: true,
            environment: true,
            project: true,
          },
        });

        // Send webhook notification
        const webhookService = new WebhookService();
        await webhookService.sendDeploymentEvent({
          projectId,
          event: "deployment.rollback",
          deployment: rollbackDeployment,
        });

        // Start monitoring rollback status
        monitorDeploymentStatus(app, rollbackDeployment.id);

        return {
          deployment: rollbackDeployment,
          rolledBackFrom: {
            id: activeDeployment.id,
            buildId: activeDeployment.buildId,
            createdAt: activeDeployment.createdAt,
          },
          rolledBackTo: {
            id: previousDeployment.id,
            buildId: previousDeployment.buildId,
            createdAt: previousDeployment.createdAt,
          },
        };
      } catch (error) {
        app.log.error("Failed to rollback deployment", {
          error,
          projectId,
          environment: environment.slug,
        });
        return _reply
          .status(500)
          .send({ error: "Failed to initiate rollback" });
      }
    },
  );

  // Rollback deployment (DEPRECATED - use /rollback instead)
  app.post(
    "/deployments/:deploymentId/rollback",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, _reply) => {
      const { deploymentId } = request.params as { deploymentId: string };

      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          build: true,
          environment: true,
          project: true,
        },
      });

      if (!deployment) {
        return _reply.status(404).send({ error: "Deployment not found" });
      }

      // Get current service status from orchestrator
      const namespace = getNamespaceForEnvironment(
        deployment.environment.slug,
        deployment.project.slug,
      );

      try {
        const status = await axios.get(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${deployment.project.slug}/status`,
        );

        if (!status.data.previousImage) {
          return _reply
            .status(400)
            .send({ error: "No previous deployment available for rollback" });
        }

        // Trigger rollback in orchestrator
        await axios.post(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${deployment.project.slug}/rollback`,
        );

        // Create new deployment record for the rollback
        const rollbackDeployment = await prisma.deployment.create({
          data: {
            projectId: deployment.projectId,
            buildId: deployment.buildId, // Keep same build ID for tracking
            environmentId: deployment.environmentId,
            userId: request.auth!.user.id,
            status: DeploymentStatus.deploying,
            metadata: {
              rollbackFrom: deployment.id,
              previousImage: status.data.currentImage,
              targetImage: status.data.previousImage,
            },
          },
        });

        // Start monitoring rollback status
        monitorDeploymentStatus(app, rollbackDeployment.id);

        return rollbackDeployment;
      } catch (error) {
        app.log.error("Failed to rollback deployment", { error, deploymentId });
        return _reply
          .status(500)
          .send({ error: "Failed to initiate rollback" });
      }
    },
  );

  // One-shot rollback for project/environment (DEPRECATED - use /rollback instead)
  app.post(
    "/projects/:projectId/environments/:environment/rollback",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, _reply) => {
      const { projectId, environment: envSlug } = request.params as {
        projectId: string;
        environment: string;
      };

      // Get the environment
      const environment = await prisma.environment.findFirst({
        where: {
          projectId,
          slug: envSlug,
        },
      });

      if (!environment) {
        return _reply.status(404).send({ error: "Environment not found" });
      }

      // Get the most recent active deployment
      const activeDeployment = await prisma.deployment.findFirst({
        where: {
          projectId,
          environmentId: environment.id,
          status: DeploymentStatus.active,
        },
        orderBy: { createdAt: "desc" },
        include: {
          build: true,
          project: true,
        },
      });

      if (!activeDeployment) {
        return _reply.status(404).send({ error: "No active deployment found" });
      }

      // Get the previous successful deployment
      const previousDeployment = await prisma.deployment.findFirst({
        where: {
          projectId,
          environmentId: environment.id,
          status: DeploymentStatus.active,
          createdAt: { lt: activeDeployment.createdAt },
        },
        orderBy: { createdAt: "desc" },
        include: {
          build: true,
        },
      });

      if (!previousDeployment) {
        return _reply
          .status(400)
          .send({ error: "No previous deployment available for rollback" });
      }

      // Trigger rollback in orchestrator
      const namespace = getNamespaceForEnvironment(
        environment.slug,
        activeDeployment.project.slug,
      );

      try {
        await axios.post(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${activeDeployment.project.slug}/rollback`,
          {
            targetImage: previousDeployment.build.imageUrl,
          },
        );

        // Create new deployment record for the rollback
        const rollbackDeployment = await prisma.deployment.create({
          data: {
            projectId,
            buildId: previousDeployment.buildId,
            environmentId: environment.id,
            userId: request.auth!.user.id,
            status: DeploymentStatus.deploying,
            metadata: {
              type: "rollback",
              rollbackFrom: activeDeployment.id,
              rollbackTo: previousDeployment.id,
              previousImage: activeDeployment.build.imageUrl,
              targetImage: previousDeployment.build.imageUrl,
            },
          },
          include: {
            build: true,
            environment: true,
          },
        });

        // Start monitoring rollback status
        monitorDeploymentStatus(app, rollbackDeployment.id);

        return {
          deployment: rollbackDeployment,
          rolledBackFrom: {
            id: activeDeployment.id,
            buildId: activeDeployment.buildId,
            image: activeDeployment.build.imageUrl,
            deployedAt: activeDeployment.createdAt,
          },
          rolledBackTo: {
            id: previousDeployment.id,
            buildId: previousDeployment.buildId,
            image: previousDeployment.build.imageUrl,
            deployedAt: previousDeployment.createdAt,
          },
        };
      } catch (error) {
        app.log.error("Failed to rollback deployment", {
          error,
          projectId,
          environment: envSlug,
        });
        return _reply
          .status(500)
          .send({ error: "Failed to initiate rollback" });
      }
    },
  );

  // One-shot rollback by project slug and environment (DEPRECATED - use /rollback instead)
  app.post(
    "/rollback/:projectSlug/:environment",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer]),
      ],
    },
    async (request, _reply) => {
      const { projectSlug, environment: envSlug } = request.params as {
        projectSlug: string;
        environment: string;
      };

      // Get project by slug
      const project = await prisma.project.findFirst({
        where: {
          slug: projectSlug,
        },
        include: {
          members: {
            where: { userId: request.auth!.user.id },
          },
          organization: {
            include: {
              members: {
                where: { userId: request.auth!.user.id },
              },
            },
          },
        },
      });

      if (!project) {
        return _reply.status(404).send({ error: "Project not found" });
      }

      // Check access
      if (
        project.members.length === 0 &&
        project.organization.members.length === 0
      ) {
        return _reply.status(403).send({ error: "Access denied" });
      }

      // Get the environment
      const environment = await prisma.environment.findFirst({
        where: {
          projectId: project.id,
          slug: envSlug,
        },
      });

      if (!environment) {
        return _reply.status(404).send({ error: "Environment not found" });
      }

      // Get the most recent active deployment
      const activeDeployment = await prisma.deployment.findFirst({
        where: {
          projectId: project.id,
          environmentId: environment.id,
          status: DeploymentStatus.active,
        },
        orderBy: { createdAt: "desc" },
        include: {
          build: true,
        },
      });

      if (!activeDeployment) {
        return _reply.status(404).send({ error: "No active deployment found" });
      }

      // Get the previous successful deployment
      const previousDeployment = await prisma.deployment.findFirst({
        where: {
          projectId: project.id,
          environmentId: environment.id,
          status: DeploymentStatus.active,
          createdAt: { lt: activeDeployment.createdAt },
        },
        orderBy: { createdAt: "desc" },
        include: {
          build: true,
        },
      });

      if (!previousDeployment) {
        return _reply
          .status(400)
          .send({ error: "No previous deployment available for rollback" });
      }

      // Trigger rollback in orchestrator
      const namespace = getNamespaceForEnvironment(
        environment.slug,
        project.slug,
      );

      try {
        await axios.post(
          `${ORCHESTRATOR_URL}/api/services/${namespace}/${project.slug}/rollback`,
          {
            targetImage: previousDeployment.build.imageUrl,
          },
        );

        // Create new deployment record for the rollback
        const rollbackDeployment = await prisma.deployment.create({
          data: {
            projectId: project.id,
            buildId: previousDeployment.buildId,
            environmentId: environment.id,
            userId: request.auth!.user.id,
            status: DeploymentStatus.deploying,
            metadata: {
              type: "rollback",
              rollbackFrom: activeDeployment.id,
              rollbackTo: previousDeployment.id,
              previousImage: activeDeployment.build.imageUrl,
              targetImage: previousDeployment.build.imageUrl,
            },
          },
          include: {
            build: true,
            environment: true,
          },
        });

        // Start monitoring rollback status
        monitorDeploymentStatus(app, rollbackDeployment.id);

        return {
          deployment: rollbackDeployment,
          rolledBackFrom: {
            id: activeDeployment.id,
            buildId: activeDeployment.buildId,
            image: activeDeployment.build.imageUrl,
            deployedAt: activeDeployment.createdAt,
          },
          rolledBackTo: {
            id: previousDeployment.id,
            buildId: previousDeployment.buildId,
            image: previousDeployment.build.imageUrl,
            deployedAt: previousDeployment.createdAt,
          },
        };
      } catch (error) {
        app.log.error("Failed to rollback deployment", {
          error,
          projectSlug,
          environment: envSlug,
        });
        return _reply
          .status(500)
          .send({ error: "Failed to initiate rollback" });
      }
    },
  );

  // Get deployment logs
  app.get(
    "/deployments/:deploymentId/logs",
    {
      preHandler: [
        app.authenticate,
        requireRole([Role.owner, Role.admin, Role.developer, Role.viewer]),
      ],
    },
    async (request, _reply) => {
      const { deploymentId } = request.params as { deploymentId: string };
      const { lines = 100, since } = request.query as {
        lines?: number;
        since?: string;
      };

      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          environment: true,
          project: true,
        },
      });

      if (!deployment) {
        return _reply.status(404).send({ error: "Deployment not found" });
      }

      // Query logs from Loki
      const namespace = getNamespaceForEnvironment(
        deployment.environment.slug,
        deployment.project.slug,
      );
      const query = `{namespace="${namespace}",app="${deployment.project.slug}"}`;

      try {
        const lokiUrl =
          process.env.LOKI_URL ||
          "http://loki-gateway.monitoring.svc.cluster.local";
        const response = await axios.get(`${lokiUrl}/loki/api/v1/query_range`, {
          params: {
            query,
            limit: lines,
            since: since || "1h",
          },
        });

        const logs = response.data.data.result.flatMap(
          (stream: { values: [string, string][]; stream: unknown }) =>
            stream.values.map((value: [string, string]) => ({
              timestamp: new Date(parseInt(value[0]) / 1000000),
              message: value[1],
              stream: stream.stream,
            })),
        );

        return { logs };
      } catch (error) {
        app.log.error("Failed to fetch logs", { error, deploymentId });
        return { logs: [] };
      }
    },
  );
};

function getNamespaceForEnvironment(
  environment: string,
  projectSlug: string,
): string {
  if (environment === "production") {
    return "cygni-apps";
  } else if (environment === "preview") {
    return `preview-${projectSlug}`;
  } else {
    return `${environment}-${projectSlug}`;
  }
}

async function monitorDeploymentStatus(
  app: {
    log: {
      info: (msg: string, data?: unknown) => void;
      error: (msg: string, data?: unknown) => void;
    };
  },
  deploymentId: string,
) {
  // Poll orchestrator for deployment status
  const checkStatus = async () => {
    try {
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          environment: true,
          project: true,
        },
      });

      if (
        !deployment ||
        deployment.status === "active" ||
        deployment.status === "failed"
      ) {
        return; // Stop monitoring
      }

      const namespace = getNamespaceForEnvironment(
        deployment.environment.slug,
        deployment.project.slug,
      );
      const status = await axios.get(
        `${ORCHESTRATOR_URL}/api/services/${namespace}/${deployment.project.slug}/status`,
      );

      let newStatus: DeploymentStatus = deployment.status;

      switch (status.data.phase) {
        case "Running":
          if (
            status.data.readyReplicas === status.data.replicas &&
            status.data.replicas > 0
          ) {
            newStatus = DeploymentStatus.active;
          }
          break;
        case "Failed":
          newStatus = DeploymentStatus.failed;
          break;
        case "Deploying":
        case "RollingBack":
          newStatus = DeploymentStatus.deploying;
          break;
      }

      if (newStatus !== deployment.status) {
        const oldStatus = deployment.status;

        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: newStatus,
            metadata: {
              ...(deployment.metadata as Record<string, unknown>),
              endpoint: status.data.endpoint,
              lastChecked: new Date().toISOString(),
            },
          },
        });

        // Send webhook notification for status change
        WebhookService.notifyDeploymentStatusChange(
          deploymentId,
          oldStatus,
          newStatus,
        ).catch((err) =>
          app.log.error("Failed to send deployment status webhook", {
            error: err,
          }),
        );

        // Update GitHub status
        const fullDeployment = await prisma.deployment.findUnique({
          where: { id: deploymentId },
          include: {
            build: true,
            project: true,
            environment: true,
          },
        });
        if (fullDeployment) {
          WebhookService.updateGitHubStatus(fullDeployment).catch((err) =>
            app.log.error("Failed to update GitHub status", { error: err }),
          );
        }
      }

      // Continue monitoring if still deploying
      if (newStatus === "deploying") {
        setTimeout(checkStatus, 5000); // Check again in 5 seconds
      }
    } catch (error) {
      app.log.error("Failed to monitor deployment status", {
        error,
        deploymentId,
      });
    }
  };

  // Start monitoring after a short delay
  setTimeout(checkStatus, 2000);
}
