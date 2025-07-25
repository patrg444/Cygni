import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { LoadBalancerService } from '../infrastructure/load-balancer.service';
import { AlertService } from '../monitoring/alert.service';
import { MetricsService } from '../monitoring/metrics.service';

interface BlueGreenConfig {
  strategy: 'immediate' | 'gradual' | 'canary';
  switchDuration?: number; // Duration in minutes for gradual switch
  validationPeriod?: number; // Time to validate green before switch
  autoSwitch?: boolean; // Auto-switch if metrics are good
  rollbackOnError?: boolean; // Auto-rollback if errors detected
}

interface DeploymentHealth {
  healthy: boolean;
  successRate: number;
  errorRate: number;
  avgLatency: number;
  activeConnections: number;
}

export class BlueGreenDeploymentService {
  private loadBalancerService: LoadBalancerService;
  private alertService: AlertService;
  private metricsService: MetricsService;

  constructor() {
    this.loadBalancerService = new LoadBalancerService();
    this.alertService = new AlertService();
    this.metricsService = new MetricsService();
  }

  /**
   * Initialize blue-green deployment
   */
  async initializeBlueGreenDeployment(
    projectId: string,
    greenDeploymentId: string,
    config: BlueGreenConfig
  ): Promise<string> {
    try {
      logger.info('Initializing blue-green deployment', { projectId, greenDeploymentId, config });

      // Get current blue (production) deployment
      const blueDeployment = await this.getCurrentProductionDeployment(projectId);
      
      if (!blueDeployment) {
        throw new Error('No active production deployment found');
      }

      // Create blue-green deployment record
      const blueGreen = await prisma.blueGreenDeployment.create({
        data: {
          projectId,
          blueDeploymentId: blueDeployment.id,
          greenDeploymentId,
          status: 'active_blue',
          trafficToGreen: 0,
          switchStrategy: config.strategy,
          switchDuration: config.switchDuration,
        },
      });

      // Start validation period if configured
      if (config.validationPeriod) {
        this.startValidationPeriod(blueGreen.id, config);
      }

      // Send notification
      await this.alertService.sendAlert({
        projectId,
        type: 'blue_green_initialized',
        severity: 'info',
        message: `Blue-green deployment initialized. Strategy: ${config.strategy}`,
        metadata: {
          blueGreenId: blueGreen.id,
          blueDeploymentId: blueDeployment.id,
          greenDeploymentId,
        },
      });

      return blueGreen.id;
    } catch (error) {
      logger.error('Failed to initialize blue-green deployment', { projectId, error });
      throw error;
    }
  }

  /**
   * Switch traffic from blue to green
   */
  async switchToGreen(
    blueGreenId: string,
    percentage?: number
  ): Promise<void> {
    try {
      const blueGreen = await prisma.blueGreenDeployment.findUnique({
        where: { id: blueGreenId },
        include: {
          blueDeployment: true,
          greenDeployment: true,
        },
      });

      if (!blueGreen) {
        throw new Error('Blue-green deployment not found');
      }

      logger.info('Switching traffic to green', { 
        blueGreenId, 
        currentTraffic: blueGreen.trafficToGreen,
        targetTraffic: percentage ?? 100,
      });

      const targetPercentage = percentage ?? 100;

      // Configure load balancer
      await this.loadBalancerService.configureBlueGreenTraffic(
        blueGreen.projectId,
        blueGreen.blueDeploymentId,
        blueGreen.greenDeploymentId,
        targetPercentage
      );

      // Update status
      const newStatus = targetPercentage === 100 ? 'active_green' : 'switching';
      
      await prisma.blueGreenDeployment.update({
        where: { id: blueGreenId },
        data: {
          status: newStatus,
          trafficToGreen: targetPercentage,
          ...(targetPercentage === 100 && { completedAt: new Date() }),
        },
      });

      // If gradual switch, schedule next increment
      if (blueGreen.switchStrategy === 'gradual' && targetPercentage < 100) {
        this.scheduleGradualSwitch(blueGreenId);
      }

      // Send notification
      await this.alertService.sendAlert({
        projectId: blueGreen.projectId,
        type: 'blue_green_traffic_switched',
        severity: 'info',
        message: `Traffic switched: ${targetPercentage}% to green deployment`,
        metadata: {
          blueGreenId,
          trafficPercentage: targetPercentage,
        },
      });
    } catch (error) {
      logger.error('Failed to switch traffic', { blueGreenId, error });
      throw error;
    }
  }

  /**
   * Rollback to blue deployment
   */
  async rollbackToBlue(blueGreenId: string, reason: string): Promise<void> {
    try {
      const blueGreen = await prisma.blueGreenDeployment.findUnique({
        where: { id: blueGreenId },
      });

      if (!blueGreen) {
        throw new Error('Blue-green deployment not found');
      }

      logger.warn('Rolling back to blue deployment', { blueGreenId, reason });

      // Switch all traffic back to blue
      await this.loadBalancerService.configureBlueGreenTraffic(
        blueGreen.projectId,
        blueGreen.blueDeploymentId,
        blueGreen.greenDeploymentId,
        0
      );

      // Update status
      await prisma.blueGreenDeployment.update({
        where: { id: blueGreenId },
        data: {
          status: 'active_blue',
          trafficToGreen: 0,
          completedAt: new Date(),
        },
      });

      // Mark green deployment as failed
      await prisma.deployment.update({
        where: { id: blueGreen.greenDeploymentId },
        data: {
          status: 'failed',
          metadata: {
            rollbackReason: reason,
            rolledBackAt: new Date(),
          },
        },
      });

      // Send alert
      await this.alertService.sendAlert({
        projectId: blueGreen.projectId,
        type: 'blue_green_rollback',
        severity: 'warning',
        message: `Blue-green deployment rolled back: ${reason}`,
        metadata: {
          blueGreenId,
          reason,
        },
      });
    } catch (error) {
      logger.error('Failed to rollback to blue', { blueGreenId, error });
      throw error;
    }
  }

  /**
   * Validate green deployment health
   */
  async validateGreenDeployment(blueGreenId: string): Promise<DeploymentHealth> {
    const blueGreen = await prisma.blueGreenDeployment.findUnique({
      where: { id: blueGreenId },
    });

    if (!blueGreen) {
      throw new Error('Blue-green deployment not found');
    }

    // Get metrics for green deployment
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes
    
    const metrics = await this.metricsService.getDeploymentMetrics(
      blueGreen.greenDeploymentId,
      startTime,
      endTime
    );

    const health: DeploymentHealth = {
      healthy: true,
      successRate: metrics.successRate || 0,
      errorRate: metrics.errorRate || 0,
      avgLatency: metrics.latencyP50 || 0,
      activeConnections: metrics.activeConnections || 0,
    };

    // Check health criteria
    if (health.errorRate > 0.05) { // More than 5% errors
      health.healthy = false;
    }
    if (health.successRate < 0.95) { // Less than 95% success
      health.healthy = false;
    }
    if (health.avgLatency > 1000) { // More than 1s average latency
      health.healthy = false;
    }

    logger.info('Green deployment health check', { 
      blueGreenId, 
      health,
    });

    return health;
  }

  /**
   * Start validation period for green deployment
   */
  private async startValidationPeriod(
    blueGreenId: string,
    config: BlueGreenConfig
  ): Promise<void> {
    const validationPeriod = config.validationPeriod || 5; // Default 5 minutes

    // Send small amount of traffic for validation
    await this.switchToGreen(blueGreenId, 5);

    // Schedule validation check
    setTimeout(async () => {
      try {
        const health = await this.validateGreenDeployment(blueGreenId);
        
        if (health.healthy && config.autoSwitch) {
          // Health is good, proceed with switch
          if (config.strategy === 'immediate') {
            await this.switchToGreen(blueGreenId, 100);
          } else if (config.strategy === 'gradual') {
            await this.startGradualSwitch(blueGreenId);
          }
        } else if (!health.healthy && config.rollbackOnError) {
          // Health check failed, rollback
          await this.rollbackToBlue(
            blueGreenId, 
            `Health check failed: Success rate ${health.successRate}, Error rate ${health.errorRate}`
          );
        } else {
          // Manual intervention required
          await this.pauseSwitch(blueGreenId);
        }
      } catch (error) {
        logger.error('Validation period check failed', { blueGreenId, error });
      }
    }, validationPeriod * 60 * 1000);
  }

  /**
   * Start gradual traffic switch
   */
  private async startGradualSwitch(blueGreenId: string): Promise<void> {
    const blueGreen = await prisma.blueGreenDeployment.findUnique({
      where: { id: blueGreenId },
    });

    if (!blueGreen || !blueGreen.switchDuration) {
      return;
    }

    const increments = 10; // Switch in 10% increments
    const intervalMinutes = blueGreen.switchDuration / increments;
    
    this.scheduleGradualSwitch(blueGreenId);
  }

  /**
   * Schedule next gradual switch increment
   */
  private async scheduleGradualSwitch(blueGreenId: string): Promise<void> {
    const blueGreen = await prisma.blueGreenDeployment.findUnique({
      where: { id: blueGreenId },
    });

    if (!blueGreen || !blueGreen.switchDuration) {
      return;
    }

    const currentTraffic = blueGreen.trafficToGreen;
    if (currentTraffic >= 100) {
      return;
    }

    const increments = 10;
    const intervalMinutes = blueGreen.switchDuration / increments;
    const nextTraffic = Math.min(currentTraffic + 10, 100);

    setTimeout(async () => {
      try {
        // Check health before incrementing
        const health = await this.validateGreenDeployment(blueGreenId);
        
        if (health.healthy) {
          await this.switchToGreen(blueGreenId, nextTraffic);
        } else {
          // Health check failed, pause or rollback
          const config = await this.getConfig(blueGreenId);
          if (config?.rollbackOnError) {
            await this.rollbackToBlue(
              blueGreenId,
              `Health check failed during gradual switch at ${currentTraffic}%`
            );
          } else {
            await this.pauseSwitch(blueGreenId);
          }
        }
      } catch (error) {
        logger.error('Gradual switch increment failed', { blueGreenId, error });
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the switch process
   */
  private async pauseSwitch(blueGreenId: string): Promise<void> {
    await prisma.blueGreenDeployment.update({
      where: { id: blueGreenId },
      data: {
        status: 'paused',
      },
    });

    await this.alertService.sendAlert({
      projectId: (await this.getBlueGreen(blueGreenId))!.projectId,
      type: 'blue_green_paused',
      severity: 'warning',
      message: 'Blue-green switch paused - manual intervention required',
      metadata: { blueGreenId },
    });
  }

  /**
   * Get current production deployment
   */
  private async getCurrentProductionDeployment(projectId: string) {
    return prisma.deployment.findFirst({
      where: {
        projectId,
        status: 'active',
        environment: 'production',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get blue-green deployment
   */
  private async getBlueGreen(blueGreenId: string) {
    return prisma.blueGreenDeployment.findUnique({
      where: { id: blueGreenId },
    });
  }

  /**
   * Get configuration (placeholder)
   */
  private async getConfig(blueGreenId: string): Promise<BlueGreenConfig | null> {
    // In a real implementation, this would fetch from database
    return {
      strategy: 'gradual',
      rollbackOnError: true,
      autoSwitch: true,
    };
  }

  /**
   * Get blue-green deployment status
   */
  async getStatus(blueGreenId: string): Promise<any> {
    const blueGreen = await prisma.blueGreenDeployment.findUnique({
      where: { id: blueGreenId },
      include: {
        blueDeployment: true,
        greenDeployment: true,
      },
    });

    if (!blueGreen) {
      throw new Error('Blue-green deployment not found');
    }

    // Get current health of both deployments
    const [blueHealth, greenHealth] = await Promise.all([
      this.getDeploymentHealth(blueGreen.blueDeploymentId),
      this.getDeploymentHealth(blueGreen.greenDeploymentId),
    ]);

    return {
      ...blueGreen,
      blueHealth,
      greenHealth,
      elapsedTime: Date.now() - blueGreen.startedAt.getTime(),
    };
  }

  /**
   * Get deployment health metrics
   */
  private async getDeploymentHealth(deploymentId: string): Promise<DeploymentHealth> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
    
    const metrics = await this.metricsService.getDeploymentMetrics(
      deploymentId,
      startTime,
      endTime
    );

    return {
      healthy: (metrics.successRate || 0) > 0.95 && (metrics.errorRate || 0) < 0.05,
      successRate: metrics.successRate || 0,
      errorRate: metrics.errorRate || 0,
      avgLatency: metrics.latencyP50 || 0,
      activeConnections: metrics.activeConnections || 0,
    };
  }
}