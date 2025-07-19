terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

  backend "s3" {
    # Backend configuration should be provided via -backend-config flags or backend.hcl file
    # Example:
    # bucket         = "cygni-terraform-state"
    # key            = "infrastructure/terraform.tfstate"
    # region         = "us-east-1"
    # dynamodb_table = "cygni-terraform-locks"
    # encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "cygni"
      ManagedBy   = "terraform"
    }
  }
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Network Module
module "network" {
  source = "./modules/network"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = data.aws_availability_zones.available.names
  
  # Public subnets for ALB
  public_subnet_cidrs = [
    for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i)
  ]
  
  # Private subnets for EKS nodes
  private_subnet_cidrs = [
    for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 10)
  ]
  
  # Database subnets
  database_subnet_cidrs = [
    for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 20)
  ]

  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = var.environment != "production"
}

# Security Module
module "security" {
  source = "./modules/security"

  environment = var.environment
  vpc_id      = module.network.vpc_id
}

# Database Module (RDS PostgreSQL)
module "database" {
  source = "./modules/database"

  environment             = var.environment
  vpc_id                 = module.network.vpc_id
  database_subnet_ids    = module.network.database_subnet_ids
  allowed_security_groups = [module.compute.node_security_group_id]

  instance_class          = var.rds_instance_class
  allocated_storage       = var.rds_allocated_storage
  storage_encrypted       = true
  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  # High Availability
  multi_az = var.environment == "production"
  
  # Read replica configuration
  create_read_replica = var.environment == "production"
  read_replica_count  = var.environment == "production" ? 1 : 0
}

# Storage Module (S3 for artifacts)
module "storage" {
  source = "./modules/storage"

  environment = var.environment
  
  # Versioning for production
  enable_versioning = var.environment == "production"
  
  # Lifecycle rules
  lifecycle_rules = [
    {
      id      = "delete-old-artifacts"
      enabled = true
      expiration_days = var.environment == "production" ? 90 : 30
    }
  ]
}

# Compute Module (EKS)
module "compute" {
  source = "./modules/compute"

  environment          = var.environment
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  
  cluster_version     = var.eks_cluster_version
  
  # Node groups
  node_groups = {
    main = {
      desired_capacity = var.environment == "production" ? 3 : 2
      min_capacity     = var.environment == "production" ? 3 : 1
      max_capacity     = var.environment == "production" ? 10 : 5
      
      instance_types = [var.eks_node_instance_type]
      
      disk_size = 100
      
      labels = {
        Environment = var.environment
        NodeGroup   = "main"
      }
      
      taints = []
    }
  }

  # Enable IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # Add-ons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }
}

# Configure Kubernetes provider
provider "kubernetes" {
  host                   = module.compute.cluster_endpoint
  cluster_ca_certificate = base64decode(module.compute.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = ["eks", "get-token", "--cluster-name", module.compute.cluster_name]
  }
}

# Configure Helm provider
provider "helm" {
  kubernetes {
    host                   = module.compute.cluster_endpoint
    cluster_ca_certificate = base64decode(module.compute.cluster_certificate_authority_data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = ["eks", "get-token", "--cluster-name", module.compute.cluster_name]
    }
  }
}

# Install cert-manager
resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = "v1.13.0"
  namespace        = "cert-manager"
  create_namespace = true

  set {
    name  = "installCRDs"
    value = "true"
  }

  set {
    name  = "global.leaderElection.namespace"
    value = "cert-manager"
  }
}

# Install ingress-nginx
resource "helm_release" "ingress_nginx" {
  name             = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  version          = "4.8.0"
  namespace        = "ingress-nginx"
  create_namespace = true

  values = [
    yamlencode({
      controller = {
        service = {
          type = "LoadBalancer"
          annotations = {
            "service.beta.kubernetes.io/aws-load-balancer-type" = "nlb"
            "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled" = "true"
          }
        }
        metrics = {
          enabled = true
        }
      }
    })
  ]
}

# Create Cygni namespace
resource "kubernetes_namespace" "cygni" {
  metadata {
    name = "cygni-${var.environment}"
    
    labels = {
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}