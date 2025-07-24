import { BaseAlertProvider } from "./base.provider";
import { Alert, AlertNotification, OpsGenieConfig } from "../types";

interface OpsGenieAlert {
  message: string;
  alias: string;
  description?: string;
  responders?: Array<{
    name?: string;
    type: "team" | "user" | "escalation" | "schedule";
  }>;
  visibleTo?: Array<{
    name?: string;
    type: "team" | "user";
  }>;
  actions?: string[];
  tags?: string[];
  details?: Record<string, string>;
  entity?: string;
  source?: string;
  priority?: "P1" | "P2" | "P3" | "P4" | "P5";
  note?: string;
}

export class OpsGenieProvider extends BaseAlertProvider {
  private readonly apiUrl = "https://api.opsgenie.com/v2";

  constructor() {
    super("opsgenie");
  }

  async send(alert: Alert, config: OpsGenieConfig): Promise<AlertNotification> {
    try {
      const opsgenieAlert: OpsGenieAlert = {
        message: alert.message,
        alias: alert.fingerprint,
        description: alert.description || alert.message,
        priority: config.priority[alert.severity],
        source: alert.source,
        entity: alert.tags.service || "cygni-api",
        tags: this.formatTags(alert.tags),
        details: {
          alert_name: alert.name,
          severity: alert.severity,
          metric: alert.metric || "",
          value: String(alert.value || ""),
          threshold: String(alert.threshold || ""),
          started_at: alert.startsAt.toISOString(),
          ...alert.tags,
        },
      };

      if (config.teamName) {
        opsgenieAlert.responders = [{
          name: config.teamName,
          type: "team",
        }];
      }

      const response = await this.makeRequest(
        "POST",
        `${this.apiUrl}/alerts`,
        opsgenieAlert,
        {
          Authorization: `GenieKey ${config.apiKey}`,
        }
      );

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

  async acknowledge(alertId: string, config: OpsGenieConfig): Promise<void> {
    await this.makeRequest(
      "POST",
      `${this.apiUrl}/alerts/${alertId}/acknowledge`,
      {
        note: "Alert acknowledged via Cygni API",
      },
      {
        Authorization: `GenieKey ${config.apiKey}`,
      }
    );
  }

  async resolve(alertId: string, config: OpsGenieConfig): Promise<void> {
    await this.makeRequest(
      "POST",
      `${this.apiUrl}/alerts/${alertId}/close`,
      {
        note: "Alert resolved via Cygni API",
      },
      {
        Authorization: `GenieKey ${config.apiKey}`,
      }
    );
  }

  private formatTags(tags: Record<string, string>): string[] {
    return Object.entries(tags).map(([key, value]) => `${key}:${value}`);
  }
}