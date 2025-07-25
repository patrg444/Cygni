# Cost Estimation for Deployments

The Cygni CLI now includes deployment cost analysis to help you understand the financial impact of your changes before deploying.

## Features

### Automatic Cost Analysis
When you run `cx deploy`, the CLI will automatically:
- Calculate current deployment costs based on existing infrastructure
- Estimate costs for the new deployment configuration
- Show a detailed breakdown of cost changes
- Prompt for confirmation if costs increase significantly (>20% and >$10/month)

### Cost Breakdown
The analysis includes:
- **ECS Tasks**: CPU and memory costs based on Fargate pricing
- **Load Balancer**: Application Load Balancer hourly costs
- **Data Transfer**: Estimated egress costs based on task count
- **Storage**: EBS storage costs for container volumes

### Command Options

```bash
# Show cost analysis without deploying
cx deploy --dry-run

# Skip cost analysis (useful for CI/CD)
cx deploy --skip-cost-check

# Regular deployment with cost analysis
cx deploy
```

## Example Output

```bash
$ cx deploy
Analyzing deployment cost impact...

Deployment Cost Analysis
──────────────────────────────────────────────────

Current monthly cost: $50.20
  - ECS Tasks (2x 1vCPU, 2GB): $30.00
  - Load Balancer: $10.00
  - Data Transfer: $10.20

After deployment: $100.40
  - ECS Tasks (2x 2vCPU, 4GB): $60.00  ↑ 100%
  - Load Balancer: $10.00
  - Data Transfer: $30.40  ↑ 200%

Total increase: +$50.20/month (+100%)

Deploy with these cost changes? (y/N)
```

## Cost Calculation Details

### Pricing Sources
- Uses AWS Pricing API for real-time pricing data
- Caches pricing information for 15 minutes to avoid API rate limits
- Falls back to default pricing if API is unavailable

### Assumptions
- **Data Transfer**: Estimates 100GB per task per month
- **Storage**: Assumes 20GB EBS storage per task
- **Region**: Uses configured AWS region for pricing calculations

### Limitations
- Simplified pricing model (doesn't include all AWS charges)
- Spot instance pricing not yet supported
- Multi-region deployments show aggregate costs

## CI/CD Integration

For automated deployments, use the `--skip-cost-check` flag:

```bash
cx deploy --skip-cost-check
```

This bypasses the cost analysis and confirmation prompt, suitable for:
- Continuous deployment pipelines
- Automated rollouts
- Scheduled deployments

## Troubleshooting

### Cost analysis fails
If cost analysis fails, the deployment will continue with a warning. Common causes:
- Missing AWS pricing permissions
- Network connectivity issues
- Invalid task definition

To debug cost analysis issues, set the DEBUG environment variable:
```bash
DEBUG=1 cx deploy
```

### Inaccurate estimates
Cost estimates are based on:
- Current AWS pricing (may vary by region)
- Simplified usage patterns
- Standard on-demand pricing

For more accurate cost tracking, use AWS Cost Explorer or billing alerts.