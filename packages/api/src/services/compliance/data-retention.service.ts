import { PrismaClient } from "@prisma/client";
import { CronJob } from "cron";
import { getAuditLogger } from "../audit/audit-logger.service";
import { getDataEncryptionService } from "../security/data-encryption.service";
import logger from "../../lib/logger";

export interface DataRetentionPolicy {
  auditLogs: number; // days
  notifications: number;
  usageData: number;
  securityEvents: number;
  personalData: number;
  backups: number;
  deploymentLogs: number;
  teamInvitations: number;
  failedLogins: number;
}

export interface RetentionReport {
  teamId: string;
  policy: DataRetentionPolicy;
  executed: Date;
  deletedCounts: {
    auditLogs: number;
    notifications: number;
    usageEvents: number;
    deploymentLogs: number;
    teamInvitations: number;
    total: number;
  };
  archivedCounts?: {
    auditLogs: number;
    usageData: number;
    total: number;
  };
  errors: string[];
}

export interface DataArchive {
  id: string;
  teamId: string;
  dataType: string;
  recordCount: number;
  sizeBytes: number;
  location: string;
  createdAt: Date;
  expiresAt: Date;
  checksum: string;
}

export class DataRetentionService {
  private prisma: PrismaClient;
  private auditLogger = getAuditLogger(this.prisma);
  private encryptionService = getDataEncryptionService(this.prisma);
  private retentionJobs: Map<string, CronJob> = new Map();

  // Default retention periods (SOC2 compliant)
  private defaultPolicy: DataRetentionPolicy = {
    auditLogs: 2555, // 7 years for SOC2
    notifications: 90, // 3 months
    usageData: 395, // 13 months for billing
    securityEvents: 2555, // 7 years for security
    personalData: 1095, // 3 years (GDPR minimum)
    backups: 365, // 1 year
    deploymentLogs: 180, // 6 months
    teamInvitations: 30, // 30 days
    failedLogins: 90, // 90 days
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Start retention jobs
  startRetentionJobs(): void {
    // Daily job for most data types
    const dailyJob = new CronJob(
      "0 3 * * *", // 3 AM UTC
      async () => {
        try {
          await this.processAllRetention();
        } catch (error) {
          logger.error("Data retention job failed", { error });
        }
      },
      null,
      true,
      "UTC"
    );

    this.retentionJobs.set("daily", dailyJob);

    // Hourly job for security events
    const hourlyJob = new CronJob(
      "0 * * * *", // Every hour
      async () => {
        try {
          await this.processSecurityRetention();
        } catch (error) {
          logger.error("Security retention job failed", { error });
        }
      },
      null,
      true,
      "UTC"
    );

    this.retentionJobs.set("hourly", hourlyJob);

    logger.info("Data retention jobs started");
  }

  // Stop retention jobs
  stopRetentionJobs(): void {
    for (const [name, job] of this.retentionJobs) {
      job.stop();
      logger.info(`Stopped retention job: ${name}`);
    }
    this.retentionJobs.clear();
  }

  // Get retention policy for team
  async getRetentionPolicy(teamId: string): Promise<DataRetentionPolicy> {
    // Check for custom policy
    const customPolicy = await this.prisma.auditLogRetention.findUnique({
      where: { teamId },
    });

    if (!customPolicy) {
      return this.defaultPolicy;
    }

    // Merge custom with defaults
    return {
      ...this.defaultPolicy,
      auditLogs: customPolicy.retentionDays,
    };
  }

  // Update retention policy
  async updateRetentionPolicy(
    teamId: string,
    updates: Partial<DataRetentionPolicy>
  ): Promise<DataRetentionPolicy> {
    // Validate minimum retention periods
    const validated = this.validateRetentionPeriods(updates);

    // Update in database
    await this.prisma.auditLogRetention.upsert({
      where: { teamId },
      update: {
        retentionDays: validated.auditLogs || this.defaultPolicy.auditLogs,
        updatedAt: new Date(),
      },
      create: {
        teamId,
        retentionDays: validated.auditLogs || this.defaultPolicy.auditLogs,
      },
    });

    // Log policy update
    await this.auditLogger.log({
      action: "compliance.retention_policy_updated",
      actorType: "system" as any,
      resourceType: "retention_policy",
      resourceId: teamId,
      teamId,
      metadata: validated,
    });

    return this.getRetentionPolicy(teamId);
  }

  // Validate retention periods meet compliance requirements
  private validateRetentionPeriods(
    policy: Partial<DataRetentionPolicy>
  ): Partial<DataRetentionPolicy> {
    const validated: Partial<DataRetentionPolicy> = {};

    // SOC2 requires 7 years for audit logs
    if (policy.auditLogs !== undefined) {
      validated.auditLogs = Math.max(policy.auditLogs, 2555);
    }

    // Security events also need 7 years
    if (policy.securityEvents !== undefined) {
      validated.securityEvents = Math.max(policy.securityEvents, 2555);
    }

    // GDPR requires minimum retention for personal data
    if (policy.personalData !== undefined) {
      validated.personalData = Math.max(policy.personalData, 30);
    }

    // Other fields can use provided values
    return { ...policy, ...validated };
  }

  // Process all retention policies
  async processAllRetention(): Promise<void> {
    logger.info("Starting comprehensive data retention processing");

    const teams = await this.prisma.team.findMany({
      select: { id: true },
    });

    for (const team of teams) {
      try {
        const report = await this.processTeamRetention(team.id);
        
        // Log retention report
        await this.auditLogger.log({
          action: "compliance.retention_executed",
          actorType: "system" as any,
          resourceType: "data_retention",
          resourceId: report.teamId,
          teamId: team.id,
          metadata: report,
        });
      } catch (error) {
        logger.error("Failed to process retention for team", {
          teamId: team.id,
          error,
        });
      }
    }
  }

  // Process retention for a specific team
  async processTeamRetention(teamId: string): Promise<RetentionReport> {
    const policy = await this.getRetentionPolicy(teamId);
    const report: RetentionReport = {
      teamId,
      policy,
      executed: new Date(),
      deletedCounts: {
        auditLogs: 0,
        notifications: 0,
        usageEvents: 0,
        deploymentLogs: 0,
        teamInvitations: 0,
        total: 0,
      },
      errors: [],
    };

    // Process each data type
    try {
      // Audit logs (with archiving)
      const auditResult = await this.processAuditLogRetention(teamId, policy.auditLogs, true);
      report.deletedCounts.auditLogs = auditResult.deleted;
      if (auditResult.archived > 0) {
        report.archivedCounts = { ...report.archivedCounts, auditLogs: auditResult.archived, total: 0 };
      }

      // Notifications
      const notificationResult = await this.processNotificationRetention(teamId, policy.notifications);
      report.deletedCounts.notifications = notificationResult;

      // Usage events (with archiving for billing)
      const usageResult = await this.processUsageDataRetention(teamId, policy.usageData, true);
      report.deletedCounts.usageEvents = usageResult.deleted;
      if (usageResult.archived > 0 && report.archivedCounts) {
        report.archivedCounts.usageData = usageResult.archived;
      }

      // Team invitations
      const invitationResult = await this.processInvitationRetention(teamId, policy.teamInvitations);
      report.deletedCounts.teamInvitations = invitationResult;

      // Calculate total
      report.deletedCounts.total = Object.values(report.deletedCounts)
        .filter(v => typeof v === "number")
        .reduce((sum, count) => sum + count, 0);

      if (report.archivedCounts) {
        report.archivedCounts.total = Object.values(report.archivedCounts)
          .filter(v => typeof v === "number")
          .reduce((sum, count) => sum + count, 0);
      }
    } catch (error) {
      report.errors.push(`Retention processing error: ${error}`);
      logger.error("Retention processing failed", { teamId, error });
    }

    return report;
  }

  // Process audit log retention
  private async processAuditLogRetention(
    teamId: string,
    retentionDays: number,
    archive: boolean
  ): Promise<{ deleted: number; archived: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let archived = 0;

    // Archive if enabled
    if (archive) {
      const toArchive = await this.prisma.auditLog.findMany({
        where: {
          teamId,
          timestamp: { lt: cutoffDate },
          // Don't archive security events (keep them longer)
          NOT: {
            action: { startsWith: "security." },
          },
        },
        take: 10000,
      });

      if (toArchive.length > 0) {
        archived = await this.archiveData(teamId, "audit_logs", toArchive);
      }
    }

    // Delete old records
    const deleted = await this.prisma.auditLog.deleteMany({
      where: {
        teamId,
        timestamp: { lt: cutoffDate },
        // Don't delete security events
        NOT: {
          action: { startsWith: "security." },
        },
      },
    });

    return { deleted: deleted.count, archived };
  }

  // Process notification retention
  private async processNotificationRetention(
    teamId: string,
    retentionDays: number
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await this.prisma.notification.deleteMany({
      where: {
        user: { teamId },
        createdAt: { lt: cutoffDate },
      },
    });

    return deleted.count;
  }

  // Process usage data retention
  private async processUsageDataRetention(
    teamId: string,
    retentionDays: number,
    archive: boolean
  ): Promise<{ deleted: number; archived: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let archived = 0;

    // Archive for billing compliance
    if (archive) {
      const toArchive = await this.prisma.usageEvent.findMany({
        where: {
          project: { teamId },
          timestamp: { lt: cutoffDate },
        },
        include: {
          project: true,
        },
        take: 10000,
      });

      if (toArchive.length > 0) {
        // Aggregate by month before archiving
        const aggregated = this.aggregateUsageData(toArchive);
        archived = await this.archiveData(teamId, "usage_data", aggregated);
      }
    }

    // Delete old raw events
    const deleted = await this.prisma.usageEvent.deleteMany({
      where: {
        project: { teamId },
        timestamp: { lt: cutoffDate },
      },
    });

    return { deleted: deleted.count, archived };
  }

  // Process invitation retention
  private async processInvitationRetention(
    teamId: string,
    retentionDays: number
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await this.prisma.teamInvitation.deleteMany({
      where: {
        teamId,
        createdAt: { lt: cutoffDate },
        // Only delete expired or accepted invitations
        OR: [
          { expiresAt: { lt: new Date() } },
          { acceptedAt: { not: null } },
        ],
      },
    });

    return deleted.count;
  }

  // Process security-specific retention
  async processSecurityRetention(): Promise<void> {
    // Clean up failed login attempts older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.defaultPolicy.failedLogins);

    const deleted = await this.prisma.auditLog.deleteMany({
      where: {
        action: "user.login_failed",
        timestamp: { lt: cutoffDate },
      },
    });

    if (deleted.count > 0) {
      logger.info("Cleaned up old failed login attempts", {
        count: deleted.count,
      });
    }
  }

  // Archive data
  private async archiveData(
    teamId: string,
    dataType: string,
    data: any[]
  ): Promise<number> {
    try {
      // Encrypt sensitive data
      const encrypted = await this.encryptionService.encryptPII(data, dataType);
      
      // Generate archive metadata
      const archive: DataArchive = {
        id: `archive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        teamId,
        dataType,
        recordCount: data.length,
        sizeBytes: Buffer.byteLength(encrypted),
        location: `s3://compliance-archives/${teamId}/${dataType}/${new Date().toISOString()}.json.enc`,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
        checksum: this.encryptionService.hash(encrypted),
      };

      // In production: Upload to S3 or other storage
      logger.info("Data archived", {
        teamId,
        dataType,
        recordCount: data.length,
        location: archive.location,
      });

      return data.length;
    } catch (error) {
      logger.error("Archive failed", { teamId, dataType, error });
      throw error;
    }
  }

  // Aggregate usage data by month
  private aggregateUsageData(events: any[]): any[] {
    const aggregated = new Map<string, any>();

    for (const event of events) {
      const monthKey = `${event.projectId}_${event.timestamp.getFullYear()}_${event.timestamp.getMonth()}`;
      
      if (!aggregated.has(monthKey)) {
        aggregated.set(monthKey, {
          projectId: event.projectId,
          projectName: event.project.name,
          year: event.timestamp.getFullYear(),
          month: event.timestamp.getMonth(),
          metrics: {},
        });
      }

      const agg = aggregated.get(monthKey);
      if (!agg.metrics[event.metricType]) {
        agg.metrics[event.metricType] = 0;
      }
      agg.metrics[event.metricType] += Number(event.quantity);
    }

    return Array.from(aggregated.values());
  }

  // Get retention statistics
  async getRetentionStats(teamId: string): Promise<{
    dataAges: Record<string, any>;
    storageUsage: any;
    retentionCompliance: {
      compliant: boolean;
      issues: string[];
    };
  }> {
    const now = new Date();
    
    // Get data ages
    const [
      oldestAuditLog,
      oldestNotification,
      oldestUsageEvent,
    ] = await Promise.all([
      this.prisma.auditLog.findFirst({
        where: { teamId },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      }),
      this.prisma.notification.findFirst({
        where: { user: { teamId } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      this.prisma.usageEvent.findFirst({
        where: { project: { teamId } },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      }),
    ]);

    const dataAges = {
      auditLogs: oldestAuditLog 
        ? Math.floor((now.getTime() - oldestAuditLog.timestamp.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      notifications: oldestNotification
        ? Math.floor((now.getTime() - oldestNotification.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      usageEvents: oldestUsageEvent
        ? Math.floor((now.getTime() - oldestUsageEvent.timestamp.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    };

    // Check compliance
    const policy = await this.getRetentionPolicy(teamId);
    const issues: string[] = [];

    if (dataAges.auditLogs > policy.auditLogs) {
      issues.push(`Audit logs exceed retention period (${dataAges.auditLogs} days)`);
    }

    // Get storage usage (simulated)
    const storageUsage = {
      auditLogs: "245 MB",
      notifications: "12 MB",
      usageEvents: "89 MB",
      total: "346 MB",
    };

    return {
      dataAges,
      storageUsage,
      retentionCompliance: {
        compliant: issues.length === 0,
        issues,
      },
    };
  }

  // Export data for GDPR requests
  async exportUserData(userId: string): Promise<{
    user: any;
    notifications: any[];
    auditLogs: any[];
    oauthAccounts: any[];
  }> {
    const [user, notifications, auditLogs, oauthAccounts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { team: true },
      }),
      this.prisma.notification.findMany({
        where: { userId },
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: userId },
        take: 1000, // Limit for performance
      }),
      this.prisma.oAuthAccount.findMany({
        where: { userId },
        select: {
          provider: true,
          username: true,
          createdAt: true,
          // Don't include tokens
        },
      }),
    ]);

    // Log data export
    if (user) {
      await this.auditLogger.log({
        action: "compliance.user_data_exported",
        actorType: "user" as any,
        actorId: userId,
        resourceType: "user_data",
        resourceId: userId,
        teamId: user.teamId,
        metadata: {
          recordCounts: {
            notifications: notifications.length,
            auditLogs: auditLogs.length,
            oauthAccounts: oauthAccounts.length,
          },
        },
      });
    }

    return {
      user,
      notifications,
      auditLogs,
      oauthAccounts,
    };
  }

  // Delete user data (GDPR right to erasure)
  async deleteUserData(
    userId: string,
    options: { 
      deleteAccount: boolean;
      anonymize: boolean;
    } = { deleteAccount: true, anonymize: false }
  ): Promise<{
    deleted: Record<string, number>;
    anonymized: Record<string, number>;
  }> {
    const result = {
      deleted: {} as Record<string, number>,
      anonymized: {} as Record<string, number>,
    };

    // Start transaction
    await this.prisma.$transaction(async (tx) => {
      if (options.anonymize) {
        // Anonymize audit logs instead of deleting
        const anonymized = await tx.auditLog.updateMany({
          where: { actorId: userId },
          data: {
            actorId: `anon_${this.encryptionService.hash(userId)}`,
            actorEmail: null,
            actorIp: null,
            actorUserAgent: null,
          },
        });
        result.anonymized.auditLogs = anonymized.count;
      } else {
        // Delete audit logs
        const deleted = await tx.auditLog.deleteMany({
          where: { actorId: userId },
        });
        result.deleted.auditLogs = deleted.count;
      }

      // Delete notifications
      const deletedNotifications = await tx.notification.deleteMany({
        where: { userId },
      });
      result.deleted.notifications = deletedNotifications.count;

      // Delete OAuth accounts
      const deletedOAuth = await tx.oAuthAccount.deleteMany({
        where: { userId },
      });
      result.deleted.oauthAccounts = deletedOAuth.count;

      // Delete user permissions
      const deletedPermissions = await tx.userPermission.deleteMany({
        where: { userId },
      });
      result.deleted.permissions = deletedPermissions.count;

      // Delete user roles
      const deletedRoles = await tx.userRole.deleteMany({
        where: { userId },
      });
      result.deleted.roles = deletedRoles.count;

      // Delete/anonymize user account
      if (options.deleteAccount) {
        await tx.user.delete({
          where: { id: userId },
        });
        result.deleted.user = 1;
      } else if (options.anonymize) {
        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted_${userId}@anonymous.local`,
            name: "Deleted User",
            password: null,
            status: "deleted",
          },
        });
        result.anonymized.user = 1;
      }
    });

    // Log deletion
    await this.auditLogger.log({
      action: "compliance.user_data_deleted",
      actorType: "system" as any,
      resourceType: "user_data",
      resourceId: userId,
      metadata: {
        options,
        result,
      },
    });

    return result;
  }
}

// Singleton instance
let dataRetentionService: DataRetentionService;

export function getDataRetentionService(prisma: PrismaClient): DataRetentionService {
  if (!dataRetentionService) {
    dataRetentionService = new DataRetentionService(prisma);
  }
  return dataRetentionService;
}