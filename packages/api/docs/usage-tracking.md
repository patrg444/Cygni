# Usage Tracking System

## Overview

Cygni tracks resource usage across all deployments to provide accurate billing, analytics, and budget management. The system automatically collects metrics from AWS ECS/Fargate and CloudWatch.

## Tracked Metrics

### Compute Resources
- **CPU Seconds**: vCPU usage over time
- **Memory GB-Hours**: Memory allocation and usage
- **Container Instances**: Number of running tasks

### Network Resources
- **Egress GB**: Outbound data transfer
- **Requests**: HTTP/HTTPS request count via ALB

### Storage Resources
- **Storage GB-Hours**: EBS/EFS volume usage (coming soon)
- **Object Storage**: S3 bucket usage (coming soon)

## Collection Process

1. **Real-time Collection**: Metrics collected every 5 minutes from CloudWatch
2. **Hourly Aggregation**: Usage aggregated hourly for billing
3. **Budget Monitoring**: Automatic alerts at 80% and 100% of budget
4. **Stripe Reporting**: Usage reported to Stripe for billing

## API Endpoints

### Analytics & Reporting

#### GET /api/usage/analytics
Get detailed usage analytics with time series data.

Query parameters:
- `projectId` (optional) - Filter by project
- `startDate` - ISO 8601 date string
- `endDate` - ISO 8601 date string
- `groupBy` - Aggregation level: hour, day, week, month

Example:
```bash
GET /api/usage/analytics?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&groupBy=day
```

#### GET /api/usage/summary
Get usage summary for the current billing period.

Response includes:
- Cost breakdown by project
- Total costs
- Metric totals

#### GET /api/usage/export
Export usage data as CSV or JSON.

Query parameters:
- `startDate` - ISO 8601 date string
- `endDate` - ISO 8601 date string
- `format` - "csv" or "json" (default: json)

### Budget Management

#### GET /api/usage/limits
Get current budget limits and status.

Response:
```json
{
  "defaultLimit": 100,
  "projects": [{
    "projectId": "proj_123",
    "projectName": "My App",
    "budgetLimit": 100,
    "budgetExceeded": false,
    "suspended": false,
    "deployments": 2
  }]
}
```

#### POST /api/usage/limits
Update budget limits for a project.

Request:
```json
{
  "projectId": "proj_123",
  "budgetLimit": 200
}
```

#### GET /api/projects/:projectId/budget
Get real-time budget status for a project.

Response:
```json
{
  "projectId": "proj_123",
  "used": 85.50,
  "limit": 100.00,
  "remaining": 14.50,
  "percentUsed": 85.5,
  "status": "warning",
  "breakdown": {
    "compute": { "cost": "60.00", "cpuHours": "1200" },
    "storage": { "cost": "10.00", "gbHours": "100000" },
    "bandwidth": { "cost": "15.50", "egressGB": "172.22" }
  }
}
```

### Notifications

#### GET /api/usage/notifications
Get usage-related notifications (budget warnings, anomalies).

#### POST /api/usage/notifications/:id/read
Mark a notification as read.

## Budget Alerts

### Warning Threshold (80%)
- In-app notification created
- Email sent to billing contact
- No service impact

### Exceeded Threshold (100%)
- Critical notification created
- Email sent to all team admins
- Services continue running (grace period)
- Manual intervention required

### Suspension Policy
- Services are NOT automatically suspended
- Team must take action to reduce usage
- Contact support for limit increases

## Usage Collection Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   ECS Tasks     │────▶│  CloudWatch  │────▶│   Cygni     │
└─────────────────┘     └──────────────┘     │   Collector │
                                              └──────┬──────┘
                                                     │
                        ┌────────────────────────────┼────────┐
                        ▼                            ▼        ▼
                  ┌──────────┐              ┌─────────────┐  ┌────────┐
                  │ Database │              │   Stripe    │  │ Alerts │
                  └──────────┘              └─────────────┘  └────────┘
```

## Best Practices

1. **Monitor Regularly**: Check usage dashboard weekly
2. **Set Alerts**: Configure budget alerts for early warning
3. **Optimize Resources**: Right-size containers based on usage
4. **Use Auto-scaling**: Let Fargate scale based on demand
5. **Export Monthly**: Keep records for accounting

## Cost Optimization Tips

1. **CPU/Memory**: Use the smallest container size that meets performance needs
2. **Networking**: Use CDN for static assets to reduce egress
3. **Scheduling**: Stop non-production workloads outside business hours
4. **Reserved Capacity**: Contact sales for volume discounts

## Troubleshooting

### Missing Usage Data
- Check ECS service is tagged correctly
- Verify CloudWatch metrics are enabled
- Allow 5-10 minutes for data to appear

### Incorrect Costs
- Usage is calculated from CloudWatch metrics
- Costs update hourly
- Check for multiple deployments

### Budget Exceeded
- Review usage analytics to identify cause
- Scale down unnecessary services
- Contact support for temporary limit increase