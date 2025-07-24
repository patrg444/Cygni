import { PrismaClient } from "@prisma/client";
import {
  AuditEventType,
  ActorType,
  RiskLevel,
  eventRiskLevels,
  alertableEvents,
} from "./audit-events";
import logger from "../../lib/logger";
import { recordError } from "../../lib/metrics";

export interface AuditLogEntry {
  action: AuditEventType | string;
  actorId?: string;
  actorType: ActorType;
  actorEmail?: string;
  actorIp?: string;
  actorUserAgent?: string;
  resourceType: string;
  resourceId?: string;
  teamId?: string;
  projectId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  method?: string;
  path?: string;
  statusCode?: number;
}

export interface AuditContext {
  user?: {
    id: string;
    email: string;
    teamId: string;
  };
  apiKey?: {
    id: string;
    name: string;
  };
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
}

export class AuditLoggerService {
  private prisma: PrismaClient;
  private queue: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timer | null = null;
  private readonly batchSize = 100;
  private readonly flushIntervalMs = 5000; // 5 seconds

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.startBatchProcessor();
  }

  private startBatchProcessor(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  async log(entry: AuditLogEntry, context?: AuditContext): Promise<void> {
    try {
      // Determine risk level
      const riskLevel = this.determineRiskLevel(entry.action);

      // Build complete audit log entry
      const auditLog = {
        action: entry.action,
        actorId: entry.actorId || context?.user?.id,
        actorType: entry.actorType,
        actorEmail: entry.actorEmail || context?.user?.email,
        actorIp: entry.actorIp || context?.ip,
        actorUserAgent: entry.actorUserAgent || context?.userAgent,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        teamId: entry.teamId || context?.user?.teamId,
        projectId: entry.projectId,
        oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        method: entry.method || context?.method,
        path: entry.path || context?.path,
        statusCode: entry.statusCode || context?.statusCode,
        riskLevel,
      };

      // Add to queue for batch processing
      this.queue.push(auditLog as any);

      // Flush immediately for high-risk events
      if (riskLevel === RiskLevel.CRITICAL || this.queue.length >= this.batchSize) {
        await this.flush();
      }

      // Check if this event requires alerting
      if (alertableEvents.has(entry.action as AuditEventType)) {
        this.triggerAlert(auditLog);
      }

      // Log to application logs as well
      logger.info("Audit event", {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        actorId: auditLog.actorId,
        riskLevel,
      });
    } catch (error) {
      logger.error("Failed to create audit log", { error, entry });
      recordError("audit_log_failed", "error");
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      await this.prisma.auditLog.createMany({
        data: batch.map(entry => ({
          ...entry,
          timestamp: new Date(),
        })),
      });

      logger.debug(`Flushed ${batch.length} audit log entries`);
    } catch (error) {
      logger.error("Failed to flush audit logs", { error, count: batch.length });
      recordError("audit_log_flush_failed", "error");
      
      // Put failed entries back in queue for retry
      this.queue.unshift(...batch);
    }
  }

  private determineRiskLevel(action: string): RiskLevel {
    return eventRiskLevels[action] || RiskLevel.LOW;
  }

  private triggerAlert(auditLog: any): void {
    // In a real implementation, this would send to an alerting service
    logger.warn("Alertable audit event detected", {
      action: auditLog.action,
      actorId: auditLog.actorId,
      resourceType: auditLog.resourceType,
      riskLevel: auditLog.riskLevel,
    });
  }

  // Helper methods for common audit scenarios

  async logUserAction(
    action: AuditEventType,
    userId: string,
    context: AuditContext,
    metadata?: any
  ): Promise<void> {
    await this.log({
      action,
      actorType: ActorType.USER,
      resourceType: "user",
      resourceId: userId,
      metadata,
    }, context);
  }

  async logTeamAction(
    action: AuditEventType,
    teamId: string,
    context: AuditContext,
    oldValues?: any,
    newValues?: any
  ): Promise<void> {
    await this.log({
      action,
      actorType: ActorType.USER,
      resourceType: "team",
      resourceId: teamId,
      teamId,
      oldValues,
      newValues,
    }, context);
  }

  async logProjectAction(
    action: AuditEventType,
    projectId: string,
    teamId: string,
    context: AuditContext,
    metadata?: any
  ): Promise<void> {
    await this.log({
      action,
      actorType: ActorType.USER,
      resourceType: "project",
      resourceId: projectId,
      teamId,
      projectId,
      metadata,
    }, context);
  }

  async logSecurityEvent(
    action: AuditEventType,
    context: AuditContext,
    metadata: any
  ): Promise<void> {
    await this.log({
      action,
      actorType: context.user ? ActorType.USER : ActorType.SYSTEM,
      resourceType: "security",
      metadata,
    }, context);
  }

  async logDataAccess(
    action: AuditEventType,
    resourceType: string,
    resourceId: string,
    context: AuditContext,
    metadata?: any
  ): Promise<void> {
    await this.log({
      action,
      actorType: ActorType.USER,
      resourceType,
      resourceId,
      metadata: {
        ...metadata,
        accessTime: new Date(),
        dataClassification: metadata?.sensitive ? "sensitive" : "normal",
      },
    }, context);
  }

  // Query methods

  async getAuditLogs(filters: {
    teamId?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: RiskLevel;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action) where.action = filters.action;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.riskLevel) where.riskLevel = filters.riskLevel;

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    });
  }

  async getAuditLogStats(teamId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.auditLog.groupBy({
      by: ["action", "riskLevel"],
      where: {
        teamId,
        timestamp: { gte: startDate },
      },
      _count: true,
    });

    const byRiskLevel = await this.prisma.auditLog.groupBy({
      by: ["riskLevel"],
      where: {
        teamId,
        timestamp: { gte: startDate },
      },
      _count: true,
    });

    const topActors = await this.prisma.auditLog.groupBy({
      by: ["actorId", "actorEmail"],
      where: {
        teamId,
        timestamp: { gte: startDate },
      },
      _count: true,
      orderBy: {
        _count: {
          actorId: "desc",
        },
      },
      take: 10,
    });

    return {
      totalEvents: logs.reduce((sum, log) => sum + log._count, 0),
      byAction: logs,
      byRiskLevel,
      topActors,
      period: { startDate, endDate: new Date() },
    };
  }
}

// Export singleton instance
let auditLogger: AuditLoggerService | null = null;

export function getAuditLogger(prisma: PrismaClient): AuditLoggerService {
  if (!auditLogger) {
    auditLogger = new AuditLoggerService(prisma);
  }
  return auditLogger;
}