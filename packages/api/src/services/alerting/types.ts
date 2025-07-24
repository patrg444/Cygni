export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "firing" | "resolved";
export type AlertProvider = "pagerduty" | "opsgenie" | "webhook";

export interface Alert {
  id: string;
  name: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  description?: string;
  source: string;
  metric?: string;
  value?: number;
  threshold?: number;
  tags: Record<string, string>;
  startsAt: Date;
  endsAt?: Date;
  fingerprint: string; // For deduplication
  generatorURL?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  severity: AlertSeverity;
  metric: string;
  condition: AlertCondition;
  duration: number; // seconds
  annotations: {
    summary: string;
    description?: string;
    runbook?: string;
  };
  labels: Record<string, string>;
  notificationChannels: string[];
}

export interface AlertCondition {
  type: "threshold" | "range" | "rate" | "absence";
  operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
  value: number;
  value2?: number; // For range conditions
}

export interface NotificationChannel {
  id: string;
  name: string;
  provider: AlertProvider;
  enabled: boolean;
  config: PagerDutyConfig | OpsGenieConfig | WebhookConfig;
}

export interface PagerDutyConfig {
  integrationKey: string;
  severity: AlertSeverity[];
}

export interface OpsGenieConfig {
  apiKey: string;
  teamName?: string;
  priority: Record<AlertSeverity, "P1" | "P2" | "P3" | "P4" | "P5">;
}

export interface WebhookConfig {
  url: string;
  method: "POST" | "PUT";
  headers?: Record<string, string>;
  basicAuth?: {
    username: string;
    password: string;
  };
}

export interface AlertNotification {
  alertId: string;
  channelId: string;
  provider: AlertProvider;
  sentAt: Date;
  success: boolean;
  response?: any;
  error?: string;
}

export interface AlertEvent {
  type: "created" | "updated" | "resolved" | "acknowledged" | "escalated";
  alertId: string;
  timestamp: Date;
  user?: string;
  message?: string;
}

export interface AlertProviderClient {
  send(alert: Alert, config: any): Promise<AlertNotification>;
  acknowledge(alertId: string, config: any): Promise<void>;
  resolve(alertId: string, config: any): Promise<void>;
}