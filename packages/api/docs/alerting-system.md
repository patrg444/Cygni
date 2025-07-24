# Alerting System Guide

## Overview

Cygni's alerting system provides comprehensive monitoring and notification capabilities to ensure platform reliability. The system evaluates metrics, detects anomalies, and sends notifications through multiple channels including PagerDuty, OpsGenie, and custom webhooks.

## Architecture

### Components

1. **Alert Manager** - Evaluates rules and manages alert lifecycle
2. **Alert Service** - Handles alert creation, deduplication, and notifications
3. **Alert Providers** - Integrations with external notification services
4. **Alert Rules** - Predefined conditions that trigger alerts

### Alert Flow

```
Metrics → Alert Manager → Rule Evaluation → Alert Service → Notification Providers
                              ↓                    ↓
                        Alert Created        Deduplication
                              ↓                    ↓
                        Notifications        Alert Storage
```

## Configuration

### Environment Variables

```env
# PagerDuty Configuration
PAGERDUTY_INTEGRATION_KEY=your_integration_key

# OpsGenie Configuration
OPSGENIE_API_KEY=your_api_key
OPSGENIE_TEAM_NAME=your_team_name
OPSGENIE_WEBHOOK_SECRET=your_webhook_secret

# Alert Manager Settings
ALERT_EVALUATION_INTERVAL=30  # seconds
ALERT_RESOLUTION_TIMEOUT=300  # seconds

# Grafana (for alert links)
GRAFANA_URL=https://grafana.cygni.dev
```

## Alert Rules

### Default Rules

The system includes pre-configured alert rules for common scenarios:

#### Critical Alerts (PagerDuty)

1. **High Error Rate**
   - Threshold: > 5% error rate for 5 minutes
   - Impact: API degradation, user-facing errors

2. **Database Connection Exhaustion**
   - Threshold: < 10% idle connections for 5 minutes
   - Impact: Query failures, service unavailability

3. **High Payment Failure Rate**
   - Threshold: > 10% failure rate for 15 minutes
   - Impact: Revenue loss, customer dissatisfaction

4. **API Down**
   - Threshold: Health check failing for 1 minute
   - Impact: Complete service outage

#### Warning Alerts (OpsGenie)

1. **Slow Response Time**
   - Threshold: 95th percentile > 2s for 10 minutes
   - Impact: Degraded user experience

2. **Slow Database Queries**
   - Threshold: p99 latency > 1s for 10 minutes
   - Impact: Performance degradation

3. **High Login Failure Rate**
   - Threshold: > 30% failure rate for 5 minutes
   - Impact: Potential security issue or service problem

4. **High Memory Usage**
   - Threshold: > 90% heap usage for 5 minutes
   - Impact: Risk of out-of-memory errors

### Custom Alert Rules

To add custom alert rules, modify `/src/services/alerting/alert-rules.ts`:

```typescript
{
  id: "custom-alert",
  name: "Custom Alert Name",
  enabled: true,
  severity: "warning",
  metric: "custom_metric_name",
  condition: {
    type: "threshold",
    operator: ">",
    value: 100,
  },
  duration: 300, // 5 minutes
  annotations: {
    summary: "Custom alert triggered: {{value}}",
    description: "Detailed description of the issue",
    runbook: "https://docs.cygni.dev/runbooks/custom-alert",
  },
  labels: {
    team: "platform",
    component: "custom",
  },
  notificationChannels: ["opsgenie-default"],
}
```

## API Endpoints

### Get Active Alerts

```http
GET /api/alerts
Authorization: Bearer <token>

Response:
{
  "alerts": [
    {
      "id": "abc-123",
      "name": "High Error Rate",
      "severity": "critical",
      "status": "firing",
      "message": "Error rate is 7.2% (threshold: 5%)",
      "startsAt": "2024-01-15T10:30:00Z",
      "tags": {
        "team": "platform",
        "component": "api"
      }
    }
  ],
  "count": 1
}
```

### Acknowledge Alert

```http
POST /api/alerts/:alertId/acknowledge
Authorization: Bearer <token>

Response:
{
  "message": "Alert acknowledged"
}
```

### Get Alert Rules

```http
GET /api/alerts/rules?severity=critical&component=api
Authorization: Bearer <token>

Response:
{
  "rules": [...],
  "count": 4
}
```

### Test Alert Rule

```http
POST /api/alerts/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "ruleId": "high-error-rate"
}

Response:
{
  "rule": {
    "id": "high-error-rate",
    "name": "High Error Rate",
    "severity": "critical"
  },
  "result": {
    "wouldFire": false,
    "currentValue": 0.02,
    "threshold": 0.05
  }
}
```

## Notification Channels

### PagerDuty Integration

1. Create a service in PagerDuty
2. Add an Events API v2 integration
3. Copy the integration key to `PAGERDUTY_INTEGRATION_KEY`

Features:
- Automatic incident creation
- Deduplication by alert fingerprint
- Severity mapping
- Auto-resolution when metric recovers

### OpsGenie Integration

1. Create an API integration in OpsGenie
2. Copy the API key to `OPSGENIE_API_KEY`
3. Optionally set team name in `OPSGENIE_TEAM_NAME`

Features:
- Alert creation with priority mapping
- Team routing
- Custom tags and details
- Webhook support for bidirectional sync

### Custom Webhooks

Configure custom webhook endpoints for alerts:

```typescript
{
  id: "slack-webhook",
  name: "Slack Notifications",
  provider: "webhook",
  enabled: true,
  config: {
    url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  },
}
```

## Alert Lifecycle

### 1. Detection
- Metrics evaluated every 30 seconds
- Conditions checked against thresholds
- Duration requirements enforced

### 2. Creation
- Alert fingerprint generated for deduplication
- Notifications sent to configured channels
- Alert stored in active alerts map

### 3. Notification
- Providers called in parallel
- Retries on transient failures
- Success/failure tracked in metrics

### 4. Resolution
- Automatic when metric recovers
- Manual via API endpoint
- Resolution notifications sent

## Metrics

The alerting system exposes its own metrics:

- `alerts_total` - Total alerts fired by severity and name
- `alert_notifications_total` - Notifications sent by provider and status
- `active_alerts` - Current active alerts by severity
- `alert_evaluation_duration_seconds` - Rule evaluation performance

## Webhook Endpoints

### PagerDuty Webhook

```http
POST /api/webhooks/pagerduty
Content-Type: application/json

{
  "event": {
    "id": "event-id",
    "event_type": "incident.acknowledged",
    "data": {...}
  }
}
```

### OpsGenie Webhook

```http
POST /api/webhooks/opsgenie
OpsGenie-Webhook-Auth: <webhook-secret>
Content-Type: application/json

{
  "action": "Acknowledge",
  "alert": {
    "alertId": "alert-id",
    "message": "Alert message"
  }
}
```

## Troubleshooting

### Alerts Not Firing

1. Check if rules are enabled
2. Verify metric exists and has data
3. Check duration requirements
4. Review alert manager logs

### Notifications Not Sent

1. Verify provider credentials
2. Check notification channel configuration
3. Review provider-specific logs
4. Test provider connectivity

### High Alert Volume

1. Review and tune thresholds
2. Increase duration requirements
3. Implement alert grouping
4. Use severity-based routing

## Best Practices

1. **Alert Fatigue Prevention**
   - Set appropriate thresholds
   - Use duration to avoid flapping
   - Route by severity appropriately

2. **Actionable Alerts**
   - Include clear descriptions
   - Link to runbooks
   - Provide context in labels

3. **Testing**
   - Use test endpoint before production
   - Verify notification delivery
   - Test escalation paths

4. **Maintenance**
   - Review alert effectiveness monthly
   - Update thresholds based on trends
   - Archive resolved alerts

## Runbooks

Each alert should have an associated runbook. Template:

```markdown
# Alert: [Alert Name]

## Overview
Brief description of what this alert means

## Impact
- User impact
- Business impact
- Technical impact

## Diagnosis
1. Check metric dashboard
2. Review recent changes
3. Check dependencies

## Resolution
1. Immediate mitigation steps
2. Root cause investigation
3. Long-term fixes

## Prevention
- Monitoring improvements
- Code changes
- Process updates
```

## Security Considerations

1. **Webhook Authentication**
   - Verify webhook signatures
   - Use webhook secrets
   - Validate source IPs

2. **API Access**
   - Alert endpoints require authentication
   - Role-based access for acknowledgment
   - Audit trail for actions

3. **Sensitive Data**
   - Avoid PII in alert messages
   - Sanitize error details
   - Use secure channels

## Integration Examples

### Slack Integration

```javascript
// Custom webhook for Slack
const slackWebhook = {
  url: process.env.SLACK_WEBHOOK_URL,
  method: "POST",
  transform: (alert) => ({
    text: `🚨 ${alert.severity.toUpperCase()}: ${alert.message}`,
    attachments: [{
      color: alert.severity === "critical" ? "danger" : "warning",
      fields: [
        { title: "Alert", value: alert.name, short: true },
        { title: "Value", value: alert.value, short: true },
        { title: "Started", value: alert.startsAt, short: true },
      ],
    }],
  }),
};
```

### Datadog Integration

```javascript
// Forward alerts to Datadog
const datadogWebhook = {
  url: "https://api.datadoghq.com/api/v1/events",
  method: "POST",
  headers: {
    "DD-API-KEY": process.env.DATADOG_API_KEY,
  },
  transform: (alert) => ({
    title: alert.name,
    text: alert.message,
    alert_type: alert.severity === "critical" ? "error" : "warning",
    tags: Object.entries(alert.tags).map(([k, v]) => `${k}:${v}`),
  }),
};
```

## Monitoring the Monitor

Monitor the alerting system itself:

1. **Alert Manager Health**
   - Check evaluation frequency
   - Monitor rule processing time
   - Track memory usage

2. **Notification Delivery**
   - Track success rates by provider
   - Monitor notification latency
   - Alert on delivery failures

3. **Alert Quality**
   - Track false positive rate
   - Measure time to acknowledge
   - Review resolution times