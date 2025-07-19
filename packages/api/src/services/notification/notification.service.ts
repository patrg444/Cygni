import { PrismaClient } from "@prisma/client";

interface Notification {
  userId: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  data?: any;
}

interface OpsAlert {
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
  data?: any;
}

export class NotificationService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async send(notification: Notification): Promise<void> {
    try {
      // Store notification in database
      await this.prisma.notification.create({
        data: {
          userId: notification.userId,
          type: notification.type,
          severity: notification.severity,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: false,
          createdAt: new Date(),
        },
      });

      // Send email based on severity
      if (notification.severity === "critical") {
        await this.sendEmail(notification);
      }

      // Send push notification if enabled
      // await this.sendPushNotification(notification);

      // Send to Slack if configured
      // await this.sendSlackNotification(notification);
    } catch (error) {
      console.error("Failed to send notification:", error);
      // Don't throw - notifications shouldn't break the app
    }
  }

  async sendOpsAlert(alert: OpsAlert): Promise<void> {
    console.error(
      `[OPS ALERT] ${alert.severity.toUpperCase()}: ${alert.title}`,
    );
    console.error(alert.message);
    if (alert.data) {
      console.error("Additional data:", alert.data);
    }

    // In production, this would:
    // - Send to PagerDuty for critical alerts
    // - Post to ops Slack channel
    // - Create incident ticket
  }

  private async sendEmail(notification: Notification): Promise<void> {
    // This would integrate with SendGrid or similar
    console.log(
      `Would send email: ${notification.title} to user ${notification.userId}`,
    );
  }
}
