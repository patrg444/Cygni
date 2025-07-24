# Prometheus Metrics Guide

## Overview

Cygni exposes comprehensive metrics in Prometheus format for monitoring, alerting, and observability. Metrics are available at the `/metrics` endpoint without authentication to allow Prometheus scraping.

## Metrics Endpoint

```
GET /metrics
```

Returns metrics in Prometheus exposition format:
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/health",status_code="200"} 1234

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1",method="GET",route="/api/health",status_code="200"} 1200
```

## Available Metrics

### HTTP Metrics

#### http_requests_total
- **Type**: Counter
- **Description**: Total number of HTTP requests
- **Labels**: `method`, `route`, `status_code`
- **Use Case**: Track request volume and error rates

#### http_request_duration_seconds
- **Type**: Histogram
- **Description**: Duration of HTTP requests in seconds
- **Labels**: `method`, `route`, `status_code`
- **Buckets**: 0.1, 0.5, 1, 2, 5 seconds
- **Use Case**: Monitor latency and SLOs

#### http_request_size_bytes
- **Type**: Summary
- **Description**: Size of HTTP requests in bytes
- **Labels**: `method`, `route`
- **Percentiles**: 50th, 90th, 95th, 99th
- **Use Case**: Track payload sizes

#### http_response_size_bytes
- **Type**: Summary
- **Description**: Size of HTTP responses in bytes
- **Labels**: `method`, `route`
- **Percentiles**: 50th, 90th, 95th, 99th
- **Use Case**: Monitor bandwidth usage

### Authentication Metrics

#### authentication_attempts_total
- **Type**: Counter
- **Description**: Total number of authentication attempts
- **Labels**: `type` (login/signup), `success` (true/false)
- **Use Case**: Track login failures and signup rates

#### active_user_sessions
- **Type**: Gauge
- **Description**: Number of active user sessions (24h window)
- **Use Case**: Monitor user engagement

### Deployment Metrics

#### deployments_total
- **Type**: Counter
- **Description**: Total number of deployments
- **Labels**: `provider`, `status`, `project_id`
- **Use Case**: Track deployment success rates

#### deployment_duration_seconds
- **Type**: Histogram
- **Description**: Duration of deployments in seconds
- **Labels**: `provider`, `status`
- **Buckets**: 30, 60, 120, 300, 600 seconds
- **Use Case**: Monitor deployment performance

#### active_deployments
- **Type**: Gauge
- **Description**: Number of active deployments
- **Labels**: `provider`, `tier`
- **Use Case**: Track infrastructure usage

### Database Metrics

#### database_query_duration_seconds
- **Type**: Histogram
- **Description**: Duration of database queries in seconds
- **Labels**: `operation`, `model`
- **Buckets**: 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1 seconds
- **Use Case**: Identify slow queries

#### database_connection_pool_size
- **Type**: Gauge
- **Description**: Database connection pool statistics
- **Labels**: `state` (active/idle/total)
- **Use Case**: Monitor connection usage

### Business Metrics

#### subscription_revenue_usd
- **Type**: Gauge
- **Description**: Monthly recurring revenue in USD
- **Labels**: `plan`
- **Use Case**: Track MRR by plan

#### teams_total
- **Type**: Gauge
- **Description**: Total number of teams
- **Labels**: `plan`, `status`
- **Use Case**: Monitor customer growth

#### projects_total
- **Type**: Gauge
- **Description**: Total number of projects
- **Labels**: `status`
- **Use Case**: Track platform usage

#### resource_usage
- **Type**: Gauge
- **Description**: Resource usage by type
- **Labels**: `resource_type`, `unit`
- **Use Case**: Monitor consumption

### Billing Metrics

#### payments_processed_total
- **Type**: Counter
- **Description**: Total number of payments processed
- **Labels**: `status`, `currency`
- **Use Case**: Track payment success rates

#### payment_amount_usd
- **Type**: Summary
- **Description**: Payment amounts in USD
- **Labels**: `status`
- **Percentiles**: 50th, 90th, 95th, 99th
- **Use Case**: Monitor revenue distribution

#### subscription_churn_total
- **Type**: Counter
- **Description**: Number of cancelled subscriptions
- **Labels**: `plan`, `reason`
- **Use Case**: Track churn by plan

### Error Metrics

#### errors_total
- **Type**: Counter
- **Description**: Total number of errors
- **Labels**: `type`, `severity`
- **Use Case**: Monitor error rates

### External Service Metrics

#### external_service_duration_seconds
- **Type**: Histogram
- **Description**: Duration of external service calls
- **Labels**: `service`, `method`, `status`
- **Buckets**: 0.1, 0.5, 1, 2, 5, 10 seconds
- **Use Case**: Monitor third-party dependencies

#### stripe_webhook_events_total
- **Type**: Counter
- **Description**: Total number of Stripe webhook events
- **Labels**: `event_type`, `status`
- **Use Case**: Track webhook processing

### System Metrics

#### nodejs_memory_usage_bytes
- **Type**: Gauge
- **Description**: Node.js memory usage
- **Labels**: `type` (rss/heap_total/heap_used/external)
- **Use Case**: Monitor memory consumption

#### nodejs_cpu_usage_seconds
- **Type**: Gauge
- **Description**: Node.js CPU usage
- **Labels**: `type` (user/system)
- **Use Case**: Track CPU utilization

## Prometheus Configuration

### Basic Scrape Config

```yaml
scrape_configs:
  - job_name: 'cygni-api'
    static_configs:
      - targets: ['api.cygni.dev:4000']
    scrape_interval: 30s
    metrics_path: '/metrics'
```

### Service Discovery (Kubernetes)

```yaml
scrape_configs:
  - job_name: 'cygni-api'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: cygni-api
        action: keep
      - source_labels: [__meta_kubernetes_pod_container_port_number]
        regex: "4000"
        action: keep
```

### AWS ECS Service Discovery

```yaml
scrape_configs:
  - job_name: 'cygni-api'
    ec2_sd_configs:
      - region: us-east-1
        port: 4000
        filters:
          - name: tag:Service
            values: [cygni-api]
```

## Common Queries

### Request Rate
```promql
rate(http_requests_total[5m])
```

### Error Rate
```promql
rate(http_requests_total{status_code=~"5.."}[5m])
```

### 95th Percentile Latency
```promql
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket[5m])
)
```

### Success Rate by Endpoint
```promql
sum by (route) (
  rate(http_requests_total{status_code=~"2.."}[5m])
) / 
sum by (route) (
  rate(http_requests_total[5m])
) * 100
```

### Authentication Failure Rate
```promql
rate(authentication_attempts_total{success="false"}[5m])
```

### Database Query Performance
```promql
histogram_quantile(0.99,
  rate(database_query_duration_seconds_bucket[5m])
) by (operation, model)
```

### Monthly Recurring Revenue
```promql
sum(subscription_revenue_usd)
```

### Active Projects by Status
```promql
projects_total
```

### Payment Success Rate
```promql
rate(payments_processed_total{status="success"}[1h]) /
rate(payments_processed_total[1h]) * 100
```

## Alerting Rules

### High Error Rate
```yaml
groups:
  - name: cygni_api
    rules:
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"
```

### Slow Response Time
```yaml
- alert: SlowResponseTime
  expr: |
    histogram_quantile(0.95,
      rate(http_request_duration_seconds_bucket[5m])
    ) > 2
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "95th percentile response time > 2s"
```

### Database Connection Pool Exhaustion
```yaml
- alert: DatabaseConnectionPoolExhaustion
  expr: |
    database_connection_pool_size{state="idle"} / 
    database_connection_pool_size{state="total"} < 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Database connection pool near exhaustion"
```

### Payment Failures
```yaml
- alert: HighPaymentFailureRate
  expr: |
    rate(payments_processed_total{status="failed"}[1h]) /
    rate(payments_processed_total[1h]) > 0.1
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Payment failure rate > 10%"
```

### Memory Pressure
```yaml
- alert: HighMemoryUsage
  expr: |
    nodejs_memory_usage_bytes{type="heap_used"} / 
    nodejs_memory_usage_bytes{type="heap_total"} > 0.9
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Node.js heap usage > 90%"
```

## Grafana Dashboard

### Import Dashboard

1. Import the Cygni API dashboard from JSON
2. Configure Prometheus data source
3. Set refresh interval to 30s

### Key Panels

1. **Request Rate** - Line graph of requests/sec
2. **Error Rate** - Line graph with threshold
3. **Response Time** - Heatmap of latencies
4. **Status Codes** - Pie chart breakdown
5. **Active Users** - Single stat
6. **Revenue** - Single stat with sparkline
7. **Database Performance** - Table of slow queries
8. **System Resources** - Memory and CPU gauges

## Best Practices

### Label Cardinality
- Keep label values bounded
- Use route normalization for dynamic paths
- Avoid high-cardinality labels like user IDs

### Metric Naming
- Follow Prometheus naming conventions
- Use `_total` suffix for counters
- Use `_seconds` suffix for durations
- Use descriptive metric names

### Performance
- Metrics collection is lightweight
- Histograms use predefined buckets
- System metrics collected every 10s
- Business metrics collected every 30s

### Security
- `/metrics` endpoint has no auth for Prometheus
- Consider IP allowlisting in production
- Use TLS for metric scraping
- Don't expose sensitive data in labels

## Troubleshooting

### Missing Metrics
- Check if service is running
- Verify Prometheus can reach endpoint
- Check for label mismatches

### High Memory Usage
- Reduce histogram buckets
- Increase collection intervals
- Check for cardinality explosion

### Slow Queries
- Use recording rules for complex queries
- Pre-aggregate in Prometheus
- Optimize label usage