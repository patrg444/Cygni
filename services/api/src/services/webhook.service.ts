import axios from "axios";
import { logger } from "../utils/logger";
import { prisma } from "../utils/prisma";
import { DeploymentStatus } from "@prisma/client";

export interface WebhookPayload {
  event:
    | "deployment.created"
    | "deployment.updated"
    | "deployment.failed"
    | "deployment.succeeded"
    | "deployment.rollback";
  timestamp: string;
  deployment: {
    id: string;
    projectId: string;
    environmentId: string;
    status: DeploymentStatus;
    buildId: string;
    userId: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  };
  project?: {
    id: string;
    name: string;
    slug: string;
  };
  environment?: {
    id: string;
    name: string;
    slug: string;
  };
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface DeploymentEventPayload {
  projectId: string;
  event: WebhookPayload['event'];
  deployment: {
    id: string;
    projectId: string;
    environmentId: string;
    status: DeploymentStatus;
    buildId: string;
    userId: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
    environment?: {
      id: string;
      name: string;
      slug: string;
    };
    build?: {
      id: string;
      imageUrl?: string;
    };
    project?: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

export class WebhookService {
  async sendDeploymentEvent(payload: DeploymentEventPayload): Promise<void> {
    const { projectId, event, deployment } = payload;
    
    // Get project with webhooks
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        webhooks: {
          where: { active: true },
        },
      },
    });

    if (!project || project.webhooks.length === 0) return;

    const webhookPayload: WebhookPayload = {
      event: event,
      timestamp: new Date().toISOString(),
      deployment: {
        id: deployment.id,
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: deployment.status,
        buildId: deployment.buildId,
        userId: deployment.userId,
        createdAt: deployment.createdAt,
        metadata: deployment.metadata,
      },
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
      },
      environment: deployment.environment ? {
        id: deployment.environment.id,
        name: deployment.environment.name,
        slug: deployment.environment.slug,
      } : undefined,
    };

    // Send to all active webhooks
    for (const webhook of project.webhooks) {
      await WebhookService.sendWebhook(webhook.url, webhookPayload, webhook.secret || undefined);
    }
  }

  private static async sendWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string,
  ) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Cygni-Event": payload.event,
        "X-Cygni-Timestamp": payload.timestamp,
      };

      // Add signature if secret is provided
      if (secret) {
        const crypto = await import("crypto");
        const signature = crypto
          .createHmac("sha256", secret)
          .update(JSON.stringify(payload))
          .digest("hex");
        headers["X-Cygni-Signature"] = `sha256=${signature}`;
      }

      const response = await axios.post(url, payload, {
        headers,
        timeout: 5000, // 5 second timeout
      });

      logger.info("Webhook sent successfully", {
        url,
        event: payload.event,
        status: response.status,
      });

      return { success: true, status: response.status };
    } catch (error) {
      logger.error("Failed to send webhook", {
        url,
        event: payload.event,
        error: error instanceof Error ? error.message : String(error),
      });

      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  static async notifyDeploymentCreated(deploymentId: string) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: {
          include: {
            webhooks: {
              where: { active: true },
            },
          },
        },
        environment: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!deployment) return;

    const payload: WebhookPayload = {
      event: "deployment.created",
      timestamp: new Date().toISOString(),
      deployment: {
        id: deployment.id,
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: deployment.status,
        buildId: deployment.buildId,
        userId: deployment.userId,
        createdAt: deployment.createdAt,
        metadata: deployment.metadata,
      },
      project: {
        id: deployment.project.id,
        name: deployment.project.name,
        slug: deployment.project.slug,
      },
      environment: {
        id: deployment.environment.id,
        name: deployment.environment.name,
        slug: deployment.environment.slug,
      },
      user: deployment.user,
    };

    // Send to all active webhooks
    for (const webhook of deployment.project.webhooks) {
      await this.sendWebhook(webhook.url, payload, webhook.secret || undefined);
    }

    // Send Slack notification if configured
    await this.sendSlackNotification(deployment, "created");
  }

  static async notifyDeploymentStatusChange(
    deploymentId: string,
    _oldStatus: DeploymentStatus,
    newStatus: DeploymentStatus,
  ) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: {
          include: {
            webhooks: {
              where: { active: true },
            },
          },
        },
        environment: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!deployment) return;

    let event: WebhookPayload["event"] = "deployment.updated";
    if (newStatus === DeploymentStatus.active) {
      event = "deployment.succeeded";
    } else if (newStatus === DeploymentStatus.failed) {
      event = "deployment.failed";
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      deployment: {
        id: deployment.id,
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: deployment.status,
        buildId: deployment.buildId,
        userId: deployment.userId,
        createdAt: deployment.createdAt,
        metadata: deployment.metadata,
      },
      project: {
        id: deployment.project.id,
        name: deployment.project.name,
        slug: deployment.project.slug,
      },
      environment: {
        id: deployment.environment.id,
        name: deployment.environment.name,
        slug: deployment.environment.slug,
      },
      user: deployment.user,
    };

    // Send to all active webhooks
    for (const webhook of deployment.project.webhooks) {
      await this.sendWebhook(webhook.url, payload, webhook.secret || undefined);
    }

    // Send Slack notification for important status changes
    if (
      newStatus === DeploymentStatus.active ||
      newStatus === DeploymentStatus.failed
    ) {
      await this.sendSlackNotification(
        deployment,
        newStatus === DeploymentStatus.active ? "succeeded" : "failed",
      );
    }
  }

  private static async sendSlackNotification(deployment: {
    project: { name: string };
    environment: { name: string };
    user: { name?: string; email: string };
    status: string;
  }, action: string) {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) return;

    const color =
      action === "succeeded"
        ? "good"
        : action === "failed"
          ? "danger"
          : "warning";
    const emoji =
      action === "succeeded"
        ? ":white_check_mark:"
        : action === "failed"
          ? ":x:"
          : ":rocket:";

    const payload = {
      attachments: [
        {
          color,
          fallback: `Deployment ${action} for ${deployment.project.name}`,
          title: `${emoji} Deployment ${action}`,
          fields: [
            {
              title: "Project",
              value: deployment.project.name,
              short: true,
            },
            {
              title: "Environment",
              value: deployment.environment.name,
              short: true,
            },
            {
              title: "Deployed by",
              value: deployment.user.name || deployment.user.email,
              short: true,
            },
            {
              title: "Status",
              value: deployment.status,
              short: true,
            },
          ],
          footer: "Cygni",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    try {
      await axios.post(slackWebhookUrl, payload);
    } catch (error) {
      logger.error("Failed to send Slack notification", { error });
    }
  }

  static async updateGitHubStatus(deployment: {
    project: { repository?: string; slug: string };
    environment: { name: string; slug: string };
    status: DeploymentStatus;
    build: { commitSha?: string };
    id: string;
  }) {
    // Check if project has GitHub integration
    const githubToken = process.env.GITHUB_TOKEN;
    if (
      !githubToken ||
      !deployment.project.repository?.includes("github.com")
    ) {
      return;
    }

    try {
      // Extract owner and repo from GitHub URL
      const match = deployment.project.repository.match(
        new RegExp("github\\.com[/:]([\\w-]+)/([\\w.-]+)"),
      );
      if (!match) return;

      const [, owner, repo] = match;
      const state =
        deployment.status === DeploymentStatus.active
          ? "success"
          : deployment.status === DeploymentStatus.failed
            ? "failure"
            : deployment.status === DeploymentStatus.deploying
              ? "pending"
              : "error";

      const description = `Deployment to ${deployment.environment.name} ${deployment.status}`;

      await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/statuses/${deployment.build.commitSha}`,
        {
          state,
          description,
          context: `cygni/${deployment.environment.slug}`,
          target_url: `${process.env.APP_URL}/projects/${deployment.project.slug}/deployments/${deployment.id}`,
        },
        {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      logger.info("GitHub status updated", {
        owner,
        repo,
        commitSha: deployment.build.commitSha,
        state,
      });
    } catch (error) {
      logger.error("Failed to update GitHub status", { error });
    }
  }
}
