"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const client_1 = require("@prisma/client");
class NotificationService {
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async send(notification) {
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
        }
        catch (error) {
            console.error("Failed to send notification:", error);
            // Don't throw - notifications shouldn't break the app
        }
    }
    async sendOpsAlert(alert) {
        console.error(`[OPS ALERT] ${alert.severity.toUpperCase()}: ${alert.title}`);
        console.error(alert.message);
        if (alert.data) {
            console.error("Additional data:", alert.data);
        }
        // In production, this would:
        // - Send to PagerDuty for critical alerts
        // - Post to ops Slack channel
        // - Create incident ticket
    }
    async sendEmail(notification) {
        // This would integrate with SendGrid or similar
        console.log(`Would send email: ${notification.title} to user ${notification.userId}`);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map