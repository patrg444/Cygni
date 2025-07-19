terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.4"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
}

# Variables
variable "project_name" {
  description = "Name of the CloudExpress project"
  type        = string
  default     = "cloudexpress"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Primary domain name for CloudExpress"
  type        = string
  default     = "cloudexpress.app"
}

# Provider for us-east-1 (required for CloudFront certificates)
provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"
  
  cluster_name    = "${var.project_name}-${var.environment}"
  region          = var.region
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  
  node_groups = {
    general = {
      desired_capacity = 3
      min_capacity     = 2
      max_capacity     = 10
      instance_types   = ["t3.medium"]
    }
  }
}

# VPC
module "vpc" {
  source = "./modules/vpc"
  
  name               = "${var.project_name}-${var.environment}"
  cidr               = "10.0.0.0/16"
  availability_zones = data.aws_availability_zones.available.names
  
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24"]
}

# RDS PostgreSQL
module "database" {
  source = "./modules/rds"
  
  identifier     = "${var.project_name}-${var.environment}"
  engine_version = "15.3"
  instance_class = "db.t3.micro"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  
  database_name = "cloudexpress"
}

# S3 Buckets
resource "aws_s3_bucket" "storage" {
  bucket = "${var.project_name}-${var.environment}-storage"
}

resource "aws_s3_bucket" "builds" {
  bucket = "${var.project_name}-${var.environment}-builds"
}

# ECR Repositories
resource "aws_ecr_repository" "app_images" {
  name                 = "${var.project_name}/apps"
  image_tag_mutability = "MUTABLE"
  
  image_scanning_configuration {
    scan_on_push = true
  }
}

# Certificates
module "certificates" {
  source = "./modules/certificates"
  
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}", "*.preview.${var.domain_name}"]
  environment               = var.environment
  
  providers = {
    aws.us-east-1 = aws.us-east-1
  }
}

# Outputs
output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "database_endpoint" {
  value = module.database.endpoint
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app_images.repository_url
}