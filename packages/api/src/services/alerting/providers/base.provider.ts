import { Alert, AlertNotification, AlertProviderClient } from "../types";
import logger from "../../../lib/logger";
import { recordExternalService } from "../../../lib/metrics";

export abstract class BaseAlertProvider implements AlertProviderClient {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  protected async makeRequest(
    method: string,
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      const duration = Date.now() - startTime;
      recordExternalService(this.name, method, response.ok ? "success" : "error", duration);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.name} API error: ${response.status} - ${error}`);
      }

      return response.json();
    } catch (error) {
      const duration = Date.now() - startTime;
      recordExternalService(this.name, method, "error", duration);
      
      logger.error(`${this.name} request failed`, {
        method,
        url,
        error: error instanceof Error ? error.message : error,
      });
      
      throw error;
    }
  }

  abstract send(alert: Alert, config: any): Promise<AlertNotification>;
  abstract acknowledge(alertId: string, config: any): Promise<void>;
  abstract resolve(alertId: string, config: any): Promise<void>;

  protected createNotification(
    alertId: string,
    channelId: string,
    success: boolean,
    response?: any,
    error?: string
  ): AlertNotification {
    return {
      alertId,
      channelId,
      provider: this.name as any,
      sentAt: new Date(),
      success,
      response,
      error,
    };
  }
}