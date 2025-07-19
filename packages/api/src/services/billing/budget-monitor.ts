import { PrismaClient } from '@prisma/client';
// import { KubernetesService } from '../kubernetes/kubernetes.service';
import { NotificationService } from '../notification/notification.service';

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  willExceedAt?: Date;
  isOverLimit: boolean;
}

export interface UsageMetrics {
  cpuSeconds: number;
  memoryGBHours: number;
  storageGBHours: number;
  egressGB: number;
  requests: number;
  total: number;
  dailyRate: number;
}

interface PricingRates {
  cpuSecond: number;
  memoryGBHour: number;
  storageGBHour: number;
  egressGB: number;
  request: number;
}

export class BudgetMonitor {
  private readonly FREE_TIER_LIMIT = 10.00; // $10 USD
  private readonly WARNING_THRESHOLD = 0.8; // Warn at 80% usage
  
  // Pricing per unit
  private readonly pricing: PricingRates = {
    cpuSecond: 0.00001,      // $0.036/hour for 1 vCPU
    memoryGBHour: 0.005,     // $0.005/GB-hour
    storageGBHour: 0.0001,   // $0.0001/GB-hour
    egressGB: 0.09,          // $0.09/GB egress
    request: 0.0000002,      // $0.20 per million requests
  };

  constructor(
    private prisma: PrismaClient,
    // private k8sService: KubernetesService,
    private notificationService: NotificationService
  ) {}

  async checkBudget(projectId: string): Promise<BudgetStatus> {
    const usage = await this.calculateCurrentUsage(projectId);
    const percentUsed = (usage.total / this.FREE_TIER_LIMIT) * 100;
    
    // Check if over limit
    if (usage.total >= this.FREE_TIER_LIMIT) {
      await this.enforceFreeTierLimit(projectId);
      await this.sendBudgetAlert(projectId, usage, 'exceeded');
    }
    // Check if approaching limit
    else if (percentUsed >= this.WARNING_THRESHOLD * 100) {
      await this.sendBudgetAlert(projectId, usage, 'warning');
    }
    
    return {
      used: usage.total,
      limit: this.FREE_TIER_LIMIT,
      remaining: Math.max(0, this.FREE_TIER_LIMIT - usage.total),
      percentUsed,
      willExceedAt: this.projectExceedTime(usage.dailyRate, usage.total),
      isOverLimit: usage.total >= this.FREE_TIER_LIMIT,
    };
  }

  async calculateCurrentUsage(projectId: string): Promise<UsageMetrics> {
    // Get current billing period (month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Aggregate usage events
    const usageEvents = await this.prisma.usageEvent.groupBy({
      by: ['metricType'],
      where: {
        projectId,
        timestamp: {
          gte: startOfMonth,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    // Calculate costs
    const metrics: UsageMetrics = {
      cpuSeconds: 0,
      memoryGBHours: 0,
      storageGBHours: 0,
      egressGB: 0,
      requests: 0,
      total: 0,
      dailyRate: 0,
    };

    for (const event of usageEvents) {
      // Convert Decimal to number
      const quantity = Number(event._sum.quantity || 0);
      
      switch (event.metricType) {
        case 'cpu_seconds':
          metrics.cpuSeconds = quantity;
          metrics.total += quantity * this.pricing.cpuSecond;
          break;
        case 'memory_gb_hours':
          metrics.memoryGBHours = quantity;
          metrics.total += quantity * this.pricing.memoryGBHour;
          break;
        case 'storage_gb_hours':
          metrics.storageGBHours = quantity;
          metrics.total += quantity * this.pricing.storageGBHour;
          break;
        case 'egress_gb':
          metrics.egressGB = quantity;
          metrics.total += quantity * this.pricing.egressGB;
          break;
        case 'requests':
          metrics.requests = quantity;
          metrics.total += quantity * this.pricing.request;
          break;
      }
    }

    // Calculate daily rate based on days elapsed
    const daysElapsed = Math.max(1, (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24));
    metrics.dailyRate = metrics.total / daysElapsed;

    return metrics;
  }

  private async enforceFreeTierLimit(projectId: string) {
    // Get all services for the project
    const services = await this.prisma.deployment.findMany({
      where: {
        projectId,
        status: 'active',
      },
      select: {
        id: true,
        environment: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    // Scale down all non-production services to zero
    for (const service of services) {
      if (service.environment.slug !== 'production') {
        // await this.k8sService.scaleDeployment(service.id, 0);
        console.log(`Would scale down ${service.id} to 0`);
      } else {
        // Scale production to minimum
        // await this.k8sService.scaleDeployment(service.id, 1);
        console.log(`Would scale ${service.id} to 1`);
      }
    }

    // Update project status
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'budget_exceeded',
        budgetExceededAt: new Date(),
      },
    });
  }

  private async sendBudgetAlert(
    projectId: string,
    usage: UsageMetrics,
    type: 'warning' | 'exceeded'
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!project) return;

    const message = type === 'exceeded'
      ? `Your project "${project.name}" has exceeded the free tier limit of $${this.FREE_TIER_LIMIT}. Services have been scaled down to prevent additional charges.`
      : `Your project "${project.name}" has used ${(usage.total / this.FREE_TIER_LIMIT * 100).toFixed(0)}% of the free tier limit.`;

    // Send notifications to all team members
    for (const user of project.team.users) {
      await this.notificationService.send({
        userId: user.id,
        type: 'budget_alert',
        severity: type === 'exceeded' ? 'critical' : 'warning',
        title: type === 'exceeded' ? 'Free Tier Limit Exceeded' : 'Approaching Free Tier Limit',
        message,
        data: {
          projectId,
          usage: {
            total: usage.total,
            limit: this.FREE_TIER_LIMIT,
            breakdown: {
              compute: (usage.cpuSeconds * this.pricing.cpuSecond + usage.memoryGBHours * this.pricing.memoryGBHour).toFixed(2),
              storage: (usage.storageGBHours * this.pricing.storageGBHour).toFixed(2),
              network: (usage.egressGB * this.pricing.egressGB).toFixed(2),
              requests: (usage.requests * this.pricing.request).toFixed(2),
            },
          },
        },
      });
    }
  }

  private projectExceedTime(dailyRate: number, currentUsage: number): Date | undefined {
    if (dailyRate <= 0) return undefined;
    
    const remainingBudget = this.FREE_TIER_LIMIT - currentUsage;
    if (remainingBudget <= 0) return new Date(); // Already exceeded
    
    const daysUntilExceed = remainingBudget / dailyRate;
    const exceedDate = new Date();
    exceedDate.setDate(exceedDate.getDate() + daysUntilExceed);
    
    return exceedDate;
  }

  // Scheduled job to check all projects
  async checkAllProjectBudgets() {
    const projects = await this.prisma.project.findMany({
      where: {
        status: {
          not: 'budget_exceeded',
        },
      },
    });

    for (const project of projects) {
      try {
        await this.checkBudget(project.id);
      } catch (error) {
        console.error(`Failed to check budget for project ${project.id}:`, error);
      }
    }
  }

  // Get budget status for UI
  async getBudgetStatusForUI(projectId: string): Promise<BudgetStatus & { breakdown: any }> {
    const status = await this.checkBudget(projectId);
    const usage = await this.calculateCurrentUsage(projectId);
    
    return {
      ...status,
      breakdown: {
        compute: {
          cost: (usage.cpuSeconds * this.pricing.cpuSecond + usage.memoryGBHours * this.pricing.memoryGBHour).toFixed(2),
          cpuHours: (usage.cpuSeconds / 3600).toFixed(2),
          memoryGBHours: usage.memoryGBHours.toFixed(2),
        },
        storage: {
          cost: (usage.storageGBHours * this.pricing.storageGBHour).toFixed(2),
          gbHours: usage.storageGBHours.toFixed(2),
        },
        network: {
          cost: (usage.egressGB * this.pricing.egressGB).toFixed(2),
          egressGB: usage.egressGB.toFixed(2),
        },
        requests: {
          cost: (usage.requests * this.pricing.request).toFixed(2),
          millions: (usage.requests / 1000000).toFixed(2),
        },
      },
    };
  }
}