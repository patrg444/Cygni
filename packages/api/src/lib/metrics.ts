import { Registry, Counter, Histogram, Gauge, Summary } from "prom-client";
import logger from "./logger";

// Create a custom registry
export const metricsRegistry = new Registry();

// Default labels for all metrics
metricsRegistry.setDefaultLabels({
  app: "cygni-api",
  environment: process.env.NODE_ENV || "development",
  region: process.env.AWS_REGION || "us-east-1",
});

// HTTP Metrics
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5], // 100ms, 500ms, 1s, 2s, 5s
  registers: [metricsRegistry],
});

export const httpRequestSize = new Summary({
  name: "http_request_size_bytes",
  help: "Size of HTTP requests in bytes",
  labelNames: ["method", "route"],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [metricsRegistry],
});

export const httpResponseSize = new Summary({
  name: "http_response_size_bytes",
  help: "Size of HTTP responses in bytes",
  labelNames: ["method", "route"],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [metricsRegistry],
});

// Authentication Metrics
export const authenticationAttempts = new Counter({
  name: "authentication_attempts_total",
  help: "Total number of authentication attempts",
  labelNames: ["type", "success"],
  registers: [metricsRegistry],
});

export const activeUserSessions = new Gauge({
  name: "active_user_sessions",
  help: "Number of active user sessions",
  registers: [metricsRegistry],
});

// Deployment Metrics
export const deploymentTotal = new Counter({
  name: "deployments_total",
  help: "Total number of deployments",
  labelNames: ["provider", "status", "project_id"],
  registers: [metricsRegistry],
});

export const deploymentDuration = new Histogram({
  name: "deployment_duration_seconds",
  help: "Duration of deployments in seconds",
  labelNames: ["provider", "status"],
  buckets: [30, 60, 120, 300, 600], // 30s, 1m, 2m, 5m, 10m
  registers: [metricsRegistry],
});

export const activeDeployments = new Gauge({
  name: "active_deployments",
  help: "Number of active deployments",
  labelNames: ["provider", "tier"],
  registers: [metricsRegistry],
});

// Database Metrics
export const databaseQueryDuration = new Histogram({
  name: "database_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "model"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1], // 5ms to 1s
  registers: [metricsRegistry],
});

export const databaseConnectionPool = new Gauge({
  name: "database_connection_pool_size",
  help: "Size of database connection pool",
  labelNames: ["state"], // active, idle, total
  registers: [metricsRegistry],
});

// Business Metrics
export const subscriptionRevenue = new Gauge({
  name: "subscription_revenue_usd",
  help: "Monthly recurring revenue in USD",
  labelNames: ["plan"],
  registers: [metricsRegistry],
});

export const teamCount = new Gauge({
  name: "teams_total",
  help: "Total number of teams",
  labelNames: ["plan", "status"],
  registers: [metricsRegistry],
});

export const projectCount = new Gauge({
  name: "projects_total",
  help: "Total number of projects",
  labelNames: ["status"],
  registers: [metricsRegistry],
});

export const usageMetrics = new Gauge({
  name: "resource_usage",
  help: "Resource usage by type",
  labelNames: ["resource_type", "unit"],
  registers: [metricsRegistry],
});

// Billing Metrics
export const paymentProcessed = new Counter({
  name: "payments_processed_total",
  help: "Total number of payments processed",
  labelNames: ["status", "currency"],
  registers: [metricsRegistry],
});

export const paymentAmount = new Summary({
  name: "payment_amount_usd",
  help: "Payment amounts in USD",
  labelNames: ["status"],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [metricsRegistry],
});

export const subscriptionChurn = new Counter({
  name: "subscription_churn_total",
  help: "Number of cancelled subscriptions",
  labelNames: ["plan", "reason"],
  registers: [metricsRegistry],
});

// Error Metrics
export const errorCount = new Counter({
  name: "errors_total",
  help: "Total number of errors",
  labelNames: ["type", "severity"],
  registers: [metricsRegistry],
});

// External Service Metrics
export const externalServiceDuration = new Histogram({
  name: "external_service_duration_seconds",
  help: "Duration of external service calls in seconds",
  labelNames: ["service", "method", "status"],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // 100ms to 10s
  registers: [metricsRegistry],
});

export const stripeWebhookEvents = new Counter({
  name: "stripe_webhook_events_total",
  help: "Total number of Stripe webhook events",
  labelNames: ["event_type", "status"],
  registers: [metricsRegistry],
});

// Alerting Metrics
export const alertsTotal = new Counter({
  name: "alerts_total",
  help: "Total number of alerts fired",
  labelNames: ["severity", "alertname"],
  registers: [metricsRegistry],
});

export const alertNotificationsTotal = new Counter({
  name: "alert_notifications_total",
  help: "Total number of alert notifications sent",
  labelNames: ["provider", "status"],
  registers: [metricsRegistry],
});

export const activeAlerts = new Gauge({
  name: "active_alerts",
  help: "Current number of active alerts",
  labelNames: ["severity"],
  registers: [metricsRegistry],
});

export const alertEvaluationDuration = new Histogram({
  name: "alert_evaluation_duration_seconds",
  help: "Duration of alert rule evaluation",
  labelNames: ["rule"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry],
});

// Rate Limiting Metrics
export const rateLimitHits = new Counter({
  name: "rate_limit_hits_total",
  help: "Total number of rate limit hits",
  labelNames: ["tier", "endpoint"],
  registers: [metricsRegistry],
});

export const rateLimitExceeded = new Counter({
  name: "rate_limit_exceeded_total",
  help: "Total number of rate limit exceeded responses",
  labelNames: ["tier", "endpoint", "ip"],
  registers: [metricsRegistry],
});

export const rateLimitRemaining = new Gauge({
  name: "rate_limit_remaining",
  help: "Remaining rate limit for active sessions",
  labelNames: ["tier", "team_id"],
  registers: [metricsRegistry],
});

// Queue Metrics (for background jobs)
export const jobQueueSize = new Gauge({
  name: "job_queue_size",
  help: "Number of jobs in queue",
  labelNames: ["job_type", "status"],
  registers: [metricsRegistry],
});

export const jobProcessingDuration = new Histogram({
  name: "job_processing_duration_seconds",
  help: "Duration of job processing in seconds",
  labelNames: ["job_type", "status"],
  buckets: [1, 5, 10, 30, 60, 300], // 1s to 5m
  registers: [metricsRegistry],
});

// System Metrics
export const systemMemoryUsage = new Gauge({
  name: "nodejs_memory_usage_bytes",
  help: "Node.js memory usage",
  labelNames: ["type"], // rss, heapTotal, heapUsed, external
  registers: [metricsRegistry],
});

export const systemCpuUsage = new Gauge({
  name: "nodejs_cpu_usage_seconds",
  help: "Node.js CPU usage",
  labelNames: ["type"], // user, system
  registers: [metricsRegistry],
});

// Helper functions for recording metrics
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number,
  requestSize?: number,
  responseSize?: number,
) {
  const labels = { method, route: normalizeRoute(route), status_code: statusCode.toString() };
  
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, duration / 1000); // Convert to seconds
  
  if (requestSize) {
    httpRequestSize.observe({ method, route: normalizeRoute(route) }, requestSize);
  }
  
  if (responseSize) {
    httpResponseSize.observe({ method, route: normalizeRoute(route) }, responseSize);
  }
}

export function recordAuthentication(type: string, success: boolean) {
  authenticationAttempts.inc({ type, success: success.toString() });
}

export function recordDeployment(
  provider: string,
  status: string,
  projectId: string,
  duration?: number,
) {
  deploymentTotal.inc({ provider, status, project_id: projectId });
  
  if (duration) {
    deploymentDuration.observe({ provider, status }, duration / 1000);
  }
}

export function recordDatabaseQuery(
  operation: string,
  model: string,
  duration: number,
) {
  databaseQueryDuration.observe({ operation, model }, duration / 1000);
}

export function recordPayment(
  status: string,
  amount: number,
  currency: string = "USD",
) {
  paymentProcessed.inc({ status, currency });
  
  if (currency === "USD") {
    paymentAmount.observe({ status }, amount);
  }
}

export function recordError(type: string, severity: string = "error") {
  errorCount.inc({ type, severity });
}

export function recordExternalService(
  service: string,
  method: string,
  status: string,
  duration: number,
) {
  externalServiceDuration.observe({ service, method, status }, duration / 1000);
}

export function recordStripeWebhook(eventType: string, status: string) {
  stripeWebhookEvents.inc({ event_type: eventType, status });
}

export function recordJobMetrics(
  jobType: string,
  status: string,
  duration?: number,
) {
  if (duration) {
    jobProcessingDuration.observe({ job_type: jobType, status }, duration / 1000);
  }
}

export function recordAlert(severity: string, alertName: string) {
  alertsTotal.inc({ severity, alertname: alertName });
  
  // Update active alerts gauge
  const criticalCount = Array.from(activeAlerts.hashMap.values())
    .filter(v => v.labels.severity === "critical")
    .reduce((sum, v) => sum + v.value, 0);
  const warningCount = Array.from(activeAlerts.hashMap.values())
    .filter(v => v.labels.severity === "warning")
    .reduce((sum, v) => sum + v.value, 0);
  const infoCount = Array.from(activeAlerts.hashMap.values())
    .filter(v => v.labels.severity === "info")
    .reduce((sum, v) => sum + v.value, 0);
    
  activeAlerts.set({ severity: "critical" }, criticalCount);
  activeAlerts.set({ severity: "warning" }, warningCount);
  activeAlerts.set({ severity: "info" }, infoCount);
}

export function recordAlertNotification(provider: string, success: boolean) {
  alertNotificationsTotal.inc({ 
    provider, 
    status: success ? "success" : "failed" 
  });
}

export function recordAlertEvaluation(rule: string, duration: number) {
  alertEvaluationDuration.observe({ rule }, duration / 1000);
}

export function recordRateLimit(tier: string, endpoint: string, exceeded: boolean, teamId?: string, ip?: string) {
  rateLimitHits.inc({ tier, endpoint });
  
  if (exceeded) {
    rateLimitExceeded.inc({ tier, endpoint, ip: ip || "unknown" });
  }
  
  if (teamId) {
    // This would be called periodically to update remaining limits
    // Not on every request to avoid performance impact
  }
}

// Normalize route paths to avoid high cardinality
function normalizeRoute(route: string): string {
  // Replace IDs with placeholders
  return route
    .replace(/\/[a-f0-9-]{36}/gi, "/:id") // UUIDs
    .replace(/\/\d+/g, "/:id") // Numeric IDs
    .replace(/\?.*$/, ""); // Remove query params
}

// Update system metrics periodically
export function startSystemMetricsCollection() {
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    systemMemoryUsage.set({ type: "rss" }, memoryUsage.rss);
    systemMemoryUsage.set({ type: "heap_total" }, memoryUsage.heapTotal);
    systemMemoryUsage.set({ type: "heap_used" }, memoryUsage.heapUsed);
    systemMemoryUsage.set({ type: "external" }, memoryUsage.external);
    
    const cpuUsage = process.cpuUsage();
    systemCpuUsage.set({ type: "user" }, cpuUsage.user / 1000000); // Convert to seconds
    systemCpuUsage.set({ type: "system" }, cpuUsage.system / 1000000);
  }, 10000); // Every 10 seconds
  
  logger.info("System metrics collection started");
}

// Export registry for metrics endpoint
export default metricsRegistry;