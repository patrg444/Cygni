import { AlertRule, AlertSeverity } from "./types";

// Default alert rules for Cygni platform
export const defaultAlertRules: AlertRule[] = [
  // HTTP Performance
  {
    id: "high-error-rate",
    name: "High Error Rate",
    enabled: true,
    severity: "critical",
    metric: "http_requests_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 0.05, // 5% error rate
    },
    duration: 300, // 5 minutes
    annotations: {
      summary: "Error rate is {{value}}% (threshold: 5%)",
      description: "The API error rate has exceeded 5% for the last 5 minutes. This indicates a potential issue with the service.",
      runbook: "https://docs.cygni.dev/runbooks/high-error-rate",
    },
    labels: {
      team: "platform",
      component: "api",
    },
    notificationChannels: ["pagerduty-default", "opsgenie-default"],
  },
  {
    id: "slow-response-time",
    name: "Slow Response Time",
    enabled: true,
    severity: "warning",
    metric: "http_request_duration_seconds",
    condition: {
      type: "threshold",
      operator: ">",
      value: 2, // 2 seconds
    },
    duration: 600, // 10 minutes
    annotations: {
      summary: "95th percentile response time is {{value}}s",
      description: "API response times are degraded. The 95th percentile latency exceeds 2 seconds.",
      runbook: "https://docs.cygni.dev/runbooks/slow-response-time",
    },
    labels: {
      team: "platform",
      component: "api",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // Database Performance
  {
    id: "database-connection-exhaustion",
    name: "Database Connection Pool Exhaustion",
    enabled: true,
    severity: "critical",
    metric: "database_connection_pool_size",
    condition: {
      type: "threshold",
      operator: "<",
      value: 0.1, // Less than 10% idle connections
    },
    duration: 300, // 5 minutes
    annotations: {
      summary: "Database connection pool has only {{value}}% idle connections",
      description: "Database connection pool is near exhaustion. This will cause queries to fail.",
      runbook: "https://docs.cygni.dev/runbooks/database-connection-exhaustion",
    },
    labels: {
      team: "platform",
      component: "database",
    },
    notificationChannels: ["pagerduty-default"],
  },
  {
    id: "slow-database-queries",
    name: "Slow Database Queries",
    enabled: true,
    severity: "warning",
    metric: "database_query_duration_seconds",
    condition: {
      type: "threshold",
      operator: ">",
      value: 1, // 1 second
    },
    duration: 600, // 10 minutes
    annotations: {
      summary: "Database query p99 latency is {{value}}s",
      description: "Database queries are taking longer than expected. Check for missing indexes or lock contention.",
    },
    labels: {
      team: "platform",
      component: "database",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // Payment & Billing
  {
    id: "high-payment-failure-rate",
    name: "High Payment Failure Rate",
    enabled: true,
    severity: "critical",
    metric: "payments_processed_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 0.1, // 10% failure rate
    },
    duration: 900, // 15 minutes
    annotations: {
      summary: "Payment failure rate is {{value}}%",
      description: "High rate of payment failures detected. This impacts revenue and customer experience.",
      runbook: "https://docs.cygni.dev/runbooks/payment-failures",
    },
    labels: {
      team: "billing",
      component: "stripe",
    },
    notificationChannels: ["pagerduty-default"],
  },
  {
    id: "webhook-processing-failures",
    name: "Webhook Processing Failures",
    enabled: true,
    severity: "warning",
    metric: "stripe_webhook_events_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 0.05, // 5% failure rate
    },
    duration: 600, // 10 minutes
    annotations: {
      summary: "Stripe webhook failure rate is {{value}}%",
      description: "Stripe webhooks are failing. This may cause billing inconsistencies.",
    },
    labels: {
      team: "billing",
      component: "stripe",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // Authentication
  {
    id: "high-login-failure-rate",
    name: "High Login Failure Rate",
    enabled: true,
    severity: "warning",
    metric: "authentication_attempts_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 0.3, // 30% failure rate
    },
    duration: 300, // 5 minutes
    annotations: {
      summary: "Login failure rate is {{value}}%",
      description: "Abnormally high login failure rate detected. Could indicate a brute force attack or service issue.",
    },
    labels: {
      team: "security",
      component: "auth",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // System Resources
  {
    id: "high-memory-usage",
    name: "High Memory Usage",
    enabled: true,
    severity: "warning",
    metric: "nodejs_memory_usage_bytes",
    condition: {
      type: "threshold",
      operator: ">",
      value: 0.9, // 90% of heap
    },
    duration: 300, // 5 minutes
    annotations: {
      summary: "Node.js heap usage at {{value}}%",
      description: "Memory usage is critically high. The application may crash due to out-of-memory errors.",
      runbook: "https://docs.cygni.dev/runbooks/high-memory-usage",
    },
    labels: {
      team: "platform",
      component: "api",
    },
    notificationChannels: ["pagerduty-default"],
  },

  // Deployments
  {
    id: "deployment-failures",
    name: "Deployment Failures",
    enabled: true,
    severity: "warning",
    metric: "deployments_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 0.2, // 20% failure rate
    },
    duration: 1800, // 30 minutes
    annotations: {
      summary: "Deployment failure rate is {{value}}%",
      description: "High rate of deployment failures. Users are unable to deploy their applications.",
    },
    labels: {
      team: "platform",
      component: "deployments",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // External Services
  {
    id: "external-service-degraded",
    name: "External Service Degraded",
    enabled: true,
    severity: "warning",
    metric: "external_service_duration_seconds",
    condition: {
      type: "threshold",
      operator: ">",
      value: 5, // 5 seconds
    },
    duration: 600, // 10 minutes
    annotations: {
      summary: "External service {{service}} latency is {{value}}s",
      description: "External service calls are taking longer than expected. This may impact user experience.",
    },
    labels: {
      team: "platform",
      component: "integrations",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // Business Metrics
  {
    id: "subscription-churn-spike",
    name: "Subscription Churn Spike",
    enabled: true,
    severity: "warning",
    metric: "subscription_churn_total",
    condition: {
      type: "rate",
      operator: ">",
      value: 5, // More than 5 churns per hour
    },
    duration: 3600, // 1 hour
    annotations: {
      summary: "{{value}} subscription cancellations in the last hour",
      description: "Abnormal spike in subscription cancellations detected.",
    },
    labels: {
      team: "product",
      component: "billing",
    },
    notificationChannels: ["opsgenie-default"],
  },

  // Service Availability
  {
    id: "api-down",
    name: "API Down",
    enabled: true,
    severity: "critical",
    metric: "up",
    condition: {
      type: "threshold",
      operator: "==",
      value: 0,
    },
    duration: 60, // 1 minute
    annotations: {
      summary: "API is down",
      description: "The API health check is failing. The service is not responding.",
      runbook: "https://docs.cygni.dev/runbooks/api-down",
    },
    labels: {
      team: "platform",
      component: "api",
    },
    notificationChannels: ["pagerduty-default"],
  },
];

// Helper function to get rules by severity
export function getRulesBySeverity(severity: AlertSeverity): AlertRule[] {
  return defaultAlertRules.filter(rule => rule.severity === severity && rule.enabled);
}

// Helper function to get rules by component
export function getRulesByComponent(component: string): AlertRule[] {
  return defaultAlertRules.filter(
    rule => rule.labels.component === component && rule.enabled
  );
}