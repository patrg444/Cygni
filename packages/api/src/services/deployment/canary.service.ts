import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { MetricsService } from '../monitoring/metrics.service';
import { AlertService } from '../monitoring/alert.service';
import { LoadBalancerService } from '../infrastructure/load-balancer.service';

interface CanaryConfig {
  percentage: number; // Traffic percentage (1-100)
  duration: number; // Duration in minutes
  successThreshold: number; // Success rate threshold (0-1)
  errorThreshold: number; // Error rate threshold (0-1)
  latencyThreshold: number; // P95 latency in ms
  autoPromote: boolean; // Auto-promote if metrics are good
  autoRollback: boolean; // Auto-rollback if metrics are bad
}

interface CanaryMetrics {
  successRate: number;
  errorRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  requestCount: number;
}

export class CanaryDeploymentService {
  private metricsService: MetricsService;
  private alertService: AlertService;
  private loadBalancerService: LoadBalancerService;

  constructor() {
    this.metricsService = new MetricsService();
    this.alertService = new AlertService();
    this.loadBalancerService = new LoadBalancerService();
  }

  /**
   * Start a canary deployment
   */
  async startCanaryDeployment(
    projectId: string,
    deploymentId: string,
    config: CanaryConfig
  ): Promise<string> {
    try {
      logger.info('Starting canary deployment', { projectId, deploymentId, config });

      // Create canary deployment record
      const canary = await prisma.canaryDeployment.create({
        data: {
          deploymentId,
          projectId,
          status: 'running',
          trafficPercentage: config.percentage,
          duration: config.duration,
          successThreshold: config.successThreshold,
          errorThreshold: config.errorThreshold,
          latencyThreshold: config.latencyThreshold,
          autoPromote: config.autoPromote,
          autoRollback: config.autoRollback,
          startedAt: new Date(),
          scheduledEndAt: new Date(Date.now() + config.duration * 60 * 1000),
        },
      });

      // Configure load balancer for canary traffic
      await this.loadBalancerService.configureCanaryTraffic(
        projectId,
        deploymentId,
        config.percentage
      );

      // Start monitoring
      this.startCanaryMonitoring(canary.id);

      // Send notification
      await this.alertService.sendAlert({
        projectId,
        type: 'canary_started',
        severity: 'info',
        message: `Canary deployment started with ${config.percentage}% traffic`,
        metadata: {
          deploymentId,
          canaryId: canary.id,
          config,
        },
      });

      return canary.id;
    } catch (error) {
      logger.error('Failed to start canary deployment', { projectId, deploymentId, error });
      throw error;
    }
  }

  /**
   * Monitor canary deployment metrics
   */
  private async startCanaryMonitoring(canaryId: string): Promise<void> {
    const canary = await prisma.canaryDeployment.findUnique({
      where: { id: canaryId },
      include: { deployment: true },
    });

    if (!canary) {
      logger.error('Canary deployment not found', { canaryId });
      return;
    }

    // Set up monitoring interval (every minute)
    const interval = setInterval(async () => {
      try {
        const metrics = await this.collectCanaryMetrics(canary.deploymentId);
        
        // Store metrics
        await prisma.canaryMetric.create({
          data: {
            canaryDeploymentId: canaryId,
            timestamp: new Date(),
            successRate: metrics.successRate,
            errorRate: metrics.errorRate,
            latencyP50: metrics.latencyP50,
            latencyP95: metrics.latencyP95,
            latencyP99: metrics.latencyP99,
            requestCount: metrics.requestCount,
          },
        });

        // Check thresholds
        const shouldRollback = await this.checkRollbackCriteria(canary, metrics);
        const shouldPromote = await this.checkPromotionCriteria(canary, metrics);

        if (shouldRollback && canary.autoRollback) {
          await this.rollbackCanary(canaryId, 'Metrics below threshold');
          clearInterval(interval);
        } else if (shouldPromote && canary.autoPromote) {
          await this.promoteCanary(canaryId);
          clearInterval(interval);
        } else if (new Date() > canary.scheduledEndAt) {
          // Canary duration ended
          if (canary.autoPromote) {
            await this.promoteCanary(canaryId);
          } else {
            await this.pauseCanary(canaryId);
          }
          clearInterval(interval);
        }
      } catch (error) {
        logger.error('Error monitoring canary', { canaryId, error });
      }
    }, 60000); // Check every minute

    // Store interval ID for cleanup
    this.monitoringIntervals.set(canaryId, interval);
  }

  private monitoringIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Collect metrics for canary deployment
   */
  private async collectCanaryMetrics(deploymentId: string): Promise<CanaryMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

    const metrics = await this.metricsService.getDeploymentMetrics(
      deploymentId,
      startTime,
      endTime
    );

    return {
      successRate: metrics.successRate || 0,
      errorRate: metrics.errorRate || 0,
      latencyP50: metrics.latencyP50 || 0,
      latencyP95: metrics.latencyP95 || 0,
      latencyP99: metrics.latencyP99 || 0,
      requestCount: metrics.requestCount || 0,
    };
  }

  /**
   * Check if canary should be rolled back
   */
  private async checkRollbackCriteria(
    canary: any,
    metrics: CanaryMetrics
  ): Promise<boolean> {
    // Check error rate
    if (metrics.errorRate > canary.errorThreshold) {
      logger.warn('Canary error rate exceeds threshold', {
        canaryId: canary.id,
        errorRate: metrics.errorRate,
        threshold: canary.errorThreshold,
      });
      return true;
    }

    // Check success rate
    if (metrics.successRate < canary.successThreshold) {
      logger.warn('Canary success rate below threshold', {
        canaryId: canary.id,
        successRate: metrics.successRate,
        threshold: canary.successThreshold,
      });
      return true;
    }

    // Check latency
    if (metrics.latencyP95 > canary.latencyThreshold) {
      logger.warn('Canary latency exceeds threshold', {
        canaryId: canary.id,
        latencyP95: metrics.latencyP95,
        threshold: canary.latencyThreshold,
      });
      return true;
    }

    return false;
  }

  /**
   * Check if canary should be promoted
   */
  private async checkPromotionCriteria(
    canary: any,
    metrics: CanaryMetrics
  ): Promise<boolean> {
    // Need sufficient traffic to make decision
    if (metrics.requestCount < 100) {
      return false;
    }

    // All metrics should be within thresholds
    return (
      metrics.errorRate <= canary.errorThreshold &&
      metrics.successRate >= canary.successThreshold &&
      metrics.latencyP95 <= canary.latencyThreshold
    );
  }

  /**
   * Promote canary to full deployment
   */
  async promoteCanary(canaryId: string): Promise<void> {
    try {
      const canary = await prisma.canaryDeployment.findUnique({
        where: { id: canaryId },
        include: { deployment: true },
      });

      if (!canary) {
        throw new Error('Canary deployment not found');
      }

      logger.info('Promoting canary deployment', { canaryId });

      // Update traffic to 100%
      await this.loadBalancerService.configureCanaryTraffic(
        canary.projectId,
        canary.deploymentId,
        100
      );

      // Update canary status
      await prisma.canaryDeployment.update({
        where: { id: canaryId },
        data: {
          status: 'promoted',
          completedAt: new Date(),
          trafficPercentage: 100,
        },
      });

      // Update deployment status
      await prisma.deployment.update({
        where: { id: canary.deploymentId },
        data: {
          status: 'active',
          metadata: {
            ...canary.deployment.metadata,
            canaryPromoted: true,
            promotedAt: new Date(),
          },
        },
      });

      // Clean up monitoring
      const interval = this.monitoringIntervals.get(canaryId);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(canaryId);
      }

      // Send notification
      await this.alertService.sendAlert({
        projectId: canary.projectId,
        type: 'canary_promoted',
        severity: 'info',
        message: 'Canary deployment promoted to production',
        metadata: {
          deploymentId: canary.deploymentId,
          canaryId,
        },
      });
    } catch (error) {
      logger.error('Failed to promote canary', { canaryId, error });
      throw error;
    }
  }

  /**
   * Rollback canary deployment
   */
  async rollbackCanary(canaryId: string, reason: string): Promise<void> {
    try {
      const canary = await prisma.canaryDeployment.findUnique({
        where: { id: canaryId },
        include: { deployment: true },
      });

      if (!canary) {
        throw new Error('Canary deployment not found');
      }

      logger.warn('Rolling back canary deployment', { canaryId, reason });

      // Remove canary traffic
      await this.loadBalancerService.removeCanaryTraffic(
        canary.projectId,
        canary.deploymentId
      );

      // Update canary status
      await prisma.canaryDeployment.update({
        where: { id: canaryId },
        data: {
          status: 'rolled_back',
          completedAt: new Date(),
          rollbackReason: reason,
        },
      });

      // Update deployment status
      await prisma.deployment.update({
        where: { id: canary.deploymentId },
        data: {
          status: 'rolled_back',
          metadata: {
            ...canary.deployment.metadata,
            canaryRolledBack: true,
            rollbackReason: reason,
            rolledBackAt: new Date(),
          },
        },
      });

      // Clean up monitoring
      const interval = this.monitoringIntervals.get(canaryId);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(canaryId);
      }

      // Send alert
      await this.alertService.sendAlert({
        projectId: canary.projectId,
        type: 'canary_rollback',
        severity: 'warning',
        message: `Canary deployment rolled back: ${reason}`,
        metadata: {
          deploymentId: canary.deploymentId,
          canaryId,
          reason,
        },
      });
    } catch (error) {
      logger.error('Failed to rollback canary', { canaryId, error });
      throw error;
    }
  }

  /**
   * Pause canary deployment
   */
  async pauseCanary(canaryId: string): Promise<void> {
    const canary = await prisma.canaryDeployment.findUnique({
      where: { id: canaryId },
    });

    if (!canary) {
      throw new Error('Canary deployment not found');
    }

    await prisma.canaryDeployment.update({
      where: { id: canaryId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
      },
    });

    // Clean up monitoring
    const interval = this.monitoringIntervals.get(canaryId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(canaryId);
    }

    await this.alertService.sendAlert({
      projectId: canary.projectId,
      type: 'canary_paused',
      severity: 'info',
      message: 'Canary deployment paused - manual intervention required',
      metadata: {
        deploymentId: canary.deploymentId,
        canaryId,
      },
    });
  }

  /**
   * Update canary traffic percentage
   */
  async updateCanaryTraffic(canaryId: string, percentage: number): Promise<void> {
    const canary = await prisma.canaryDeployment.findUnique({
      where: { id: canaryId },
    });

    if (!canary) {
      throw new Error('Canary deployment not found');
    }

    if (canary.status !== 'running' && canary.status !== 'paused') {
      throw new Error(`Cannot update traffic for canary in ${canary.status} status`);
    }

    await this.loadBalancerService.configureCanaryTraffic(
      canary.projectId,
      canary.deploymentId,
      percentage
    );

    await prisma.canaryDeployment.update({
      where: { id: canaryId },
      data: {
        trafficPercentage: percentage,
        status: 'running',
      },
    });

    logger.info('Updated canary traffic', { canaryId, percentage });
  }

  /**
   * Get canary deployment status
   */
  async getCanaryStatus(canaryId: string): Promise<any> {
    const canary = await prisma.canaryDeployment.findUnique({
      where: { id: canaryId },
      include: {
        deployment: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
      },
    });

    if (!canary) {
      throw new Error('Canary deployment not found');
    }

    // Calculate average metrics
    const avgMetrics = canary.metrics.reduce(
      (acc, metric) => ({
        successRate: acc.successRate + metric.successRate / canary.metrics.length,
        errorRate: acc.errorRate + metric.errorRate / canary.metrics.length,
        latencyP95: acc.latencyP95 + metric.latencyP95 / canary.metrics.length,
        requestCount: acc.requestCount + metric.requestCount,
      }),
      { successRate: 0, errorRate: 0, latencyP95: 0, requestCount: 0 }
    );

    return {
      ...canary,
      currentMetrics: canary.metrics[0] || null,
      averageMetrics: avgMetrics,
      elapsedTime: Date.now() - canary.startedAt.getTime(),
      remainingTime: Math.max(0, canary.scheduledEndAt.getTime() - Date.now()),
    };
  }
}