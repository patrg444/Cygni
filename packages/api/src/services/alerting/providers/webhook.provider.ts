import { BaseAlertProvider } from "./base.provider";
import { Alert, AlertNotification, WebhookConfig } from "../types";

export class WebhookProvider extends BaseAlertProvider {
  constructor() {
    super("webhook");
  }

  async send(alert: Alert, config: WebhookConfig): Promise<AlertNotification> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };

      if (config.basicAuth) {
        const auth = Buffer.from(
          `${config.basicAuth.username}:${config.basicAuth.password}`
        ).toString("base64");
        headers.Authorization = `Basic ${auth}`;
      }

      const payload = {
        alert: {
          id: alert.id,
          name: alert.name,
          severity: alert.severity,
          status: alert.status,
          message: alert.message,
          description: alert.description,
          source: alert.source,
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
          tags: alert.tags,
          startsAt: alert.startsAt.toISOString(),
          endsAt: alert.endsAt?.toISOString(),
          fingerprint: alert.fingerprint,
          generatorURL: alert.generatorURL,
        },
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(config.url, {
        method: config.method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
      }

      const responseData = await response.json().catch(() => null);

      return this.createNotification(
        alert.id,
        "",
        true,
        responseData
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

  async acknowledge(alertId: string, config: WebhookConfig): Promise<void> {
    // Webhooks typically don't support acknowledgment
    // This is a no-op for webhook provider
  }

  async resolve(alertId: string, config: WebhookConfig): Promise<void> {
    // Send a resolution notification
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    if (config.basicAuth) {
      const auth = Buffer.from(
        `${config.basicAuth.username}:${config.basicAuth.password}`
      ).toString("base64");
      headers.Authorization = `Basic ${auth}`;
    }

    await fetch(config.url, {
      method: config.method,
      headers,
      body: JSON.stringify({
        event: "resolved",
        alertId,
        timestamp: new Date().toISOString(),
      }),
    });
  }
}