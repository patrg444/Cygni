import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { UsageCollectorService } from "../services/usage/usage-collector.service";
import { jwtMiddleware } from "../services/auth/jwt-rotation.service";
import { jwtService } from "./auth";

const router = Router();
const prisma = new PrismaClient();
const usageCollector = new UsageCollectorService(prisma);

// Start usage collection
usageCollector.startCollectionJobs();

// Analytics query schema
const analyticsSchema = z.object({
  projectId: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  groupBy: z.enum(["hour", "day", "week", "month"]).optional(),
});

// Export schema
const exportSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  format: z.enum(["csv", "json"]).optional(),
});

// GET /api/usage/analytics - Get usage analytics
router.get(
  "/usage/analytics",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const query = analyticsSchema.parse(req.query);
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      if (query.projectId) {
        // Verify project belongs to user's team
        const project = await prisma.project.findFirst({
          where: {
            id: query.projectId,
            teamId: req.user.teamId,
          },
        });

        if (!project) {
          return res.status(403).json({ error: "Project not found" });
        }

        const analytics = await usageCollector.getProjectAnalytics(
          query.projectId,
          startDate,
          endDate,
        );

        res.json(analytics);
      } else {
        // Get all projects for team
        const projects = await prisma.project.findMany({
          where: { teamId: req.user.teamId },
        });

        const analytics = await Promise.all(
          projects.map((project) =>
            usageCollector.getProjectAnalytics(
              project.id,
              startDate,
              endDate,
            ),
          ),
        );

        res.json({ projects: analytics });
      }
    } catch (error) {
      console.error("Get analytics error:", error);
      res.status(500).json({ error: "Failed to get analytics" });
    }
  },
);

// GET /api/usage/summary - Get usage summary
router.get(
  "/usage/summary",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Default to current month
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Get all projects for team
      const projects = await prisma.project.findMany({
        where: { teamId: req.user.teamId },
      });

      const projectIds = projects.map((p) => p.id);

      // Get aggregated usage
      const usage = await prisma.usageEvent.groupBy({
        by: ["projectId", "metricType"],
        where: {
          projectId: { in: projectIds },
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          quantity: true,
        },
      });

      // Calculate costs
      const projectCosts = new Map<string, number>();
      const metricTotals = new Map<string, number>();

      for (const item of usage) {
        const quantity = item._sum.quantity?.toNumber() || 0;
        let cost = 0;

        switch (item.metricType) {
          case "cpu_seconds":
            cost = quantity * (0.05 / 3600);
            break;
          case "memory_gb_hours":
            cost = quantity * 0.01;
            break;
          case "storage_gb_hours":
            cost = quantity * 0.0001;
            break;
          case "egress_gb":
            cost = quantity * 0.09;
            break;
          case "requests":
            cost = quantity * 0.0000002;
            break;
        }

        // Update project cost
        const currentProjectCost = projectCosts.get(item.projectId) || 0;
        projectCosts.set(item.projectId, currentProjectCost + cost);

        // Update metric totals
        const currentMetricTotal = metricTotals.get(item.metricType) || 0;
        metricTotals.set(item.metricType, currentMetricTotal + quantity);
      }

      // Format response
      const projectSummaries = projects.map((project) => ({
        id: project.id,
        name: project.name,
        cost: projectCosts.get(project.id) || 0,
        status: project.status,
        budgetExceededAt: project.budgetExceededAt,
      }));

      const totalCost = Array.from(projectCosts.values()).reduce(
        (sum, cost) => sum + cost,
        0,
      );

      res.json({
        period: {
          start: startDate,
          end: endDate,
        },
        projects: projectSummaries,
        totals: {
          cost: totalCost,
          metrics: Object.fromEntries(metricTotals),
        },
        currency: "USD",
      });
    } catch (error) {
      console.error("Get usage summary error:", error);
      res.status(500).json({ error: "Failed to get usage summary" });
    }
  },
);

// GET /api/usage/limits - Get usage limits and alerts
router.get(
  "/usage/limits",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: req.user.teamId },
        include: {
          projects: {
            include: {
              _count: {
                select: { deployments: true },
              },
            },
          },
        },
      });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      // Get budget limit from env or team settings
      const defaultLimit = parseFloat(
        process.env.DEFAULT_BUDGET_LIMIT || "100",
      );

      const limits = team.projects.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        budgetLimit: defaultLimit, // TODO: Support per-project limits
        budgetExceeded: !!project.budgetExceededAt,
        suspended: project.status === "suspended",
        deployments: project._count.deployments,
      }));

      res.json({
        defaultLimit,
        projects: limits,
        notifications: {
          warningThreshold: 0.8, // 80%
          criticalThreshold: 1.0, // 100%
        },
      });
    } catch (error) {
      console.error("Get usage limits error:", error);
      res.status(500).json({ error: "Failed to get usage limits" });
    }
  },
);

// POST /api/usage/limits - Update usage limits
router.post(
  "/usage/limits",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const schema = z.object({
        projectId: z.string(),
        budgetLimit: z.number().positive(),
      });

      const { projectId, budgetLimit } = schema.parse(req.body);

      // Verify project belongs to team
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: req.user.teamId,
        },
      });

      if (!project) {
        return res.status(403).json({ error: "Project not found" });
      }

      // TODO: Store per-project budget limits
      // For now, just return success
      res.json({
        success: true,
        projectId,
        budgetLimit,
      });
    } catch (error) {
      console.error("Update usage limits error:", error);
      res.status(500).json({ error: "Failed to update usage limits" });
    }
  },
);

// GET /api/usage/export - Export usage data
router.get(
  "/usage/export",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const query = exportSchema.parse(req.query);
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      const format = query.format || "json";

      const data = await usageCollector.exportUsageData(
        req.user.teamId,
        startDate,
        endDate,
        format,
      );

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=usage-${startDate.toISOString().split("T")[0]}-to-${
            endDate.toISOString().split("T")[0]
          }.csv`,
        );
        res.send(data);
      } else {
        res.json(data);
      }
    } catch (error) {
      console.error("Export usage error:", error);
      res.status(500).json({ error: "Failed to export usage data" });
    }
  },
);

// GET /api/usage/notifications - Get usage-related notifications
router.get(
  "/usage/notifications",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const notifications = await prisma.notification.findMany({
        where: {
          userId: req.user.userId,
          type: {
            in: ["budget_warning", "budget_exceeded", "usage_anomaly"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });

      res.json({ notifications });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  },
);

// POST /api/usage/notifications/:id/read - Mark notification as read
router.post(
  "/usage/notifications/:id/read",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id: req.params.id,
          userId: req.user.userId,
        },
      });

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      await prisma.notification.update({
        where: { id: req.params.id },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  },
);

export { router as usageRouter };