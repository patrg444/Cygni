# Blue-Green Deployment Guide

Blue-green deployments provide zero-downtime releases by maintaining two identical production environments and switching between them.

## Overview

Blue-green deployments offer:
- **Zero Downtime**: Instant switch between environments
- **Quick Rollback**: Immediate return to previous version
- **Risk Reduction**: Test in production-like environment
- **Simple Process**: Clear, predictable deployment flow

## How It Works

```
┌─────────────┐     ┌─────────────┐
│    Blue     │     │    Green    │
│  (Current)  │     │    (New)    │
│   100% ◄────┼─────┼──── 0%     │
└─────────────┘     └─────────────┘
       │                    │
       └────────┬───────────┘
                │
           Load Balancer
                │
             Users
```

## Prerequisites

- Enterprise plan
- Production deployment (blue)
- New deployment ready (green)

## Deployment Strategies

### 1. Immediate Switch

Switch all traffic instantly:

```bash
# Deploy green environment
cygni deploy --env green --no-traffic

# Initialize blue-green
cygni blue-green init deployment_456 --strategy immediate

# Switch when ready
cygni blue-green switch bg_123
```

### 2. Gradual Switch

Gradually shift traffic over time:

```bash
# Initialize with gradual strategy
cygni blue-green init deployment_456 \
  --strategy gradual \
  --duration 30m \
  --auto-switch

# Monitor progress
cygni blue-green status bg_123 --watch
```

### 3. Validation Switch

Test green before switching:

```bash
# Initialize with validation
cygni blue-green init deployment_456 \
  --strategy gradual \
  --validation-period 10m \
  --auto-switch \
  --rollback-on-error
```

## Step-by-Step Guide

### Step 1: Deploy Green Environment

Deploy new version without traffic:

```bash
cygni deploy --no-traffic --tag v2.0.0
# Note the deployment ID: deployment_456
```

### Step 2: Initialize Blue-Green

```bash
cygni blue-green init deployment_456 \
  --project my-app \
  --strategy immediate
```

### Step 3: Validate Green

Test the green environment:

```bash
# Get green URL
cygni blue-green status bg_123

# Run smoke tests
curl https://green-deployment_456.cygni-preview.app/health

# Check metrics
cygni blue-green validate bg_123
```

### Step 4: Switch Traffic

When confident, switch traffic:

```bash
# Full switch
cygni blue-green switch bg_123

# Or partial switch
cygni blue-green switch bg_123 --percentage 50
```

### Step 5: Monitor

Watch the switch:

```bash
# Real-time status
cygni blue-green status bg_123 --follow

# Traffic distribution
cygni blue-green traffic bg_123
```

### Step 6: Complete or Rollback

```bash
# If successful, complete
cygni blue-green complete bg_123

# If issues, rollback
cygni blue-green rollback bg_123 --reason "High error rate"
```

## Configuration Options

### Basic Configuration

```yaml
blue_green:
  strategy: immediate|gradual|canary
  switch_duration: 30m        # For gradual
  validation_period: 10m      # Test period
  auto_switch: true          # Auto-switch if healthy
  rollback_on_error: true    # Auto-rollback on errors
```

### Health Criteria

```yaml
health_checks:
  success_rate: ">= 99.5%"
  error_rate: "< 0.5%"
  latency_p95: "< 500ms"
  active_connections: "> 0"
```

## Monitoring

### Health Metrics

Monitor both environments:

```bash
# Compare environments
cygni blue-green compare bg_123

# Detailed metrics
cygni blue-green metrics bg_123 --env both
```

### Traffic Analysis

```bash
# Current traffic split
cygni blue-green traffic bg_123

# Traffic history
cygni blue-green traffic bg_123 --history
```

## Best Practices

### 1. Pre-deployment Checklist

- [ ] Database migrations completed
- [ ] Configuration synchronized
- [ ] Dependencies updated
- [ ] Smoke tests ready
- [ ] Rollback plan documented

### 2. Testing Strategy

```bash
# 1. Deploy to green
cygni deploy --no-traffic

# 2. Run integration tests
cygni test integration --target green

# 3. Send test traffic
cygni blue-green init deployment_456 --validation-period 15m

# 4. Monitor metrics
cygni blue-green validate bg_123 --watch
```

### 3. Database Considerations

For database changes:
- Use backward-compatible migrations
- Deploy schema changes separately
- Test with production data snapshot

### 4. Gradual Rollout

```bash
# Start small
cygni blue-green switch bg_123 --percentage 5
sleep 5m

# Increase gradually
cygni blue-green switch bg_123 --percentage 25
sleep 10m

cygni blue-green switch bg_123 --percentage 50
sleep 10m

# Full switch
cygni blue-green switch bg_123 --percentage 100
```

## Automation

### CI/CD Integration

```yaml
# .github/workflows/deploy.yml
- name: Deploy Green
  run: |
    DEPLOYMENT_ID=$(cygni deploy --no-traffic --output json | jq -r .deploymentId)
    echo "DEPLOYMENT_ID=$DEPLOYMENT_ID" >> $GITHUB_ENV

- name: Initialize Blue-Green
  run: |
    BG_ID=$(cygni blue-green init $DEPLOYMENT_ID \
      --strategy gradual \
      --duration 30m \
      --auto-switch \
      --output json | jq -r .blueGreenId)
    echo "BG_ID=$BG_ID" >> $GITHUB_ENV

- name: Monitor Switch
  run: |
    cygni blue-green wait $BG_ID --timeout 45m
```

### Automated Rollback

```bash
# Set up monitoring
cygni alerts create \
  --type blue-green-health \
  --threshold "error_rate > 1%" \
  --action "blue-green rollback" \
  --deployment bg_123
```

## Troubleshooting

### Switch Stuck

If switch is stuck:

```bash
# Check status
cygni blue-green status bg_123 --verbose

# Force switch
cygni blue-green switch bg_123 --force

# Or force rollback
cygni blue-green rollback bg_123 --force --reason "Manual intervention"
```

### Traffic Not Switching

Verify load balancer:

```bash
# Check configuration
cygni blue-green config bg_123

# Test routing
cygni blue-green test-traffic bg_123
```

### Health Check Failures

Debug health issues:

```bash
# Detailed health report
cygni blue-green health bg_123 --detailed

# Check specific metrics
cygni metrics --deployment green_deployment_456 --metric error_rate
```

## API Reference

### Initialize Blue-Green
```
POST /api/v2/projects/{projectId}/deployments/{greenDeploymentId}/blue-green
{
  "strategy": "gradual",
  "switchDuration": 30,
  "validationPeriod": 10,
  "autoSwitch": true,
  "rollbackOnError": true
}
```

### Switch Traffic
```
POST /api/v2/blue-green/{blueGreenId}/switch
{
  "percentage": 50  // Optional, defaults to 100
}
```

### Rollback
```
POST /api/v2/blue-green/{blueGreenId}/rollback
{
  "reason": "High error rate detected"
}
```

### Get Status
```
GET /api/v2/blue-green/{blueGreenId}
```

## Examples

### Web Application

```bash
# Deploy new frontend version
cygni deploy my-web-app --no-traffic --tag v2.0.0

# Blue-green with validation
cygni blue-green init deployment_789 \
  --strategy immediate \
  --validation-period 15m \
  --auto-switch

# Monitor and complete
cygni blue-green status bg_456 --follow
```

### API Service

```bash
# Deploy API update
cygni deploy my-api --no-traffic

# Gradual switch over 1 hour
cygni blue-green init deployment_012 \
  --strategy gradual \
  --duration 60m \
  --rollback-on-error
```

### Microservice

```bash
# Deploy service update
cygni deploy user-service --no-traffic

# Quick validation and switch
cygni blue-green init deployment_345 \
  --strategy immediate \
  --validation-period 5m \
  --auto-switch \
  --health-check "curl -f http://green/health"
```