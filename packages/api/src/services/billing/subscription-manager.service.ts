import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { StripeService } from "./stripe.service";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  features: {
    maxProjects: number;
    maxDeployments: number;
    maxTeamMembers: number;
    cpuHours: number;
    memoryGbHours: number;
    storageGb: number;
    bandwidthGb: number;
    customDomains: boolean;
    sslCertificates: boolean;
    autoScaling: boolean;
    multiRegion: boolean;
    dedicatedSupport: boolean;
    sla: number; // uptime percentage
  };
  stripePriceId?: string;
}

export class SubscriptionManagerService {
  private prisma: PrismaClient;
  private stripeService: StripeService;
  
  // Define subscription plans
  static readonly PLANS: Record<string, SubscriptionPlan> = {
    free: {
      id: "free",
      name: "Free",
      description: "Perfect for trying out Cygni",
      monthlyPrice: 0,
      features: {
        maxProjects: 1,
        maxDeployments: 2,
        maxTeamMembers: 1,
        cpuHours: 100,
        memoryGbHours: 200,
        storageGb: 5,
        bandwidthGb: 10,
        customDomains: false,
        sslCertificates: true,
        autoScaling: false,
        multiRegion: false,
        dedicatedSupport: false,
        sla: 99.0,
      },
    },
    starter: {
      id: "starter",
      name: "Starter",
      description: "For small teams and projects",
      monthlyPrice: 29,
      features: {
        maxProjects: 3,
        maxDeployments: 10,
        maxTeamMembers: 3,
        cpuHours: 500,
        memoryGbHours: 1000,
        storageGb: 50,
        bandwidthGb: 100,
        customDomains: true,
        sslCertificates: true,
        autoScaling: true,
        multiRegion: false,
        dedicatedSupport: false,
        sla: 99.5,
      },
      stripePriceId: process.env.STRIPE_PRICE_STARTER,
    },
    pro: {
      id: "pro",
      name: "Professional",
      description: "For growing businesses",
      monthlyPrice: 99,
      features: {
        maxProjects: 10,
        maxDeployments: 50,
        maxTeamMembers: 10,
        cpuHours: 2000,
        memoryGbHours: 4000,
        storageGb: 200,
        bandwidthGb: 500,
        customDomains: true,
        sslCertificates: true,
        autoScaling: true,
        multiRegion: true,
        dedicatedSupport: false,
        sla: 99.9,
      },
      stripePriceId: process.env.STRIPE_PRICE_PRO,
    },
    enterprise: {
      id: "enterprise",
      name: "Enterprise",
      description: "For large organizations",
      monthlyPrice: 499,
      features: {
        maxProjects: -1, // unlimited
        maxDeployments: -1,
        maxTeamMembers: -1,
        cpuHours: -1,
        memoryGbHours: -1,
        storageGb: -1,
        bandwidthGb: -1,
        customDomains: true,
        sslCertificates: true,
        autoScaling: true,
        multiRegion: true,
        dedicatedSupport: true,
        sla: 99.99,
      },
      stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE,
    },
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.stripeService = new StripeService(prisma);
  }

  // Get current subscription plan for a team
  async getCurrentPlan(teamId: string): Promise<SubscriptionPlan> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new Error("Team not found");
    }

    // If no subscription, return free plan
    if (!team.stripeSubscriptionId) {
      return SubscriptionManagerService.PLANS.free;
    }

    // Get subscription from Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2023-08-16",
    });

    try {
      const subscription = await stripe.subscriptions.retrieve(
        team.stripeSubscriptionId,
      );

      // Find plan by price ID
      for (const plan of Object.values(SubscriptionManagerService.PLANS)) {
        if (
          plan.stripePriceId &&
          subscription.items.data.some((item) => item.price.id === plan.stripePriceId)
        ) {
          return plan;
        }
      }
    } catch (error) {
      console.error("Failed to retrieve subscription:", error);
    }

    // Default to free if subscription not found
    return SubscriptionManagerService.PLANS.free;
  }

  // Check if team can perform an action based on plan limits
  async checkPlanLimits(
    teamId: string,
    resource: keyof SubscriptionPlan["features"],
    currentUsage?: number,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const plan = await this.getCurrentPlan(teamId);
    const limit = plan.features[resource] as number;

    // Unlimited resources return -1
    if (limit === -1) {
      return { allowed: true, limit: -1, current: currentUsage || 0 };
    }

    // Boolean features
    if (typeof limit === "boolean") {
      return { allowed: limit, limit: limit ? 1 : 0, current: 0 };
    }

    // Numeric limits
    let current = currentUsage || 0;

    // If not provided, calculate current usage
    if (!currentUsage) {
      switch (resource) {
        case "maxProjects":
          current = await this.prisma.project.count({
            where: { teamId, status: { not: "deleted" } },
          });
          break;

        case "maxDeployments":
          const projects = await this.prisma.project.findMany({
            where: { teamId },
            select: { id: true },
          });
          current = await this.prisma.deployment.count({
            where: {
              projectId: { in: projects.map((p) => p.id) },
              status: "active",
            },
          });
          break;

        case "maxTeamMembers":
          current = await this.prisma.user.count({
            where: { teamId },
          });
          break;

        // Usage-based limits checked against current month
        case "cpuHours":
        case "memoryGbHours":
        case "storageGb":
        case "bandwidthGb":
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const metricType = this.mapResourceToMetric(resource);
          if (metricType) {
            const usage = await this.prisma.usageEvent.aggregate({
              where: {
                projectId: {
                  in: projects.map((p) => p.id),
                },
                metricType,
                timestamp: { gte: startOfMonth },
              },
              _sum: {
                quantity: true,
              },
            });
            current = usage._sum.quantity?.toNumber() || 0;

            // Convert to appropriate units
            if (resource === "cpuHours") current = current / 3600;
            if (resource === "storageGb") current = current / 730; // hours to GB-month
          }
          break;
      }
    }

    return {
      allowed: current < limit,
      limit,
      current,
    };
  }

  // Upgrade or downgrade subscription
  async changePlan(teamId: string, newPlanId: string): Promise<void> {
    const newPlan = SubscriptionManagerService.PLANS[newPlanId];
    if (!newPlan) {
      throw new Error("Invalid plan");
    }

    const currentPlan = await this.getCurrentPlan(teamId);
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new Error("Team not found");
    }

    // Check if downgrade is allowed
    if (this.isPlanDowngrade(currentPlan, newPlan)) {
      await this.validateDowngrade(teamId, currentPlan, newPlan);
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2023-08-16",
    });

    // Handle different scenarios
    if (newPlanId === "free") {
      // Cancel subscription
      if (team.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(team.stripeSubscriptionId);
        await this.prisma.team.update({
          where: { id: teamId },
          data: {
            stripeSubscriptionId: null,
            subscriptionStatus: "canceled",
          },
        });
      }
    } else if (!team.stripeSubscriptionId) {
      // Create new subscription
      if (!team.stripeCustomerId) {
        throw new Error("No payment method on file");
      }

      const subscription = await stripe.subscriptions.create({
        customer: team.stripeCustomerId,
        items: [{ price: newPlan.stripePriceId }],
        metadata: { teamId, planId: newPlanId },
      });

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
        },
      });
    } else {
      // Update existing subscription
      const subscription = await stripe.subscriptions.retrieve(
        team.stripeSubscriptionId,
      );

      // Remove old items and add new one
      const updates = [];
      for (const item of subscription.items.data) {
        updates.push({
          id: item.id,
          deleted: true,
        });
      }
      updates.push({
        price: newPlan.stripePriceId,
      });

      await stripe.subscriptions.update(team.stripeSubscriptionId, {
        items: updates,
        metadata: { planId: newPlanId },
        proration_behavior: "create_prorations",
      });
    }

    // Create notification
    const users = await this.prisma.user.findMany({
      where: { teamId, role: { in: ["owner", "admin"] } },
    });

    for (const user of users) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: "subscription_changed",
          severity: "info",
          title: "Subscription Updated",
          message: `Your subscription has been changed to ${newPlan.name}`,
          data: {
            oldPlan: currentPlan.id,
            newPlan: newPlanId,
          },
        },
      });
    }
  }

  // Validate downgrade is possible
  private async validateDowngrade(
    teamId: string,
    currentPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
  ): Promise<void> {
    const checks = [
      "maxProjects",
      "maxDeployments",
      "maxTeamMembers",
    ] as const;

    const violations = [];

    for (const check of checks) {
      const result = await this.checkPlanLimits(teamId, check);
      const newLimit = newPlan.features[check] as number;

      if (newLimit !== -1 && result.current > newLimit) {
        violations.push(
          `Current ${check} (${result.current}) exceeds new plan limit (${newLimit})`,
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Cannot downgrade: ${violations.join(", ")}. Please reduce usage first.`,
      );
    }
  }

  // Check if plan change is a downgrade
  private isPlanDowngrade(
    currentPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
  ): boolean {
    return currentPlan.monthlyPrice > newPlan.monthlyPrice;
  }

  // Map resource to metric type
  private mapResourceToMetric(resource: string): string | null {
    const mapping: Record<string, string> = {
      cpuHours: "cpu_seconds",
      memoryGbHours: "memory_gb_hours",
      storageGb: "storage_gb_hours",
      bandwidthGb: "egress_gb",
    };
    return mapping[resource] || null;
  }

  // Get usage summary for current billing period
  async getUsageSummary(teamId: string) {
    const plan = await this.getCurrentPlan(teamId);
    const projects = await this.prisma.project.findMany({
      where: { teamId },
      include: {
        _count: {
          select: { deployments: true },
        },
      },
    });

    const teamMembers = await this.prisma.user.count({
      where: { teamId },
    });

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const projectIds = projects.map((p) => p.id);
    const usage = await this.prisma.usageEvent.groupBy({
      by: ["metricType"],
      where: {
        projectId: { in: projectIds },
        timestamp: { gte: startOfMonth },
      },
      _sum: {
        quantity: true,
      },
    });

    // Calculate usage by type
    const usageByType: Record<string, number> = {};
    for (const item of usage) {
      usageByType[item.metricType] = item._sum.quantity?.toNumber() || 0;
    }

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        monthlyPrice: plan.monthlyPrice,
      },
      usage: {
        projects: {
          current: projects.length,
          limit: plan.features.maxProjects,
          percentage:
            plan.features.maxProjects === -1
              ? 0
              : (projects.length / plan.features.maxProjects) * 100,
        },
        deployments: {
          current: projects.reduce((sum, p) => sum + p._count.deployments, 0),
          limit: plan.features.maxDeployments,
          percentage:
            plan.features.maxDeployments === -1
              ? 0
              : (projects.reduce((sum, p) => sum + p._count.deployments, 0) /
                  plan.features.maxDeployments) *
                100,
        },
        teamMembers: {
          current: teamMembers,
          limit: plan.features.maxTeamMembers,
          percentage:
            plan.features.maxTeamMembers === -1
              ? 0
              : (teamMembers / plan.features.maxTeamMembers) * 100,
        },
        resources: {
          cpuHours: {
            current: (usageByType.cpu_seconds || 0) / 3600,
            limit: plan.features.cpuHours,
            percentage:
              plan.features.cpuHours === -1
                ? 0
                : ((usageByType.cpu_seconds || 0) /
                    3600 /
                    plan.features.cpuHours) *
                  100,
          },
          memoryGbHours: {
            current: usageByType.memory_gb_hours || 0,
            limit: plan.features.memoryGbHours,
            percentage:
              plan.features.memoryGbHours === -1
                ? 0
                : ((usageByType.memory_gb_hours || 0) /
                    plan.features.memoryGbHours) *
                  100,
          },
          bandwidthGb: {
            current: usageByType.egress_gb || 0,
            limit: plan.features.bandwidthGb,
            percentage:
              plan.features.bandwidthGb === -1
                ? 0
                : ((usageByType.egress_gb || 0) / plan.features.bandwidthGb) *
                  100,
          },
        },
      },
    };
  }
}