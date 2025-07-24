import { PrismaClient } from "@prisma/client";
import {
  activeUserSessions,
  teamCount,
  projectCount,
  subscriptionRevenue,
  activeDeployments,
  databaseConnectionPool,
  usageMetrics,
  jobQueueSize,
} from "../../lib/metrics";
import logger from "../../lib/logger";
import { SubscriptionManagerService } from "../billing/subscription-manager.service";

export class MetricsCollectorService {
  private prisma: PrismaClient;
  private collectionInterval: NodeJS.Timer | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Start collecting business metrics periodically
   */
  startCollection(intervalMs: number = 30000) {
    // Initial collection
    this.collectMetrics();

    // Set up periodic collection
    this.collectionInterval = setInterval(() => {
      this.collectMetrics().catch((error) => {
        logger.error("Failed to collect metrics", {
          error: error instanceof Error ? error.message : error,
        });
      });
    }, intervalMs);

    logger.info("Metrics collection started", {
      interval: `${intervalMs / 1000}s`,
    });
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      logger.info("Metrics collection stopped");
    }
  }

  /**
   * Collect all business metrics
   */
  private async collectMetrics() {
    try {
      await Promise.all([
        this.collectUserMetrics(),
        this.collectTeamMetrics(),
        this.collectProjectMetrics(),
        this.collectDeploymentMetrics(),
        this.collectRevenueMetrics(),
        this.collectUsageMetrics(),
        this.collectDatabaseMetrics(),
      ]);
    } catch (error) {
      logger.error("Error collecting metrics", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Collect user and session metrics
   */
  private async collectUserMetrics() {
    // Count active sessions (users who logged in within last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeSessions = await this.prisma.user.count({
      where: {
        lastLoginAt: {
          gte: oneDayAgo,
        },
        status: "active",
      },
    });

    activeUserSessions.set(activeSessions);
  }

  /**
   * Collect team metrics
   */
  private async collectTeamMetrics() {
    // Count teams by plan and status
    const teams = await this.prisma.team.groupBy({
      by: ["planId", "subscriptionStatus"],
      _count: true,
    });

    // Reset gauge before setting new values
    teamCount.reset();

    for (const team of teams) {
      teamCount.set(
        {
          plan: team.planId || "free",
          status: team.subscriptionStatus || "active",
        },
        team._count,
      );
    }
  }

  /**
   * Collect project metrics
   */
  private async collectProjectMetrics() {
    // Count projects by status
    const projects = await this.prisma.project.groupBy({
      by: ["status"],
      _count: true,
    });

    // Reset gauge before setting new values
    projectCount.reset();

    for (const project of projects) {
      projectCount.set(
        {
          status: project.status,
        },
        project._count,
      );
    }
  }

  /**
   * Collect deployment metrics
   */
  private async collectDeploymentMetrics() {
    // Count active deployments by provider
    const deployments = await this.prisma.deployment.findMany({
      where: {
        status: "active",
      },
      select: {
        metadata: true,
      },
    });

    // Group by provider and tier
    const deploymentCounts = new Map<string, number>();
    
    for (const deployment of deployments) {
      const metadata = deployment.metadata as any;
      const provider = metadata?.provider || "unknown";
      const tier = metadata?.tier || "shared";
      const key = `${provider}:${tier}`;
      
      deploymentCounts.set(key, (deploymentCounts.get(key) || 0) + 1);
    }

    // Reset gauge before setting new values
    activeDeployments.reset();

    for (const [key, count] of deploymentCounts) {
      const [provider, tier] = key.split(":");
      activeDeployments.set({ provider, tier }, count);
    }
  }

  /**
   * Collect revenue metrics
   */
  private async collectRevenueMetrics() {
    // Calculate MRR by plan
    const plans = Object.keys(SubscriptionManagerService.PLANS);
    
    // Reset gauge before setting new values
    subscriptionRevenue.reset();

    for (const planId of plans) {
      const plan = SubscriptionManagerService.PLANS[planId];
      
      // Count active subscriptions for this plan
      const count = await this.prisma.team.count({
        where: {
          planId,
          subscriptionStatus: "active",
        },
      });

      const mrr = count * plan.monthlyPrice;
      subscriptionRevenue.set({ plan: planId }, mrr);
    }
  }

  /**
   * Collect resource usage metrics
   */
  private async collectUsageMetrics() {
    // Get current month usage totals
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await this.prisma.usageEvent.groupBy({
      by: ["metricType"],
      where: {
        timestamp: {
          gte: startOfMonth,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    // Reset gauge before setting new values
    usageMetrics.reset();

    for (const item of usage) {
      const quantity = item._sum.quantity?.toNumber() || 0;
      let unit = "count";

      switch (item.metricType) {
        case "cpu_seconds":
          unit = "seconds";
          usageMetrics.set(
            { resource_type: "cpu", unit },
            quantity,
          );
          break;
        case "memory_gb_hours":
          unit = "gb_hours";
          usageMetrics.set(
            { resource_type: "memory", unit },
            quantity,
          );
          break;
        case "storage_gb_hours":
          unit = "gb_hours";
          usageMetrics.set(
            { resource_type: "storage", unit },
            quantity,
          );
          break;
        case "egress_gb":
          unit = "gb";
          usageMetrics.set(
            { resource_type: "bandwidth", unit },
            quantity,
          );
          break;
        case "requests":
          unit = "count";
          usageMetrics.set(
            { resource_type: "requests", unit },
            quantity,
          );
          break;
      }
    }
  }

  /**
   * Collect database metrics
   */
  private async collectDatabaseMetrics() {
    // This is a simplified version - in production you'd get actual pool stats
    // from Prisma's connection pool
    const mockPoolStats = {
      active: 5,
      idle: 15,
      total: 20,
    };

    databaseConnectionPool.set({ state: "active" }, mockPoolStats.active);
    databaseConnectionPool.set({ state: "idle" }, mockPoolStats.idle);
    databaseConnectionPool.set({ state: "total" }, mockPoolStats.total);
  }

  /**
   * Collect job queue metrics (if using a job queue)
   */
  private async collectJobQueueMetrics() {
    // This would integrate with your job queue system
    // For now, just set to 0
    jobQueueSize.reset();
    jobQueueSize.set({ job_type: "budget_check", status: "pending" }, 0);
    jobQueueSize.set({ job_type: "usage_collection", status: "pending" }, 0);
    jobQueueSize.set({ job_type: "email_send", status: "pending" }, 0);
  }
}