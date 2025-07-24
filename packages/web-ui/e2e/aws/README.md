# AWS Live Deployment E2E Test

This test suite deploys the fullstack-demo application to real AWS infrastructure and verifies it works correctly.

## Prerequisites

1. **AWS Account**: You need an active AWS account
2. **AWS CLI**: Install and configure the AWS CLI
   ```bash
   aws configure
   ```
3. **Docker**: Required for building backend images
4. **AWS CDK**: Install the AWS CDK CLI
   ```bash
   npm install -g aws-cdk
   ```

## Running the Test

### Quick Start

Use the provided test runner script that handles all setup:

```bash
./e2e/aws/run-aws-test.sh
```

### Manual Steps

1. **Verify Prerequisites**:
   ```bash
   npm run test:e2e:aws:verify
   ```

2. **Run the Test**:
   ```bash
   npm run test:e2e:aws
   ```

### From Monorepo Root

```bash
cd packages/web-ui
./e2e/aws/run-aws-test.sh
```

## What the Test Does

1. **Phase 1: Infrastructure Deployment**
   - Deploys a complete AWS stack using CDK
   - Creates VPC, Aurora database, ECS cluster, S3 bucket, CloudFront distribution

2. **Phase 2: Application Deployment**
   - Builds the fullstack-demo application
   - Pushes backend Docker image to ECR
   - Deploys backend to ECS Fargate
   - Uploads frontend to S3
   - Configures CloudFront

3. **Phase 3: E2E Testing**
   - Opens the CloudFront URL in a browser
   - Creates a new blog post
   - Verifies the post appears in the list
   - Tests post deletion
   - Checks backend health endpoint

4. **Phase 4: Cleanup**
   - Destroys all AWS resources created during the test

## Cost Considerations

This test creates real AWS resources that incur costs:
- Aurora Serverless v2 (minimum 0.5 ACU)
- ECS Fargate tasks
- NAT Gateway
- CloudFront distribution

The cleanup phase ensures all resources are deleted, but you'll be charged for the time they're running (typically 15-30 minutes).

## Troubleshooting

### AWS Credentials Error
Ensure your AWS CLI is configured:
```bash
aws sts get-caller-identity
```

### Docker Not Found
Install Docker Desktop and ensure it's running.

### CDK Bootstrap Required
If this is your first time using CDK in the region:
```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Test Timeout
The test has a 30-minute timeout. If infrastructure deployment takes longer, you may need to increase the timeout in playwright-aws.config.ts.

### Manual Cleanup
If the test fails and doesn't clean up properly, manually destroy the stack:
```bash
cd packages/infra
npx cdk destroy CygniE2ETest-* --force
```

## Environment Variables

Optional environment variables:
- `AWS_REGION`: Deployment region (default: us-east-1)
- `STACK_NAME`: Override the generated stack name