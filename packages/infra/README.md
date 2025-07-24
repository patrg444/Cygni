# Cygni Infrastructure

This package contains the AWS CDK infrastructure code for the Cygni staging environment.

## Architecture

The infrastructure includes:

1. **VPC**: A Virtual Private Cloud with public, private, and isolated subnets across 2 availability zones
2. **Database**: Aurora Serverless v2 PostgreSQL database in isolated subnets
3. **Container Registry**: ECR repository for backend Docker images
4. **ECS Fargate**: Serverless container hosting for the backend API
5. **Application Load Balancer**: Public-facing load balancer for the backend
6. **S3 Bucket**: Static website hosting for the frontend
7. **CloudFront**: CDN distribution serving both frontend and backend (via /api/* path)
8. **IAM**: Deployment user with necessary permissions for CI/CD

## Prerequisites

- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Node.js and npm installed

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):
   ```bash
   npm run bootstrap
   ```

## Deployment

1. Synthesize the CloudFormation template:
   ```bash
   npm run synth
   ```

2. Deploy the stack:
   ```bash
   npm run deploy
   ```

3. To deploy with a specific environment name:
   ```bash
   npx cdk deploy -c envName=production
   ```

## Outputs

After deployment, the stack outputs will include:
- VPC ID
- Database endpoint and secret ARN
- ECR repository URI
- ECS cluster and service names
- Load balancer URL
- Frontend bucket name
- CloudFront distribution URL and ID
- Deployment user name

These outputs are used by the Cygni CLI for deployments.

## Cleanup

To destroy all resources:
```bash
npm run destroy
```

**Warning**: This will permanently delete all resources including databases and stored data.

## Cost Optimization

The staging environment is configured for cost optimization:
- Aurora Serverless v2 scales down to 0.5 ACU when idle
- Single NAT gateway (consider removing for dev environments)
- Fargate Spot can be enabled for additional savings
- CloudFront caching reduces backend load

## Security

- Database is in isolated subnets with no internet access
- All traffic to CloudFront is HTTPS
- S3 bucket has public access blocked
- Deployment user has minimal required permissions
- Secrets are stored in AWS Secrets Manager