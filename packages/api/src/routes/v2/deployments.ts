import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "../auth";
import logger from "../../lib/logger";
import { requireMinVersion } from "../../middleware/api-version.middleware";
import { getWebhookEventTrigger } from "../../services/webhook/webhook-events";

const router = Router();
const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    teamId: string;
    role: string;
  };
}

// GET /api/v2/deployments - List deployments across all projects
router.get(
  "/",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const {
        page = "1",
        limit = "20",
        projectId,
        status,
        startDate,
        endDate,
      } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;
      
      // Build where clause
      const where: any = {
        project: {
          teamId: authReq.user!.teamId,
        },
      };
      
      if (projectId) {
        where.projectId = projectId as string;
      }
      
      if (status) {
        where.status = status as string;
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }
      
      const [deployments, total] = await Promise.all([
        prisma.deployment.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.deployment.count({ where }),
      ]);
      
      res.json({
        deployments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error("Failed to list deployments", { error });
      res.status(500).json({ error: "Failed to list deployments" });
    }
  }
);

// POST /api/v2/deployments - Create a new deployment
router.post(
  "/",
  jwtMiddleware(jwtService),
  requireMinVersion("v2"), // This endpoint only exists in v2+
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        projectId: z.string().uuid(),
        commitSha: z.string().optional(),
        branch: z.string().default("main"),
        environment: z.enum(["production", "preview", "development"]).default("production"),
        metadata: z.record(z.any()).optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Verify project ownership
      const project = await prisma.project.findFirst({
        where: {
          id: data.projectId,
          teamId: authReq.user!.teamId,
        },
      });
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Create deployment
      const deployment = await prisma.deployment.create({
        data: {
          projectId: data.projectId,
          status: "pending",
          environment: data.environment,
          metadata: {
            ...data.metadata,
            commitSha: data.commitSha,
            branch: data.branch,
            triggeredBy: authReq.user!.userId,
            apiVersion: "v2",
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      
      logger.info("Deployment created", {
        deploymentId: deployment.id,
        projectId: data.projectId,
        userId: authReq.user!.userId,
      });
      
      // Trigger webhook event
      const team = await prisma.team.findUnique({
        where: { id: authReq.user!.teamId },
      });
      const webhookEvents = getWebhookEventTrigger(prisma);
      await webhookEvents.deploymentCreated(deployment, project, team!);
      
      // In a real system, this would trigger the actual deployment process
      // For now, we'll simulate it transitioning to building
      setTimeout(async () => {
        const previousStatus = deployment.status;
        const updated = await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: "building" },
        });
        
        // Trigger status change webhook
        await webhookEvents.deploymentStatusChanged(updated, project, team!, previousStatus);
      }, 1000);
      
      res.status(201).json(deployment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to create deployment", { error });
      res.status(500).json({ error: "Failed to create deployment" });
    }
  }
);

// GET /api/v2/deployments/:deploymentId - Get deployment details
router.get(
  "/:deploymentId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { deploymentId } = req.params;
    
    try {
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: deploymentId,
          project: {
            teamId: authReq.user!.teamId,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          logs: {
            orderBy: { timestamp: "asc" },
            take: 100, // Limit logs for performance
          },
        },
      });
      
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }
      
      res.json(deployment);
    } catch (error) {
      logger.error("Failed to get deployment", { error });
      res.status(500).json({ error: "Failed to get deployment" });
    }
  }
);

// GET /api/v2/deployments/:deploymentId/logs - Stream deployment logs
router.get(
  "/:deploymentId/logs",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { deploymentId } = req.params;
    const { follow } = req.query;
    
    try {
      // Verify deployment ownership
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: deploymentId,
          project: {
            teamId: authReq.user!.teamId,
          },
        },
      });
      
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }
      
      if (follow === "true") {
        // Set up SSE for log streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        // Send initial logs
        const logs = await prisma.deploymentLog.findMany({
          where: { deploymentId },
          orderBy: { timestamp: "asc" },
        });
        
        logs.forEach(log => {
          res.write(`data: ${JSON.stringify(log)}\n\n`);
        });
        
        // In a real system, we'd subscribe to log updates
        // For demo, we'll send a heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          res.write(":heartbeat\n\n");
        }, 30000);
        
        req.on("close", () => {
          clearInterval(heartbeat);
        });
      } else {
        // Return all logs
        const logs = await prisma.deploymentLog.findMany({
          where: { deploymentId },
          orderBy: { timestamp: "asc" },
        });
        
        res.json({ logs });
      }
    } catch (error) {
      logger.error("Failed to get deployment logs", { error });
      res.status(500).json({ error: "Failed to get deployment logs" });
    }
  }
);

// POST /api/v2/deployments/:deploymentId/cancel - Cancel a deployment
router.post(
  "/:deploymentId/cancel",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { deploymentId } = req.params;
    
    try {
      // Verify deployment ownership and status
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: deploymentId,
          project: {
            teamId: authReq.user!.teamId,
          },
        },
      });
      
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }
      
      if (!["pending", "building", "deploying"].includes(deployment.status)) {
        return res.status(400).json({
          error: "Cannot cancel deployment",
          message: `Deployment is already ${deployment.status}`,
        });
      }
      
      // Cancel the deployment
      const updatedDeployment = await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "cancelled",
          metadata: {
            ...(deployment.metadata as any),
            cancelledAt: new Date(),
            cancelledBy: authReq.user!.userId,
          },
        },
      });
      
      logger.info("Deployment cancelled", {
        deploymentId,
        userId: authReq.user!.userId,
      });
      
      res.json(updatedDeployment);
    } catch (error) {
      logger.error("Failed to cancel deployment", { error });
      res.status(500).json({ error: "Failed to cancel deployment" });
    }
  }
);

// POST /api/v2/deployments/:deploymentId/rollback - Rollback to this deployment
router.post(
  "/:deploymentId/rollback",
  jwtMiddleware(jwtService),
  requireMinVersion("v2"),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { deploymentId } = req.params;
    
    try {
      // Verify deployment ownership and it was successful
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: deploymentId,
          project: {
            teamId: authReq.user!.teamId,
          },
        },
        include: {
          project: true,
        },
      });
      
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }
      
      if (deployment.status !== "ready") {
        return res.status(400).json({
          error: "Cannot rollback to this deployment",
          message: "Only successful deployments can be rolled back to",
        });
      }
      
      // Create a new deployment based on the old one
      const rollbackDeployment = await prisma.deployment.create({
        data: {
          projectId: deployment.projectId,
          status: "pending",
          environment: deployment.environment,
          metadata: {
            ...(deployment.metadata as any),
            rollbackFrom: deploymentId,
            triggeredBy: authReq.user!.userId,
            apiVersion: "v2",
          },
        },
      });
      
      logger.info("Rollback deployment created", {
        deploymentId: rollbackDeployment.id,
        rollbackFrom: deploymentId,
        userId: authReq.user!.userId,
      });
      
      res.status(201).json(rollbackDeployment);
    } catch (error) {
      logger.error("Failed to create rollback deployment", { error });
      res.status(500).json({ error: "Failed to create rollback deployment" });
    }
  }
);

export { router as deploymentsRouter };