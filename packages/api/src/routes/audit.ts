import { Router, Request, Response } from "express";
import { z } from "zod";
import { jwtMiddleware, jwtService } from "./auth";
import { getAuditLogger } from "../services/audit/audit-logger.service";
import { RiskLevel } from "../services/audit/audit-events";
import { PrismaClient } from "@prisma/client";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    teamId: string;
    userId: string;
    role: string;
  };
}

// Query schema
const auditLogQuerySchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

// GET /api/audit/logs - Get audit logs
router.get(
  "/audit/logs",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view audit logs
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const query = auditLogQuerySchema.parse(req.query);
      const auditLogger = getAuditLogger(prisma);
      
      const logs = await auditLogger.getAuditLogs({
        teamId: authReq.user.teamId,
        actorId: query.actorId,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        riskLevel: query.riskLevel as RiskLevel,
        limit: query.limit,
        offset: query.offset,
      });
      
      res.json({
        logs,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: logs.length,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to fetch audit logs", { error });
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  }
);

// GET /api/audit/logs/:id - Get specific audit log
router.get(
  "/audit/logs/:id",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view audit logs
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const log = await prisma.auditLog.findFirst({
        where: {
          id: req.params.id,
          teamId: authReq.user.teamId,
        },
      });
      
      if (!log) {
        return res.status(404).json({ error: "Audit log not found" });
      }
      
      res.json({ log });
    } catch (error) {
      logger.error("Failed to fetch audit log", { error });
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  }
);

// GET /api/audit/stats - Get audit statistics
router.get(
  "/audit/stats",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view audit stats
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const days = parseInt(req.query.days as string) || 30;
      const auditLogger = getAuditLogger(prisma);
      
      const stats = await auditLogger.getAuditLogStats(authReq.user.teamId, days);
      
      res.json({ stats });
    } catch (error) {
      logger.error("Failed to fetch audit stats", { error });
      res.status(500).json({ error: "Failed to fetch audit stats" });
    }
  }
);

// GET /api/audit/export - Export audit logs
router.get(
  "/audit/export",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can export audit logs
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const format = req.query.format as string || "json";
      const query = auditLogQuerySchema.parse(req.query);
      const auditLogger = getAuditLogger(prisma);
      
      // Log the export action itself
      await auditLogger.logDataAccess(
        "data.exported" as any,
        "audit_logs",
        "all",
        {
          user: authReq.user,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
        {
          format,
          filters: query,
        }
      );
      
      const logs = await auditLogger.getAuditLogs({
        teamId: authReq.user.teamId,
        ...query,
        limit: 10000, // Higher limit for exports
      });
      
      if (format === "csv") {
        // Convert to CSV
        const csv = convertToCSV(logs);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=audit-logs-${Date.now()}.csv`);
        res.send(csv);
      } else {
        // Default to JSON
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=audit-logs-${Date.now()}.json`);
        res.json({ logs });
      }
    } catch (error) {
      logger.error("Failed to export audit logs", { error });
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  }
);

// GET /api/audit/retention - Get retention policy
router.get(
  "/audit/retention",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const retention = await prisma.auditLogRetention.findUnique({
        where: { teamId: authReq.user!.teamId },
      });
      
      res.json({
        retention: retention || {
          retentionDays: 90,
          archiveEnabled: false,
        },
      });
    } catch (error) {
      logger.error("Failed to fetch retention policy", { error });
      res.status(500).json({ error: "Failed to fetch retention policy" });
    }
  }
);

// PUT /api/audit/retention - Update retention policy
router.put(
  "/audit/retention",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only owners can update retention policy
      if (authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Only team owners can update retention policy" });
      }
      
      const schema = z.object({
        retentionDays: z.number().min(30).max(3650), // 30 days to 10 years
        archiveEnabled: z.boolean(),
        archiveLocation: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const auditLogger = getAuditLogger(prisma);
      
      const retention = await prisma.auditLogRetention.upsert({
        where: { teamId: authReq.user.teamId },
        create: {
          teamId: authReq.user.teamId,
          ...data,
        },
        update: data,
      });
      
      // Log the retention policy change
      await auditLogger.log({
        action: "compliance.retention_changed" as any,
        actorType: "user" as any,
        resourceType: "audit_retention",
        resourceId: retention.id,
        teamId: authReq.user.teamId,
        newValues: data,
      }, {
        user: authReq.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ retention });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to update retention policy", { error });
      res.status(500).json({ error: "Failed to update retention policy" });
    }
  }
);

// Helper function to convert logs to CSV
function convertToCSV(logs: any[]): string {
  if (logs.length === 0) return "";
  
  const headers = [
    "timestamp",
    "action",
    "actorEmail",
    "actorIp",
    "resourceType",
    "resourceId",
    "method",
    "path",
    "statusCode",
    "riskLevel",
  ];
  
  const rows = logs.map(log => [
    log.timestamp,
    log.action,
    log.actorEmail || "",
    log.actorIp || "",
    log.resourceType,
    log.resourceId || "",
    log.method || "",
    log.path || "",
    log.statusCode || "",
    log.riskLevel,
  ]);
  
  return [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n");
}

export { router as auditRouter };