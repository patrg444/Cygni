import { BaseAlertProvider } from "./base.provider";
import { Alert, AlertNotification, PagerDutyConfig } from "../types";
import crypto from "crypto";

interface PagerDutyEvent {
  routing_key: string;
  event_action: "trigger" | "acknowledge" | "resolve";
  dedup_key?: string;
  payload: {
    summary: string;
    source: string;
    severity: "critical" | "error" | "warning" | "info";
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, any>;
  };
  links?: Array<{
    href: string;
    text: string;
  }>;
}

export class PagerDutyProvider extends BaseAlertProvider {
  private readonly apiUrl = "https://events.pagerduty.com/v2/enqueue";

  constructor() {
    super("pagerduty");
  }

  async send(alert: Alert, config: PagerDutyConfig): Promise<AlertNotification> {
    try {
      // Check if this severity should be sent
      if (!config.severity.includes(alert.severity)) {
        return this.createNotification(
          alert.id,
          "",
          false,
          null,
          "Severity not configured for notification"
        );
      }

      const event: PagerDutyEvent = {
        routing_key: config.integrationKey,
        event_action: "trigger",
        dedup_key: alert.fingerprint,
        payload: {
          summary: alert.message,
          source: alert.source,
          severity: this.mapSeverity(alert.severity),
          timestamp: alert.startsAt.toISOString(),
          component: alert.tags.service || "cygni-api",
          group: alert.tags.environment || "production",
          custom_details: {
            alert_name: alert.name,
            metric: alert.metric,
            value: alert.value,
            threshold: alert.threshold,
            description: alert.description,
            tags: alert.tags,
          },
        },
      };

      if (alert.generatorURL) {
        event.links = [{
          href: alert.generatorURL,
          text: "View in Grafana",
        }];
      }

      const response = await this.makeRequest("POST", this.apiUrl, event);

      return this.createNotification(
        alert.id,
        "",
        true,
        response
      );
    } catch (error) {
      return this.createNotification(
        alert.id,
        "",
        false,
        null,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async acknowledge(alertId: string, config: PagerDutyConfig): Promise<void> {
    const event: PagerDutyEvent = {
      routing_key: config.integrationKey,
      event_action: "acknowledge",
      dedup_key: alertId,
      payload: {
        summary: `Alert ${alertId} acknowledged`,
        source: "cygni-api",
        severity: "info",
      },
    };

    await this.makeRequest("POST", this.apiUrl, event);
  }

  async resolve(alertId: string, config: PagerDutyConfig): Promise<void> {
    const event: PagerDutyEvent = {
      routing_key: config.integrationKey,
      event_action: "resolve",
      dedup_key: alertId,
      payload: {
        summary: `Alert ${alertId} resolved`,
        source: "cygni-api",
        severity: "info",
      },
    };

    await this.makeRequest("POST", this.apiUrl, event);
  }

  private mapSeverity(severity: Alert["severity"]): PagerDutyEvent["payload"]["severity"] {
    switch (severity) {
      case "critical":
        return "critical";
      case "warning":
        return "warning";
      case "info":
        return "info";
      default:
        return "error";
    }
  }
}