import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { EmailService } from '../notification/email.service';
import { WebhookService } from '../webhook/webhook.service';
import { SlackService } from '../notification/slack.service';

interface Alert {
  projectId: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, any>;
}

export class AlertService {
  private emailService: EmailService;
  private webhookService: WebhookService;
  private slackService: SlackService;

  constructor() {
    this.emailService = new EmailService();
    this.webhookService = new WebhookService();
    this.slackService = new SlackService();
  }

  /**
   * Send an alert through configured channels
   */
  async sendAlert(alert: Alert): Promise<void> {
    try {
      logger.info('Sending alert', { alert });

      // Store alert in database
      const storedAlert = await prisma.alert.create({
        data: {
          projectId: alert.projectId,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          metadata: alert.metadata || {},
          timestamp: new Date(),
        },
      });

      // Get alert channels for project
      const channels = await this.getAlertChannels(alert.projectId);

      // Send through each channel
      const sendPromises = channels.map(channel => 
        this.sendThroughChannel(alert, channel).catch(err => {
          logger.error('Failed to send alert through channel', {
            channel: channel.type,
            error: err,
          });
        })
      );

      await Promise.all(sendPromises);

      // Update alert status
      await prisma.alert.update({
        where: { id: storedAlert.id },
        data: {
          sentAt: new Date(),
          sentChannels: channels.map(c => c.type),
        },
      });

      // Check if this should trigger an escalation
      await this.checkEscalation(alert);
    } catch (error) {
      logger.error('Failed to send alert', { alert, error });
      throw error;
    }
  }

  /**
   * Send alert through specific channel
   */
  private async sendThroughChannel(
    alert: Alert,
    channel: AlertChannel
  ): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmailAlert(alert, channel.config);
        break;
      case 'slack':
        await this.sendSlackAlert(alert, channel.config);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alert, channel.config);
        break;
      case 'pagerduty':
        await this.sendPagerDutyAlert(alert, channel.config);
        break;
      default:
        logger.warn('Unknown alert channel type', { type: channel.type });
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(
    alert: Alert,
    config: Record<string, any>
  ): Promise<void> {
    const subject = `[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`;
    
    const html = `
      <h2>Alert: ${alert.type}</h2>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      ${alert.metadata ? `
        <h3>Details:</h3>
        <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
      ` : ''}
      <p>Time: ${new Date().toISOString()}</p>
    `;

    await this.emailService.sendEmail({
      to: config.recipients,
      subject,
      html,
    });
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(
    alert: Alert,
    config: Record<string, any>
  ): Promise<void> {
    const color = this.getSeverityColor(alert.severity);
    
    await this.slackService.sendMessage({
      channel: config.channel,
      attachments: [{
        color,
        title: `${alert.severity.toUpperCase()}: ${alert.type}`,
        text: alert.message,
        fields: alert.metadata ? Object.entries(alert.metadata).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true,
        })) : [],
        timestamp: new Date().getTime() / 1000,
      }],
    });
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(
    alert: Alert,
    config: Record<string, any>
  ): Promise<void> {
    await this.webhookService.sendWebhook({
      url: config.url,
      method: 'POST',
      headers: config.headers || {},
      body: {
        alert,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(
    alert: Alert,
    config: Record<string, any>
  ): Promise<void> {
    const severity = this.mapToPagerDutySeverity(alert.severity);
    
    await this.webhookService.sendWebhook({
      url: 'https://events.pagerduty.com/v2/enqueue',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token token=${config.integrationKey}`,
      },
      body: {
        routing_key: config.integrationKey,
        event_action: 'trigger',
        payload: {
          summary: alert.message,
          severity,
          source: 'cygni',
          component: alert.projectId,
          group: alert.type,
          custom_details: alert.metadata,
        },
      },
    });
  }

  /**
   * Get configured alert channels for a project
   */
  private async getAlertChannels(projectId: string): Promise<AlertChannel[]> {
    const configs = await prisma.alertChannel.findMany({
      where: {
        projectId,
        enabled: true,
      },
    });

    return configs.map(config => ({
      type: config.type as any,
      config: config.config as Record<string, any>,
    }));
  }

  /**
   * Check if alert should trigger escalation
   */
  private async checkEscalation(alert: Alert): Promise<void> {
    if (alert.severity !== 'critical') {
      return;
    }

    // Count recent critical alerts
    const recentCritical = await prisma.alert.count({
      where: {
        projectId: alert.projectId,
        severity: 'critical',
        timestamp: {
          gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
        },
      },
    });

    // Escalate if multiple critical alerts
    if (recentCritical >= 3) {
      await this.escalateAlert(alert);
    }
  }

  /**
   * Escalate alert to higher level
   */
  private async escalateAlert(alert: Alert): Promise<void> {
    logger.warn('Escalating alert', { alert });

    // Get escalation contacts
    const escalation = await prisma.escalationPolicy.findFirst({
      where: {
        projectId: alert.projectId,
      },
    });

    if (!escalation) {
      return;
    }

    // Send to escalation contacts
    await this.sendAlert({
      ...alert,
      type: `ESCALATED: ${alert.type}`,
      message: `ESCALATION: ${alert.message}`,
      metadata: {
        ...alert.metadata,
        escalated: true,
        originalSeverity: alert.severity,
      },
    });
  }

  /**
   * Get severity color for UI
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'info': return '#0088cc';
      case 'warning': return '#ff9800';
      case 'error': return '#f44336';
      case 'critical': return '#d32f2f';
      default: return '#757575';
    }
  }

  /**
   * Map to PagerDuty severity
   */
  private mapToPagerDutySeverity(severity: string): string {
    switch (severity) {
      case 'critical': return 'critical';
      case 'error': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }

  /**
   * Create alert rule
   */
  async createAlertRule(
    projectId: string,
    rule: {
      name: string;
      type: string;
      condition: Record<string, any>;
      channels: string[];
      enabled?: boolean;
    }
  ): Promise<void> {
    await prisma.alertRule.create({
      data: {
        projectId,
        name: rule.name,
        type: rule.type,
        condition: rule.condition,
        channels: rule.channels,
        enabled: rule.enabled ?? true,
      },
    });
  }

  /**
   * Evaluate alert rules
   */
  async evaluateRules(projectId: string, metrics: Record<string, any>): Promise<void> {
    const rules = await prisma.alertRule.findMany({
      where: {
        projectId,
        enabled: true,
      },
    });

    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition as Record<string, any>, metrics)) {
        await this.sendAlert({
          projectId,
          type: rule.type,
          severity: this.determineSeverity(rule, metrics),
          message: this.formatMessage(rule, metrics),
          metadata: {
            rule: rule.name,
            metrics,
          },
        });
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(
    condition: Record<string, any>,
    metrics: Record<string, any>
  ): boolean {
    // Simple threshold evaluation
    for (const [metric, threshold] of Object.entries(condition)) {
      const value = metrics[metric];
      if (typeof threshold === 'object') {
        if (threshold.gt && value <= threshold.gt) return false;
        if (threshold.lt && value >= threshold.lt) return false;
        if (threshold.eq && value !== threshold.eq) return false;
      }
    }
    return true;
  }

  /**
   * Determine alert severity based on rule and metrics
   */
  private determineSeverity(
    rule: any,
    metrics: Record<string, any>
  ): Alert['severity'] {
    // Implement severity logic based on rule type
    if (rule.type === 'error_rate' && metrics.errorRate > 0.1) {
      return 'critical';
    }
    if (rule.type === 'response_time' && metrics.latencyP95 > 2000) {
      return 'error';
    }
    return 'warning';
  }

  /**
   * Format alert message
   */
  private formatMessage(rule: any, metrics: Record<string, any>): string {
    return `Alert: ${rule.name} - Threshold exceeded`;
  }
}