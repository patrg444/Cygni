import { PrismaClient } from "@prisma/client";
import { getWebhookService, WebhookEvent } from "./webhook.service";
import logger from "../../lib/logger";

// Event types
export const WebhookEventTypes = {
  // Deployment events
  DEPLOYMENT_CREATED: "deployment.created",
  DEPLOYMENT_UPDATED: "deployment.updated",
  DEPLOYMENT_SUCCEEDED: "deployment.succeeded",
  DEPLOYMENT_FAILED: "deployment.failed",
  DEPLOYMENT_CANCELLED: "deployment.cancelled",

  // Project events
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  PROJECT_SUSPENDED: "project.suspended",
  PROJECT_RESUMED: "project.resumed",

  // Alert events
  ALERT_TRIGGERED: "alert.triggered",
  ALERT_RESOLVED: "alert.resolved",

  // Billing events
  BILLING_PAYMENT_SUCCEEDED: "billing.payment_succeeded",
  BILLING_PAYMENT_FAILED: "billing.payment_failed",
  BILLING_SUBSCRIPTION_CREATED: "billing.subscription_created",
  BILLING_SUBSCRIPTION_UPDATED: "billing.subscription_updated",
  BILLING_SUBSCRIPTION_CANCELLED: "billing.subscription_cancelled",
  BILLING_USAGE_LIMIT_EXCEEDED: "billing.usage_limit_exceeded",

  // Team events
  TEAM_MEMBER_ADDED: "team.member_added",
  TEAM_MEMBER_REMOVED: "team.member_removed",
  TEAM_MEMBER_ROLE_CHANGED: "team.member_role_changed",

  // Security events
  SECURITY_ALERT: "security.alert",
  SECURITY_AUDIT_LOG: "security.audit_log",

  // System events
  WEBHOOK_TEST: "webhook.test",
} as const;

export type WebhookEventType = typeof WebhookEventTypes[keyof typeof WebhookEventTypes];

// Event trigger functions
export class WebhookEventTrigger {
  private prisma: PrismaClient;
  private webhookService: ReturnType<typeof getWebhookService>;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.webhookService = getWebhookService(prisma);
  }

  // Deployment events
  async deploymentCreated(deployment: any, project: any, team: any): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_${deployment.id}`,
      type: WebhookEventTypes.DEPLOYMENT_CREATED,
      teamId: team.id,
      projectId: project.id,
      data: {
        deployment: {
          id: deployment.id,
          status: deployment.status,
          environment: deployment.environment,
          createdAt: deployment.createdAt,
        },
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
        team: {
          id: team.id,
          name: team.name,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async deploymentStatusChanged(
    deployment: any,
    project: any,
    team: any,
    previousStatus: string
  ): Promise<void> {
    let eventType: WebhookEventType;

    switch (deployment.status) {
      case "ready":
        eventType = WebhookEventTypes.DEPLOYMENT_SUCCEEDED;
        break;
      case "failed":
        eventType = WebhookEventTypes.DEPLOYMENT_FAILED;
        break;
      case "cancelled":
        eventType = WebhookEventTypes.DEPLOYMENT_CANCELLED;
        break;
      default:
        eventType = WebhookEventTypes.DEPLOYMENT_UPDATED;
    }

    const event: WebhookEvent = {
      id: `evt_${Date.now()}_${deployment.id}`,
      type: eventType,
      teamId: team.id,
      projectId: project.id,
      data: {
        deployment: {
          id: deployment.id,
          status: deployment.status,
          previousStatus,
          environment: deployment.environment,
          duration: deployment.completedAt
            ? deployment.completedAt.getTime() - deployment.createdAt.getTime()
            : null,
          createdAt: deployment.createdAt,
          completedAt: deployment.completedAt,
        },
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
        team: {
          id: team.id,
          name: team.name,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  // Project events
  async projectCreated(project: any, team: any, createdBy: string): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_${project.id}`,
      type: WebhookEventTypes.PROJECT_CREATED,
      teamId: team.id,
      projectId: project.id,
      data: {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          framework: project.metadata?.framework,
          repository: project.repository,
          createdAt: project.createdAt,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        createdBy,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async projectUpdated(
    project: any,
    team: any,
    changes: any,
    updatedBy: string
  ): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_${project.id}`,
      type: WebhookEventTypes.PROJECT_UPDATED,
      teamId: team.id,
      projectId: project.id,
      data: {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          status: project.status,
        },
        changes,
        team: {
          id: team.id,
          name: team.name,
        },
        updatedBy,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async projectDeleted(project: any, team: any, deletedBy: string): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_${project.id}`,
      type: WebhookEventTypes.PROJECT_DELETED,
      teamId: team.id,
      projectId: project.id,
      data: {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        deletedBy,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  // Alert events
  async alertTriggered(alert: any, project: any, team: any): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_alert_${alert.id}`,
      type: WebhookEventTypes.ALERT_TRIGGERED,
      teamId: team.id,
      projectId: project?.id,
      data: {
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          threshold: alert.threshold,
          currentValue: alert.currentValue,
          triggeredAt: alert.triggeredAt,
        },
        project: project ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
        } : null,
        team: {
          id: team.id,
          name: team.name,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async alertResolved(alert: any, project: any, team: any): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_alert_${alert.id}`,
      type: WebhookEventTypes.ALERT_RESOLVED,
      teamId: team.id,
      projectId: project?.id,
      data: {
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          triggeredAt: alert.triggeredAt,
          resolvedAt: alert.resolvedAt,
          duration: alert.resolvedAt.getTime() - alert.triggeredAt.getTime(),
        },
        project: project ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
        } : null,
        team: {
          id: team.id,
          name: team.name,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  // Billing events
  async billingPaymentSucceeded(invoice: any, team: any): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_billing_${invoice.id}`,
      type: WebhookEventTypes.BILLING_PAYMENT_SUCCEEDED,
      teamId: team.id,
      data: {
        invoice: {
          id: invoice.id,
          amount: invoice.amount,
          currency: invoice.currency,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        },
        team: {
          id: team.id,
          name: team.name,
          plan: team.plan,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async billingPaymentFailed(invoice: any, team: any, error: string): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_billing_${invoice.id}`,
      type: WebhookEventTypes.BILLING_PAYMENT_FAILED,
      teamId: team.id,
      data: {
        invoice: {
          id: invoice.id,
          amount: invoice.amount,
          currency: invoice.currency,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          error,
        },
        team: {
          id: team.id,
          name: team.name,
          plan: team.plan,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async billingUsageLimitExceeded(
    team: any,
    metric: string,
    limit: number,
    current: number
  ): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_usage_${team.id}`,
      type: WebhookEventTypes.BILLING_USAGE_LIMIT_EXCEEDED,
      teamId: team.id,
      data: {
        metric,
        limit,
        current,
        percentage: Math.round((current / limit) * 100),
        team: {
          id: team.id,
          name: team.name,
          plan: team.plan,
        },
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  // Team events
  async teamMemberAdded(user: any, team: any, role: string, addedBy: string): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_team_${user.id}`,
      type: WebhookEventTypes.TEAM_MEMBER_ADDED,
      teamId: team.id,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        addedBy,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  async teamMemberRemoved(user: any, team: any, removedBy: string): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_team_${user.id}`,
      type: WebhookEventTypes.TEAM_MEMBER_REMOVED,
      teamId: team.id,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        removedBy,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }

  // Security events
  async securityAlert(
    type: string,
    severity: "low" | "medium" | "high" | "critical",
    message: string,
    teamId: string,
    metadata?: any
  ): Promise<void> {
    const event: WebhookEvent = {
      id: `evt_${Date.now()}_security`,
      type: WebhookEventTypes.SECURITY_ALERT,
      teamId,
      data: {
        alertType: type,
        severity,
        message,
        metadata,
      },
      timestamp: new Date(),
    };

    await this.webhookService.triggerEvent(event);
  }
}

// Export singleton instance
let webhookEventTrigger: WebhookEventTrigger | null = null;

export function getWebhookEventTrigger(prisma: PrismaClient): WebhookEventTrigger {
  if (!webhookEventTrigger) {
    webhookEventTrigger = new WebhookEventTrigger(prisma);
  }
  return webhookEventTrigger;
}