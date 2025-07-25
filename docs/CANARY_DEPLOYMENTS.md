# Canary Deployment Guide

Canary deployments allow you to gradually roll out new versions to a small percentage of users before promoting to full production.

## Overview

Canary deployments help reduce risk by:
- Testing new versions with real traffic
- Monitoring key metrics during rollout
- Automatic rollback on errors
- Gradual traffic increase

## Prerequisites

- Pro or Enterprise plan
- Deployment ready for canary release
- Monitoring configured

## Quick Start

### 1. Deploy New Version

First, deploy your new version without routing traffic:

```bash
cygni deploy --no-traffic
# Returns: deployment_id
```

### 2. Start Canary

Start routing a small percentage of traffic:

```bash
cygni canary start deployment_123 \
  --percentage 5 \
  --duration 30m \
  --auto-promote
```

### 3. Monitor Progress

```bash
# Watch canary status
cygni canary status canary_456

# View metrics
cygni canary metrics canary_456
```

## Configuration Options

### Basic Configuration

```bash
cygni canary start <deployment-id> [options]
```

Options:
- `--percentage` - Initial traffic percentage (1-50)
- `--duration` - Test duration (5m-24h)
- `--auto-promote` - Automatically promote if healthy
- `--auto-rollback` - Automatically rollback on errors

### Advanced Configuration

```json
{
  "percentage": 10,
  "duration": 60,
  "successThreshold": 0.99,
  "errorThreshold": 0.01,
  "latencyThreshold": 500,
  "autoPromote": true,
  "autoRollback": true
}
```

## Deployment Strategies

### Conservative Canary

Start with minimal traffic and gradually increase:

```bash
# Start at 1%
cygni canary start dep_123 --percentage 1 --duration 15m

# Increase to 5%
cygni canary update canary_456 --percentage 5

# Increase to 25%
cygni canary update canary_456 --percentage 25

# Promote to 100%
cygni canary promote canary_456
```

### Time-Based Canary

Automatically increase traffic over time:

```bash
cygni canary start dep_123 \
  --percentage 5 \
  --duration 2h \
  --increment 10 \
  --interval 30m
```

### Feature Flag Canary

Route specific users to canary:

```bash
cygni canary start dep_123 \
  --target-users "beta-testers" \
  --percentage 100
```

## Monitoring

### Key Metrics

Canary deployments monitor:
- **Success Rate**: HTTP 2xx responses
- **Error Rate**: HTTP 5xx responses  
- **Latency**: P50, P95, P99 response times
- **Traffic**: Requests per second

### Viewing Metrics

```bash
# Real-time metrics
cygni canary metrics canary_456 --follow

# Historical data
cygni canary metrics canary_456 --since 1h
```

### Alerts

Configure alerts for canary deployments:

```bash
cygni alerts create \
  --type canary-failure \
  --threshold "error_rate > 5%" \
  --action rollback
```

## Manual Control

### Pause Canary

Stop routing new traffic without rollback:

```bash
cygni canary pause canary_456
```

### Update Traffic

Manually adjust traffic percentage:

```bash
cygni canary update canary_456 --percentage 25
```

### Force Promotion

Override automatic checks:

```bash
cygni canary promote canary_456 --force
```

### Manual Rollback

```bash
cygni canary rollback canary_456 --reason "High error rate detected"
```

## Best Practices

### 1. Start Small
- Begin with 1-5% traffic
- Monitor for at least 15 minutes
- Gradually increase percentage

### 2. Define Success Criteria
```yaml
canary:
  success_criteria:
    error_rate: < 1%
    success_rate: > 99%
    p95_latency: < 500ms
    p99_latency: < 1000ms
```

### 3. Monitor Business Metrics
Beyond technical metrics, monitor:
- Conversion rates
- User engagement
- Revenue metrics

### 4. Use Automation Wisely
- Enable auto-rollback for safety
- Manual promotion for critical releases
- Set conservative thresholds

## API Reference

### Start Canary
```bash
POST /api/v2/projects/{projectId}/deployments/{deploymentId}/canary
{
  "percentage": 10,
  "duration": 60,
  "successThreshold": 0.99,
  "errorThreshold": 0.01,
  "latencyThreshold": 500,
  "autoPromote": false,
  "autoRollback": true
}
```

### Get Status
```bash
GET /api/v2/canary/{canaryId}
```

### Update Traffic
```bash
PATCH /api/v2/canary/{canaryId}/traffic
{
  "percentage": 25
}
```

### Promote
```bash
POST /api/v2/canary/{canaryId}/promote
```

### Rollback
```bash
POST /api/v2/canary/{canaryId}/rollback
{
  "reason": "Manual rollback"
}
```

## Troubleshooting

### Canary Stuck at Low Percentage

Possible causes:
- Insufficient traffic for metrics
- Metrics not meeting thresholds
- Canary paused

Solution:
```bash
# Check detailed status
cygni canary status canary_456 --verbose

# Force traffic increase
cygni canary update canary_456 --percentage 10 --force
```

### Metrics Not Updating

Check monitoring is configured:
```bash
# Verify metrics collection
cygni metrics test --project proj_123

# Check canary endpoints
cygni canary endpoints canary_456
```

### Unexpected Rollback

Review rollback criteria:
```bash
# View canary logs
cygni logs --filter "canary_456"

# Check threshold violations
cygni canary violations canary_456
```

## Examples

### Next.js Application

```bash
# Deploy new version
cygni deploy --project my-nextjs-app --no-traffic

# Start canary with strict criteria
cygni canary start dep_123 \
  --percentage 5 \
  --duration 1h \
  --success-threshold 0.995 \
  --error-threshold 0.005 \
  --latency-threshold 200
```

### API Service

```bash
# Deploy API update
cygni deploy --project my-api --no-traffic

# Canary with gradual rollout
cygni canary start dep_456 \
  --percentage 10 \
  --duration 2h \
  --increment 10 \
  --interval 20m \
  --auto-promote
```

### Critical Service

```bash
# Deploy with maximum safety
cygni deploy --project payment-service --no-traffic

# Ultra-conservative canary
cygni canary start dep_789 \
  --percentage 1 \
  --duration 4h \
  --success-threshold 0.9999 \
  --error-threshold 0.0001 \
  --latency-threshold 100 \
  --auto-rollback \
  --no-auto-promote
```