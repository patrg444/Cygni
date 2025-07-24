import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { LogAggregatorService } from "../services/logging/log-aggregator.service";
import { jwtMiddleware } from "../services/auth/jwt-rotation.service";
import { jwtService } from "./auth";

const router = Router();
const prisma = new PrismaClient();
const logAggregator = new LogAggregatorService(prisma);

// Query schema
const logQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  level: z.enum(["error", "warn", "info", "http", "debug"]).optional(),
  userId: z.string().optional(),
  teamId: z.string().optional(),
  projectId: z.string().optional(),
  requestId: z.string().optional(),
  service: z.string().optional(),
  message: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
});

// Export schema
const exportSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  format: z.enum(["json", "csv"]).optional(),
});

// GET /api/logs - Query logs
router.get(
  "/logs",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only admins and owners can view logs
      if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const query = logQuerySchema.parse(req.query);

      // Convert string dates to Date objects
      const logQuery = {
        ...query,
        startTime: query.startTime ? new Date(query.startTime) : undefined,
        endTime: query.endTime ? new Date(query.endTime) : undefined,
        teamId: req.user.teamId, // Restrict to user's team
      };

      const logs = await logAggregator.queryLogs(logQuery);

      res.json({
        logs,
        count: logs.length,
      });
    } catch (error) {
      req.logger?.error("Failed to query logs", { error });
      res.status(500).json({ error: "Failed to query logs" });
    }
  },
);

// GET /api/logs/stats - Get log statistics
router.get(
  "/logs/stats",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only admins and owners can view stats
      if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { startTime, endTime } = logQuerySchema.parse(req.query);

      if (!startTime || !endTime) {
        return res.status(400).json({
          error: "startTime and endTime are required",
        });
      }

      const stats = await logAggregator.getLogStats(
        new Date(startTime),
        new Date(endTime),
      );

      res.json(stats);
    } catch (error) {
      req.logger?.error("Failed to get log stats", { error });
      res.status(500).json({ error: "Failed to get log stats" });
    }
  },
);

// GET /api/logs/user/:userId - Get user activity logs
router.get(
  "/logs/user/:userId",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { userId } = req.params;
      const { startTime, endTime } = logQuerySchema.parse(req.query);

      // Users can view their own logs, admins can view any
      if (
        req.user.userId !== userId &&
        !["owner", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await logAggregator.getUserActivity(
        userId,
        startTime ? new Date(startTime) : undefined,
        endTime ? new Date(endTime) : undefined,
      );

      res.json({
        logs,
        count: logs.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get user activity", { error });
      res.status(500).json({ error: "Failed to get user activity" });
    }
  },
);

// GET /api/logs/project/:projectId - Get project logs
router.get(
  "/logs/project/:projectId",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { projectId } = req.params;
      const { deploymentId } = req.query;

      // Verify project belongs to user's team
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: req.user.teamId,
        },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const logs = await logAggregator.getDeploymentLogs(
        projectId,
        deploymentId as string,
      );

      res.json({
        logs,
        count: logs.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get project logs", { error });
      res.status(500).json({ error: "Failed to get project logs" });
    }
  },
);

// GET /api/logs/errors - Get error logs
router.get(
  "/logs/errors",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only admins and owners can view error logs
      if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { startTime, endTime } = logQuerySchema.parse(req.query);

      if (!startTime || !endTime) {
        // Default to last 24 hours
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

        const logs = await logAggregator.getErrorLogs(start, end, {
          teamId: req.user.teamId,
        });

        res.json({
          logs,
          count: logs.length,
          period: { start, end },
        });
      } else {
        const logs = await logAggregator.getErrorLogs(
          new Date(startTime),
          new Date(endTime),
          { teamId: req.user.teamId },
        );

        res.json({
          logs,
          count: logs.length,
        });
      }
    } catch (error) {
      req.logger?.error("Failed to get error logs", { error });
      res.status(500).json({ error: "Failed to get error logs" });
    }
  },
);

// GET /api/logs/security - Get security event logs
router.get(
  "/logs/security",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners can view security logs
      if (req.user.role !== "owner") {
        return res.status(403).json({ error: "Access denied" });
      }

      const { startTime, endTime, severity } = req.query;

      if (!startTime || !endTime) {
        return res.status(400).json({
          error: "startTime and endTime are required",
        });
      }

      const logs = await logAggregator.getSecurityLogs(
        new Date(startTime as string),
        new Date(endTime as string),
        severity as string,
      );

      res.json({
        logs,
        count: logs.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get security logs", { error });
      res.status(500).json({ error: "Failed to get security logs" });
    }
  },
);

// GET /api/logs/billing - Get billing event logs
router.get(
  "/logs/billing",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners can view billing logs
      if (req.user.role !== "owner") {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await logAggregator.getBillingLogs(req.user.teamId);

      res.json({
        logs,
        count: logs.length,
      });
    } catch (error) {
      req.logger?.error("Failed to get billing logs", { error });
      res.status(500).json({ error: "Failed to get billing logs" });
    }
  },
);

// GET /api/logs/export - Export logs
router.get(
  "/logs/export",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only admins and owners can export logs
      if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const query = exportSchema.parse(req.query);
      const format = query.format || "json";

      const logQuery = {
        startTime: new Date(query.startTime),
        endTime: new Date(query.endTime),
        teamId: req.user.teamId,
      };

      const data = await logAggregator.exportLogs(logQuery, format);

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=logs-${query.startTime}-to-${query.endTime}.csv`,
        );
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=logs-${query.startTime}-to-${query.endTime}.json`,
        );
      }

      res.send(data);
    } catch (error) {
      req.logger?.error("Failed to export logs", { error });
      res.status(500).json({ error: "Failed to export logs" });
    }
  },
);

// GET /api/logs/stream - Stream logs in real-time (development only)
router.get(
  "/logs/stream",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ 
          error: "Log streaming is not available in production" 
        });
      }

      // Only admins and owners can stream logs
      if (!["owner", "admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const filter = {
        teamId: req.user.teamId,
      };

      // Stream logs
      for await (const log of logAggregator.streamLogs(filter)) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
    } catch (error) {
      req.logger?.error("Failed to stream logs", { error });
      res.status(500).json({ error: "Failed to stream logs" });
    }
  },
);

export { router as logsRouter };