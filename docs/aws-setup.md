# AWS Setup Guide for Cygni

This guide outlines the AWS resources and IAM permissions required to run Cygni in production.

## Required AWS Services

1. **Amazon ECS (Elastic Container Service)** - For running containers
2. **Amazon ECR (Elastic Container Registry)** - For storing Docker images
3. **Amazon RDS (PostgreSQL)** - For the database
4. **Amazon ElastiCache (Redis)** - For queuing and caching
5. **Amazon S3** - For build artifacts and logs
6. **Amazon CloudWatch** - For logs and monitoring
7. **AWS Fargate** - For serverless container execution
8. **Amazon ALB (Application Load Balancer)** - For load balancing

## IAM Permissions Required

### For the Builder Service

Create an IAM role with the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::cygni-build-artifacts",
        "arn:aws:s3:::cygni-build-artifacts/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### For the API Service (Deployment)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:CreateService",
        "ecs:UpdateService",
        "ecs:DeleteService",
        "ecs:DescribeServices",
        "ecs:RegisterTaskDefinition",
        "ecs:DeregisterTaskDefinition",
        "ecs:DescribeTaskDefinition",
        "ecs:RunTask",
        "ecs:StopTask",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": "arn:aws:iam::*:role/cygni-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:CreateTargetGroup",
        "elasticloadbalancing:DeleteTargetGroup",
        "elasticloadbalancing:CreateRule",
        "elasticloadbalancing:DeleteRule",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeRules"
      ],
      "Resource": "*"
    }
  ]
}
```

## Environment Variables Setup

### For Local Development

Copy the provided `.env` file and update as needed:

```bash
cp .env.example .env
```

### For Production

1. **AWS Credentials**: Use IAM roles attached to your ECS tasks instead of keys
2. **Database**: Use RDS connection string with SSL
3. **Redis**: Use ElastiCache endpoint
4. **Secrets**: Use AWS Secrets Manager or Parameter Store

### Required Secrets in AWS Secrets Manager

Create the following secrets:

```bash
# Database credentials
aws secretsmanager create-secret \
  --name cygni/production/database \
  --secret-string '{"username":"cygni","password":"YOUR_SECURE_PASSWORD"}'

# JWT Secret
aws secretsmanager create-secret \
  --name cygni/production/jwt \
  --secret-string '{"secret":"YOUR_VERY_LONG_RANDOM_STRING"}'

# Internal API Secret
aws secretsmanager create-secret \
  --name cygni/production/internal-api \
  --secret-string '{"secret":"YOUR_INTERNAL_API_SECRET"}'
```

## Infrastructure Setup Commands

### 1. Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name cygni-builds \
  --region us-east-1
```

### 2. Create S3 Bucket

```bash
aws s3api create-bucket \
  --bucket cygni-build-artifacts \
  --region us-east-1
```

### 3. Create RDS Instance

```bash
aws rds create-db-instance \
  --db-instance-identifier cygni-production \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15 \
  --master-username cygni \
  --master-user-password YOUR_SECURE_PASSWORD \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxxx \
  --db-subnet-group-name your-subnet-group
```

### 4. Create ElastiCache Redis Cluster

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id cygni-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxxxxx \
  --cache-subnet-group-name your-subnet-group
```

## Testing AWS Access

Run this script to verify your AWS credentials are set up correctly:

```bash
#!/bin/bash
echo "Testing AWS access..."

# Test S3
aws s3 ls >/dev/null 2>&1 && echo "✓ S3 access OK" || echo "✗ S3 access failed"

# Test ECR
aws ecr get-login-password --region us-east-1 >/dev/null 2>&1 && echo "✓ ECR access OK" || echo "✗ ECR access failed"

# Test ECS
aws ecs list-clusters >/dev/null 2>&1 && echo "✓ ECS access OK" || echo "✗ ECS access failed"

# Test current identity
echo -e "\nCurrent AWS identity:"
aws sts get-caller-identity
```

## Next Steps

1. Set up your AWS credentials locally
2. Create the required AWS resources
3. Update your `.env` file with the actual endpoints
4. Run the smoke tests to verify everything is working
5. Deploy to production using the provided scripts
