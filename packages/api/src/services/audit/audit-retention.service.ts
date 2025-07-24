import { PrismaClient } from "@prisma/client";
import { CronJob } from "cron";
import logger from "../../lib/logger";
import { getAuditLogger } from "./audit-logger.service";
import { ActorType } from "./audit-events";

export interface ArchiveResult {
  archivedCount: number;
  deletedCount: number;
  archiveLocation?: string;
  errors: string[];
}

export class AuditRetentionService {
  private prisma: PrismaClient;
  private retentionJob: CronJob | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  startRetentionJob(): void {
    // Run retention job daily at 2 AM
    this.retentionJob = new CronJob(
      "0 2 * * *",
      async () => {
        try {
          await this.processRetention();
        } catch (error) {
          logger.error("Audit retention job failed", { error });
        }
      },
      null,
      true,
      "UTC"
    );

    logger.info("Audit retention job started");
  }

  stopRetentionJob(): void {
    if (this.retentionJob) {
      this.retentionJob.stop();
      this.retentionJob = null;
    }
  }

  async processRetention(): Promise<void> {
    logger.info("Starting audit log retention processing");

    // Get all retention policies
    const policies = await this.prisma.auditLogRetention.findMany();

    for (const policy of policies) {
      try {
        await this.processTeamRetention(policy);
      } catch (error) {
        logger.error("Failed to process retention for team", {
          teamId: policy.teamId,
          error,
        });
      }
    }

    // Process default retention for teams without custom policies
    await this.processDefaultRetention();

    logger.info("Audit log retention processing completed");
  }

  private async processTeamRetention(policy: any): Promise<ArchiveResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const result: ArchiveResult = {
      archivedCount: 0,
      deletedCount: 0,
      errors: [],
    };

    // Get logs to process
    const logsToProcess = await this.prisma.auditLog.findMany({
      where: {
        teamId: policy.teamId,
        timestamp: { lt: cutoffDate },
      },
      take: 10000, // Process in batches
    });

    if (logsToProcess.length === 0) {
      return result;
    }

    // Archive if enabled
    if (policy.archiveEnabled && policy.archiveLocation) {
      try {
        const archived = await this.archiveLogs(
          logsToProcess,
          policy.archiveLocation
        );
        result.archivedCount = archived;
        result.archiveLocation = policy.archiveLocation;
      } catch (error) {
        const errorMsg = `Archive failed: ${error}`;
        result.errors.push(errorMsg);
        logger.error("Failed to archive audit logs", {
          teamId: policy.teamId,
          error,
        });
        // Don't delete if archive failed
        return result;
      }
    }

    // Delete old logs
    try {
      const deleted = await this.prisma.auditLog.deleteMany({
        where: {
          teamId: policy.teamId,
          timestamp: { lt: cutoffDate },
        },
      });
      result.deletedCount = deleted.count;
    } catch (error) {
      const errorMsg = `Delete failed: ${error}`;
      result.errors.push(errorMsg);
      logger.error("Failed to delete old audit logs", {
        teamId: policy.teamId,
        error,
      });
    }

    // Log the retention action
    const auditLogger = getAuditLogger(this.prisma);
    await auditLogger.log({
      action: "compliance.audit_retention_processed",
      actorType: ActorType.SYSTEM,
      resourceType: "audit_logs",
      teamId: policy.teamId,
      metadata: {
        retentionDays: policy.retentionDays,
        cutoffDate,
        ...result,
      },
    });

    return result;
  }

  private async processDefaultRetention(): Promise<void> {
    const defaultRetentionDays = 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - defaultRetentionDays);

    // Find teams without custom retention policies
    const teamsWithoutPolicy = await this.prisma.team.findMany({
      where: {
        NOT: {
          id: {
            in: await this.prisma.auditLogRetention
              .findMany({ select: { teamId: true } })
              .then(policies => policies.map(p => p.teamId)),
          },
        },
      },
      select: { id: true },
    });

    for (const team of teamsWithoutPolicy) {
      try {
        const deleted = await this.prisma.auditLog.deleteMany({
          where: {
            teamId: team.id,
            timestamp: { lt: cutoffDate },
          },
        });

        if (deleted.count > 0) {
          logger.info("Deleted old audit logs for team with default retention", {
            teamId: team.id,
            deletedCount: deleted.count,
            retentionDays: defaultRetentionDays,
          });
        }
      } catch (error) {
        logger.error("Failed to process default retention for team", {
          teamId: team.id,
          error,
        });
      }
    }
  }

  private async archiveLogs(logs: any[], location: string): Promise<number> {
    // In a real implementation, this would:
    // 1. Compress logs (e.g., gzip)
    // 2. Upload to S3, Azure Blob, or other storage
    // 3. Verify upload integrity
    // 4. Return count of successfully archived logs

    // For now, simulate archive to S3
    const archiveData = {
      timestamp: new Date().toISOString(),
      count: logs.length,
      logs: logs.map(log => ({
        ...log,
        // Parse JSON fields
        oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
        newValues: log.newValues ? JSON.parse(log.newValues) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      })),
    };

    // Simulate S3 upload
    const key = `audit-logs/${logs[0].teamId}/${new Date().toISOString()}.json.gz`;
    
    logger.info("Archiving audit logs", {
      location,
      key,
      count: logs.length,
    });

    // In production, use AWS SDK:
    // const s3 = new AWS.S3();
    // await s3.putObject({
    //   Bucket: location,
    //   Key: key,
    //   Body: gzip(JSON.stringify(archiveData)),
    //   ContentType: 'application/json',
    //   ContentEncoding: 'gzip',
    // }).promise();

    return logs.length;
  }

  async getRetentionStats(): Promise<any> {
    const totalLogs = await this.prisma.auditLog.count();
    
    const logsByAge = await this.prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN timestamp > NOW() - INTERVAL '1 day' THEN '< 1 day'
          WHEN timestamp > NOW() - INTERVAL '7 days' THEN '1-7 days'
          WHEN timestamp > NOW() - INTERVAL '30 days' THEN '7-30 days'
          WHEN timestamp > NOW() - INTERVAL '90 days' THEN '30-90 days'
          ELSE '> 90 days'
        END as age_group,
        COUNT(*) as count
      FROM "AuditLog"
      GROUP BY age_group
      ORDER BY age_group
    `;

    const storageSize = await this.prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_total_relation_size('"AuditLog"')) as table_size,
        pg_size_pretty(pg_indexes_size('"AuditLog"')) as indexes_size
    `;

    return {
      totalLogs,
      logsByAge,
      storage: storageSize[0],
      retentionPolicies: await this.prisma.auditLogRetention.count(),
    };
  }
}

// Export singleton instance
let retentionService: AuditRetentionService | null = null;

export function getAuditRetentionService(prisma: PrismaClient): AuditRetentionService {
  if (!retentionService) {
    retentionService = new AuditRetentionService(prisma);
  }
  return retentionService;
}