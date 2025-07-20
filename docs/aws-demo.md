# Cygni AWS Demo - Deploy to AWS in 3 Minutes

This guide demonstrates the magic of Cygni's single-command AWS deployment.

## Prerequisites

1. **AWS CLI configured** with credentials:
   ```bash
   aws configure
   ```

2. **Docker installed** and running

3. **Node.js 18+** installed

## Quick Start

### 1. Clone the demo app

```bash
git clone https://github.com/cygni/examples
cd examples/express-demo
```

Or use your own Express/Next.js app!

### 2. Deploy to AWS

```bash
npx @cygni/cli deploy --aws --name my-app
```

That's it! 🚀

## What Happens

In ~3 minutes, Cygni will:

1. **Detect your framework** (Express/Next.js)
2. **Create a Dockerfile** if needed
3. **Build your container** with production optimizations
4. **Push to ECR** (private container registry)
5. **Deploy to Fargate** with auto-scaling
6. **Configure HTTPS** with ACM certificate
7. **Set up health checks** and monitoring
8. **Give you a public URL**: `https://my-app.cx-demo.xyz`

## Demo Features

```bash
# Check deployment status
cx status my-app --aws

# View live logs
cx logs my-app --aws

# Rollback if needed
cx deploy --aws --name my-app --rollback
```

## Architecture

Your app runs on:
- **AWS Fargate**: Serverless containers
- **Application Load Balancer**: HTTPS termination
- **Auto-scaling**: 2-10 instances based on CPU
- **CloudWatch**: Logs and metrics
- **Route53**: DNS management

## Environment Setup (One-Time)

For the demo to work, we need:

1. **Hosted Zone** in Route53 for `cx-demo.xyz`
2. **ACM Certificate** for `*.cx-demo.xyz`

Set these as environment variables:
```bash
export CX_HOSTED_ZONE_ID=Z0123456789ABC
export CX_CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/...
```

## Supported Frameworks

### Express.js
- Auto-detects from `package.json`
- Configures health endpoint
- Optimized Node.js container

### Next.js
- Multi-stage build for smaller images
- Production-ready configuration
- Static asset optimization

## Cost Estimate

For a typical demo app:
- **Fargate**: ~$0.04/hour (2x 0.25 vCPU)
- **ALB**: ~$0.025/hour
- **Data Transfer**: ~$0.09/GB

**Total**: ~$50/month for 24/7 operation

## Troubleshooting

### AWS Credentials Not Found
```bash
aws configure
# Or use environment variables:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

### Docker Not Running
```bash
# macOS
open -a Docker
# Linux
sudo systemctl start docker
```

### Deployment Failed
Check CloudFormation events:
```bash
aws cloudformation describe-stack-events --stack-name cygni-my-app
```

## Next Steps

1. **Custom domain**: Point your domain to the ALB
2. **Database**: Add RDS or DynamoDB
3. **Secrets**: Use `cx secret set` for env vars
4. **CI/CD**: GitHub Actions integration

## Technical Details

The deployment creates:
- VPC with public subnets (or uses default)
- Security groups for ALB and ECS
- ECS cluster with Fargate capacity
- Task definition with your container
- Service with rolling deployments
- Target group with health checks
- CloudWatch log group

All resources are tagged and managed via CloudFormation for easy cleanup:
```bash
aws cloudformation delete-stack --stack-name cygni-my-app
```

## Feedback

This is a demo showcasing Cygni's vision. Production features coming soon:
- Multi-region deployment
- Blue/green deployments
- Custom domains
- Database provisioning
- Observability stack

Try it out and let us know what you think!