import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { requireRole, requirePermission } from "../middleware/permission.middleware";
import { getSOC2ComplianceService } from "../services/compliance/soc2-compliance.service";
import { getDataRetentionService } from "../services/compliance/data-retention.service";
import { getSecurityPolicyService } from "../services/security/security-policy.service";
import { getDataEncryptionService } from "../services/security/data-encryption.service";
import { getAccessMonitoringService } from "../services/security/access-monitoring.service";
import { getSecurityEventMonitor, SecurityEventType } from "../services/security/security-event-monitor.service";
import { getAuditLogger } from "../services/audit/audit-logger.service";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();
const soc2Service = getSOC2ComplianceService(prisma);
const retentionService = getDataRetentionService(prisma);
const securityPolicyService = getSecurityPolicyService(prisma);
const encryptionService = getDataEncryptionService(prisma);
const accessMonitoringService = getAccessMonitoringService(prisma);
const securityEventMonitor = getSecurityEventMonitor(prisma);
const auditLogger = getAuditLogger(prisma);

interface AuthenticatedRequest extends Request {
  user?: any;
}

// Apply JWT middleware to all routes
router.use(jwtMiddleware(jwtService));

// GET /api/compliance/soc2/status - Get SOC2 compliance status
router.get(
  "/compliance/soc2/status",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const report = await soc2Service.assessCompliance(req.user!.teamId);
      
      res.json({
        complianceScore: report.summary.complianceScore,
        summary: report.summary,
        lastAssessed: report.generatedAt,
      });
    } catch (error) {
      logger.error("Failed to get SOC2 status", { error });
      res.status(500).json({ error: "Failed to get compliance status" });
    }
  }
);

// GET /api/compliance/soc2/report - Generate SOC2 compliance report
router.get(
  "/compliance/soc2/report",
  requireRole("owner", "admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const format = req.query.format as string || "json";
      const report = await soc2Service.generateComplianceReport(
        req.user!.teamId,
        format as any
      );
      
      await securityEventMonitor.logSecurityEvent(
        SecurityEventType.DATA_EXPORT,
        {
          teamId: req.user!.teamId,
          userId: req.user!.userId,
          details: {
            reportType: "soc2_compliance",
            format,
          },
        }
      );
      
      if (format === "json") {
        res.json(report);
      } else {
        res.status(501).json({ error: "PDF format not yet implemented" });
      }
    } catch (error) {
      logger.error("Failed to generate SOC2 report", { error });
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// GET /api/compliance/soc2/controls - Get SOC2 control details
router.get(
  "/compliance/soc2/controls",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const category = req.query.category as string;
      
      let controls;
      if (category) {
        controls = soc2Service.getControlsByCategory(category);
      } else {
        controls = soc2Service.getSOC2Controls();
      }
      
      res.json({ controls });
    } catch (error) {
      logger.error("Failed to get SOC2 controls", { error });
      res.status(500).json({ error: "Failed to get controls" });
    }
  }
);

// GET /api/compliance/soc2/readiness - Check SOC2 readiness
router.get(
  "/compliance/soc2/readiness",
  requireRole("owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const readiness = await soc2Service.checkSOC2Readiness(req.user!.teamId);
      res.json(readiness);
    } catch (error) {
      logger.error("Failed to check SOC2 readiness", { error });
      res.status(500).json({ error: "Failed to check readiness" });
    }
  }
);

// GET /api/compliance/soc2/history - Get compliance history
router.get(
  "/compliance/soc2/history",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const history = await soc2Service.trackComplianceHistory(
        req.user!.teamId,
        days
      );
      
      res.json(history);
    } catch (error) {
      logger.error("Failed to get compliance history", { error });
      res.status(500).json({ error: "Failed to get history" });
    }
  }
);

// GET /api/compliance/retention/policy - Get data retention policy
router.get(
  "/compliance/retention/policy",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const policy = await retentionService.getRetentionPolicy(req.user!.teamId);
      res.json({ policy });
    } catch (error) {
      logger.error("Failed to get retention policy", { error });
      res.status(500).json({ error: "Failed to get policy" });
    }
  }
);

// PUT /api/compliance/retention/policy - Update retention policy
router.put(
  "/compliance/retention/policy",
  requireRole("owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const schema = z.object({
        auditLogs: z.number().min(2555).optional(), // 7 years minimum
        notifications: z.number().min(30).optional(),
        usageData: z.number().min(365).optional(),
        personalData: z.number().min(30).optional(),
      });
      
      const updates = schema.parse(req.body);
      const policy = await retentionService.updateRetentionPolicy(
        req.user!.teamId,
        updates
      );
      
      await auditLogger.log({
        action: "compliance.retention_policy_updated",
        actorType: "user" as any,
        actorId: req.user!.userId,
        resourceType: "retention_policy",
        resourceId: req.user!.teamId,
        teamId: req.user!.teamId,
        metadata: updates,
      });
      
      res.json({ policy });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to update retention policy", { error });
      res.status(500).json({ error: "Failed to update policy" });
    }
  }
);

// POST /api/compliance/retention/execute - Manually execute retention
router.post(
  "/compliance/retention/execute",
  requireRole("owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const report = await retentionService.processTeamRetention(req.user!.teamId);
      
      await securityEventMonitor.logSecurityEvent(
        SecurityEventType.DATA_DELETION,
        {
          teamId: req.user!.teamId,
          userId: req.user!.userId,
          details: {
            type: "retention_execution",
            report,
          },
        }
      );
      
      res.json({ report });
    } catch (error) {
      logger.error("Failed to execute retention", { error });
      res.status(500).json({ error: "Failed to execute retention" });
    }
  }
);

// GET /api/compliance/retention/stats - Get retention statistics
router.get(
  "/compliance/retention/stats",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await retentionService.getRetentionStats(req.user!.teamId);
      res.json(stats);
    } catch (error) {
      logger.error("Failed to get retention stats", { error });
      res.status(500).json({ error: "Failed to get statistics" });
    }
  }
);

// GET /api/compliance/security/policy - Get security policy
router.get(
  "/compliance/security/policy",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const policy = await securityPolicyService.getSecurityPolicy(req.user!.teamId);
      res.json({ policy });
    } catch (error) {
      logger.error("Failed to get security policy", { error });
      res.status(500).json({ error: "Failed to get policy" });
    }
  }
);

// GET /api/compliance/security/report - Get security report
router.get(
  "/compliance/security/report",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const report = await securityPolicyService.generateSecurityReport(
        req.user!.teamId
      );
      res.json(report);
    } catch (error) {
      logger.error("Failed to generate security report", { error });
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// GET /api/compliance/encryption/status - Get encryption status
router.get(
  "/compliance/encryption/status",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = encryptionService.validateEncryptionSetup();
      const metrics = await encryptionService.getEncryptionMetrics();
      const compliance = await securityPolicyService.checkEncryptionCompliance(
        req.user!.teamId
      );
      
      res.json({
        setup: validation,
        metrics,
        compliance,
      });
    } catch (error) {
      logger.error("Failed to get encryption status", { error });
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

// GET /api/compliance/access/report - Get access monitoring report
router.get(
  "/compliance/access/report",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const report = await accessMonitoringService.generateAccessReport(
        req.user!.teamId,
        { start: startDate, end: endDate }
      );
      
      res.json(report);
    } catch (error) {
      logger.error("Failed to generate access report", { error });
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// GET /api/compliance/security/events - Get security events
router.get(
  "/compliance/security/events",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const metrics = await securityEventMonitor.getSecurityMetrics(
        req.user!.teamId,
        { start: startDate, end: endDate }
      );
      
      res.json(metrics);
    } catch (error) {
      logger.error("Failed to get security events", { error });
      res.status(500).json({ error: "Failed to get events" });
    }
  }
);

// GET /api/compliance/security/alerts - Get active security alerts
router.get(
  "/compliance/security/alerts",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const alerts = await securityEventMonitor.getActiveAlerts(req.user!.teamId);
      res.json({ alerts });
    } catch (error) {
      logger.error("Failed to get security alerts", { error });
      res.status(500).json({ error: "Failed to get alerts" });
    }
  }
);

// POST /api/compliance/security/alerts/:alertId/acknowledge - Acknowledge alert
router.post(
  "/compliance/security/alerts/:alertId/acknowledge",
  requirePermission("compliance", "update"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertId } = req.params;
      
      await securityEventMonitor.acknowledgeAlert(
        alertId,
        req.user!.userId,
        req.user!.teamId
      );
      
      res.json({ message: "Alert acknowledged" });
    } catch (error) {
      logger.error("Failed to acknowledge alert", { error });
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  }
);

// GET /api/compliance/gdpr/export/:userId - Export user data (GDPR)
router.get(
  "/compliance/gdpr/export/:userId",
  requirePermission("users", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      // Verify user belongs to team
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: req.user!.teamId,
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const data = await retentionService.exportUserData(userId);
      
      await securityEventMonitor.logSecurityEvent(
        SecurityEventType.DATA_EXPORT,
        {
          teamId: req.user!.teamId,
          userId: req.user!.userId,
          details: {
            exportedUserId: userId,
            recordCounts: {
              notifications: data.notifications.length,
              auditLogs: data.auditLogs.length,
              oauthAccounts: data.oauthAccounts.length,
            },
          },
        }
      );
      
      res.json(data);
    } catch (error) {
      logger.error("Failed to export user data", { error });
      res.status(500).json({ error: "Failed to export data" });
    }
  }
);

// DELETE /api/compliance/gdpr/delete/:userId - Delete user data (GDPR)
router.delete(
  "/compliance/gdpr/delete/:userId",
  requireRole("owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      const schema = z.object({
        deleteAccount: z.boolean().default(true),
        anonymize: z.boolean().default(false),
      });
      
      const options = schema.parse(req.body);
      
      // Verify user belongs to team
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: req.user!.teamId,
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const result = await retentionService.deleteUserData(userId, options);
      
      await securityEventMonitor.logSecurityEvent(
        SecurityEventType.DATA_DELETION,
        {
          teamId: req.user!.teamId,
          userId: req.user!.userId,
          severity: "high",
          details: {
            deletedUserId: userId,
            options,
            result,
          },
        }
      );
      
      res.json({
        message: "User data processed",
        result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to delete user data", { error });
      res.status(500).json({ error: "Failed to process request" });
    }
  }
);

// GET /api/compliance/summary - Get overall compliance summary
router.get(
  "/compliance/summary",
  requirePermission("compliance", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [soc2Report, securityReport, retentionStats] = await Promise.all([
        soc2Service.assessCompliance(req.user!.teamId),
        securityPolicyService.generateSecurityReport(req.user!.teamId),
        retentionService.getRetentionStats(req.user!.teamId),
      ]);
      
      const summary = {
        soc2: {
          score: soc2Report.summary.complianceScore,
          status: soc2Report.summary.complianceScore >= 90 ? "compliant" : "non-compliant",
          lastAssessed: soc2Report.generatedAt,
        },
        security: {
          violations: securityReport.violations.length,
          compliance: securityReport.compliance,
          metrics: securityReport.metrics,
        },
        dataRetention: {
          compliant: retentionStats.retentionCompliance.compliant,
          dataAges: retentionStats.dataAges,
        },
        overallStatus: soc2Report.summary.complianceScore >= 90 &&
                      securityReport.compliance.overall &&
                      retentionStats.retentionCompliance.compliant
                      ? "compliant" : "needs-attention",
      };
      
      res.json(summary);
    } catch (error) {
      logger.error("Failed to get compliance summary", { error });
      res.status(500).json({ error: "Failed to get summary" });
    }
  }
);

export { router as complianceRouter };