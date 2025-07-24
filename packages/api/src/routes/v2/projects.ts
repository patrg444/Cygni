import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "../auth";
import logger from "../../lib/logger";
import { versionedRoute } from "../../middleware/api-version.middleware";
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

// GET /api/v2/projects - List projects with enhanced filtering
router.get(
  "/",
  jwtMiddleware(jwtService),
  versionedRoute({
    v1: async (req: Request, res: Response) => {
      // v1: Simple project list
      const authReq = req as AuthenticatedRequest;
      const projects = await prisma.project.findMany({
        where: { teamId: authReq.user!.teamId },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
      });
      res.json(projects);
    },
    v2: async (req: Request, res: Response) => {
      // v2: Enhanced with filtering, sorting, and pagination
      const authReq = req as AuthenticatedRequest;
      
      try {
        const {
          page = "1",
          limit = "10",
          search,
          status,
          sortBy = "createdAt",
          sortOrder = "desc",
        } = req.query;
        
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;
        
        const where = {
          teamId: authReq.user!.teamId,
          ...(search && {
            name: { contains: search as string, mode: "insensitive" as const },
          }),
          ...(status && { status: status as string }),
        };
        
        const [projects, total] = await Promise.all([
          prisma.project.findMany({
            where,
            skip,
            take: limitNum,
            include: {
              deployments: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  status: true,
                  createdAt: true,
                },
              },
              _count: {
                select: {
                  deployments: true,
                },
              },
            },
            orderBy: { [sortBy as string]: sortOrder },
          }),
          prisma.project.count({ where }),
        ]);
        
        res.json({
          projects,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        });
      } catch (error) {
        logger.error("Failed to list projects", { error });
        res.status(500).json({ error: "Failed to list projects" });
      }
    },
  })
);

// POST /api/v2/projects - Create project with enhanced options
router.post(
  "/",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        framework: z.string().optional(),
        repository: z.string().url().optional(),
        environmentVariables: z.record(z.string()).optional(),
        buildCommand: z.string().optional(),
        outputDirectory: z.string().optional(),
        installCommand: z.string().optional(),
        devCommand: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Check project limit
      const projectCount = await prisma.project.count({
        where: { teamId: authReq.user!.teamId },
      });
      
      const team = await prisma.team.findUnique({
        where: { id: authReq.user!.teamId },
      });
      
      const projectLimit = (team?.features as any)?.projectLimit || 10;
      
      if (projectCount >= projectLimit) {
        return res.status(403).json({
          error: "Project limit reached",
          message: `Your team plan allows up to ${projectLimit} projects`,
        });
      }
      
      const project = await prisma.project.create({
        data: {
          ...data,
          teamId: authReq.user!.teamId,
          status: "active",
          metadata: {
            createdBy: authReq.user!.userId,
            framework: data.framework,
            buildSettings: {
              buildCommand: data.buildCommand,
              outputDirectory: data.outputDirectory,
              installCommand: data.installCommand,
              devCommand: data.devCommand,
            },
          },
        },
      });
      
      logger.info("Project created", {
        projectId: project.id,
        teamId: authReq.user!.teamId,
        userId: authReq.user!.userId,
      });
      
      // Trigger webhook event
      const webhookEvents = getWebhookEventTrigger(prisma);
      await webhookEvents.projectCreated(project, team!, authReq.user!.userId);
      
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to create project", { error });
      res.status(500).json({ error: "Failed to create project" });
    }
  }
);

// GET /api/v2/projects/:projectId - Get project details
router.get(
  "/:projectId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { projectId } = req.params;
    
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: authReq.user!.teamId,
        },
        include: {
          deployments: {
            take: 5,
            orderBy: { createdAt: "desc" },
          },
          domains: true,
          environmentVariables: {
            select: {
              key: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      logger.error("Failed to get project", { error });
      res.status(500).json({ error: "Failed to get project" });
    }
  }
);

// PATCH /api/v2/projects/:projectId - Update project
router.patch(
  "/:projectId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { projectId } = req.params;
    
    try {
      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        status: z.enum(["active", "paused", "deleted"]).optional(),
        buildCommand: z.string().optional(),
        outputDirectory: z.string().optional(),
        installCommand: z.string().optional(),
        devCommand: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Verify ownership
      const existingProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: authReq.user!.teamId,
        },
      });
      
      if (!existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Update build settings in metadata if provided
      const metadata = { ...(existingProject.metadata as any) };
      if (data.buildCommand || data.outputDirectory || data.installCommand || data.devCommand) {
        metadata.buildSettings = {
          ...metadata.buildSettings,
          ...(data.buildCommand && { buildCommand: data.buildCommand }),
          ...(data.outputDirectory && { outputDirectory: data.outputDirectory }),
          ...(data.installCommand && { installCommand: data.installCommand }),
          ...(data.devCommand && { devCommand: data.devCommand }),
        };
      }
      
      const project = await prisma.project.update({
        where: { id: projectId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status && { status: data.status }),
          metadata,
        },
      });
      
      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to update project", { error });
      res.status(500).json({ error: "Failed to update project" });
    }
  }
);

// DELETE /api/v2/projects/:projectId - Delete project
router.delete(
  "/:projectId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { projectId } = req.params;
    
    try {
      // Verify ownership
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: authReq.user!.teamId,
        },
      });
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Soft delete by updating status
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "deleted",
          metadata: {
            ...(project.metadata as any),
            deletedAt: new Date(),
            deletedBy: authReq.user!.userId,
          },
        },
      });
      
      logger.info("Project deleted", {
        projectId,
        teamId: authReq.user!.teamId,
        userId: authReq.user!.userId,
      });
      
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete project", { error });
      res.status(500).json({ error: "Failed to delete project" });
    }
  }
);

export { router as projectsRouter };