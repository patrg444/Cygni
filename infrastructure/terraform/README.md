# Cygni Infrastructure as Code

This directory contains Terraform configurations for deploying Cygni infrastructure on AWS.

## Architecture

The infrastructure includes:

- **Network**: VPC with public/private subnets across multiple AZs
- **Database**: RDS PostgreSQL with optional read replicas
- **Compute**: EKS cluster for running Cygni services (placeholder)
- **Storage**: S3 buckets for build artifacts
- **Security**: KMS encryption, security groups, and monitoring

## Prerequisites

- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- kubectl (for EKS cluster access)

## Usage

### 1. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 2. Create S3 bucket for state (first time only)

```bash
aws s3 mb s3://cygni-terraform-state-<account-id>
aws dynamodb create-table \
  --table-name cygni-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### 3. Configure backend

Create `backend.hcl`:

```hcl
bucket         = "cygni-terraform-state-<account-id>"
key            = "infrastructure/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "cygni-terraform-locks"
encrypt        = true
```

### 4. Deploy infrastructure

For development:
```bash
terraform plan -var-file=environments/development.tfvars
terraform apply -var-file=environments/development.tfvars
```

For production:
```bash
terraform plan -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

## Module Structure

- `modules/network/`: VPC, subnets, NAT gateways
- `modules/database/`: RDS PostgreSQL instances
- `modules/compute/`: EKS cluster (placeholder)
- `modules/storage/`: S3 buckets
- `modules/security/`: KMS keys, security baseline

## Environment Variables

Each environment has its own `.tfvars` file with environment-specific settings:

- `development.tfvars`: Cost-optimized settings
- `production.tfvars`: High availability and performance

## Outputs

After deployment, retrieve important values:

```bash
# Get all outputs
terraform output

# Get specific output
terraform output rds_endpoint
terraform output eks_cluster_name
```

## Security Notes

- Database passwords are automatically generated and stored in AWS SSM Parameter Store
- All data is encrypted at rest using AWS KMS
- Network traffic is restricted using security groups
- VPC flow logs are enabled for audit purposes

## Cost Optimization

Development environment uses:
- Smaller instance types
- Single NAT gateway
- Shorter backup retention
- No read replicas

Production environment includes:
- Multi-AZ RDS deployment
- Read replicas
- Enhanced monitoring
- GuardDuty and Security Hub (security module)

## Destroy Infrastructure

To tear down the infrastructure:

```bash
terraform destroy -var-file=environments/<environment>.tfvars
```

**Warning**: This will delete all resources including databases. Make sure to backup any important data first.