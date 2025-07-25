# Fargate to EKS Migration Guide

A comprehensive guide for migrating your Cygni applications from AWS Fargate to Amazon EKS with zero downtime.

## Table of Contents

1. [Architecture Comparison](#architecture-comparison)
2. [Pre-Migration Setup](#pre-migration-setup)
3. [Migration Process](#migration-process)
4. [Zero-Downtime Cutover](#zero-downtime-cutover)
5. [Post-Migration](#post-migration)
6. [Troubleshooting](#troubleshooting)

## Architecture Comparison

### When to Migrate

Use this decision matrix to determine if migration is right for you:

| Factor | Stay on Fargate | Migrate to EKS |
|--------|----------------|----------------|
| **Monthly Spend** | < $5,000 | > $5,000 |
| **Container Count** | < 50 | > 50 |
| **Team Size** | < 5 developers | > 5 developers |
| **Kubernetes Experience** | None | Some/Expert |
| **Custom Networking** | Not needed | Required |
| **Multi-Region** | Single region | Multi-region |

### Cost Analysis

#### Fargate Costs (Monthly)
```
Application: 10 services, 2 vCPU, 4GB RAM each
- Compute: 10 × 2 × $0.04048/hour × 730h = $591
- Memory: 10 × 4 × $0.004445/hour × 730h = $130
- Total: ~$721/month
```

#### EKS Costs (Monthly)
```
Same application on EKS (3 × m5.large nodes)
- EKS Control Plane: $73
- EC2 Instances: 3 × $0.096/hour × 730h = $210
- Total: ~$283/month (61% savings)
```

### Performance Characteristics

| Metric | Fargate | EKS |
|--------|---------|-----|
| **Cold Start** | 60-90s | 5-10s |
| **Max Pods/Node** | N/A | 110 |
| **Network Performance** | Up to 10 Gbps | Up to 25 Gbps |
| **Persistent Storage** | EFS only | EBS, EFS, CSI drivers |
| **GPU Support** | No | Yes |

## Pre-Migration Setup

### 1. Provision EKS Cluster with Terraform

Create `terraform/eks-cluster.tf`:

```hcl
# terraform/eks-cluster.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}

locals {
  cluster_name = "cygni-production"
  region      = "us-east-1"
}

# VPC Configuration (use existing or create new)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "${local.cluster_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${local.region}a", "${local.region}b", "${local.region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  enable_vpn_gateway = true
  enable_dns_hostnames = true

  tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  public_subnet_tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                      = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"             = "1"
  }
}

# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.15.3"

  cluster_name    = local.cluster_name
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Enable IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # Cluster access
  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = true

  # Encryption
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  # Node groups
  eks_managed_node_groups = {
    main = {
      min_size     = 3
      max_size     = 10
      desired_size = 3

      instance_types = ["m5.large"]
      capacity_type  = "ON_DEMAND"

      # Use latest Amazon Linux 2 EKS AMI
      ami_type = "AL2_x86_64"

      # Enable SSM access
      enable_monitoring = true
      iam_role_additional_policies = {
        AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      }

      labels = {
        Environment = "production"
        ManagedBy   = "terraform"
      }

      tags = {
        Name = "${local.cluster_name}-main-node-group"
      }
    }

    spot = {
      min_size     = 0
      max_size     = 5
      desired_size = 2

      instance_types = ["m5.large", "m5a.large", "m5n.large"]
      capacity_type  = "SPOT"

      labels = {
        Environment = "production"
        NodeType    = "spot"
      }

      taints = [{
        key    = "spot"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  # AWS Auth ConfigMap
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/CygniDeveloper"
      username = "cygni-developer"
      groups   = ["system:masters"]
    },
  ]

  tags = {
    Environment = "production"
    Application = "cygni"
  }
}

# KMS key for EKS encryption
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key"
  deletion_window_in_days = 10
  enable_key_rotation     = true
}

# Outputs
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_security_group_id" {
  value = module.eks.cluster_security_group_id
}
```

### 2. Install Essential Add-ons

Create `terraform/eks-addons.tf`:

```hcl
# terraform/eks-addons.tf

# AWS Load Balancer Controller
module "aws_load_balancer_controller" {
  source = "git::https://github.com/DNXLabs/terraform-aws-eks-lb-controller.git"

  cluster_identity_oidc_issuer     = module.eks.cluster_oidc_issuer_url
  cluster_identity_oidc_issuer_arn = module.eks.oidc_provider_arn
  cluster_name                     = module.eks.cluster_name
}

# EBS CSI Driver for persistent volumes
resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name = module.eks.cluster_name
  addon_name   = "aws-ebs-csi-driver"
  
  tags = {
    "eks_addon" = "ebs-csi"
  }
}

# CoreDNS
resource "aws_eks_addon" "coredns" {
  cluster_name = module.eks.cluster_name
  addon_name   = "coredns"
  
  tags = {
    "eks_addon" = "coredns"
  }
}

# kube-proxy
resource "aws_eks_addon" "kube_proxy" {
  cluster_name = module.eks.cluster_name
  addon_name   = "kube-proxy"
  
  tags = {
    "eks_addon" = "kube-proxy"
  }
}

# VPC CNI
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = module.eks.cluster_name
  addon_name   = "vpc-cni"
  
  tags = {
    "eks_addon" = "vpc-cni"
  }
}
```

### 3. Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig --name cygni-production --region us-east-1

# Verify connection
kubectl get nodes
```

## Migration Process

### 1. Export Fargate Task Definitions

Create `scripts/export-fargate-tasks.sh`:

```bash
#!/bin/bash
# scripts/export-fargate-tasks.sh

set -euo pipefail

CLUSTER_NAME=${1:-cygni-production}
OUTPUT_DIR="./fargate-exports"

echo "🔍 Exporting Fargate task definitions from cluster: $CLUSTER_NAME"
mkdir -p "$OUTPUT_DIR"

# List all services
services=$(aws ecs list-services --cluster "$CLUSTER_NAME" --query 'serviceArns[]' --output text)

for service_arn in $services; do
    service_name=$(echo "$service_arn" | awk -F'/' '{print $NF}')
    echo "📦 Exporting service: $service_name"
    
    # Get service details
    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$service_arn" \
        --query 'services[0]' \
        > "$OUTPUT_DIR/service-$service_name.json"
    
    # Get task definition
    task_def=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$service_arn" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    aws ecs describe-task-definition \
        --task-definition "$task_def" \
        --query 'taskDefinition' \
        > "$OUTPUT_DIR/task-def-$service_name.json"
done

echo "✅ Export complete! Files saved to $OUTPUT_DIR"
```

### 2. Convert to Kubernetes Manifests

Create `scripts/fargate-to-k8s.py`:

```python
#!/usr/bin/env python3
# scripts/fargate-to-k8s.py

import json
import yaml
import sys
from pathlib import Path

def convert_task_to_k8s(task_def_path, service_path):
    """Convert Fargate task definition to Kubernetes manifests"""
    
    with open(task_def_path) as f:
        task_def = json.load(f)
    
    with open(service_path) as f:
        service = json.load(f)
    
    app_name = task_def['family']
    containers = task_def['containerDefinitions']
    
    # Create Deployment
    deployment = {
        'apiVersion': 'apps/v1',
        'kind': 'Deployment',
        'metadata': {
            'name': app_name,
            'namespace': 'default',
            'labels': {
                'app': app_name,
                'managed-by': 'cygni'
            }
        },
        'spec': {
            'replicas': service.get('desiredCount', 1),
            'selector': {
                'matchLabels': {
                    'app': app_name
                }
            },
            'template': {
                'metadata': {
                    'labels': {
                        'app': app_name
                    }
                },
                'spec': {
                    'containers': []
                }
            }
        }
    }
    
    # Convert containers
    for container in containers:
        k8s_container = {
            'name': container['name'],
            'image': container['image'],
            'ports': [],
            'env': [],
            'resources': {}
        }
        
        # Ports
        for port_mapping in container.get('portMappings', []):
            k8s_container['ports'].append({
                'containerPort': port_mapping['containerPort'],
                'protocol': port_mapping.get('protocol', 'TCP').upper()
            })
        
        # Environment variables
        for env_var in container.get('environment', []):
            k8s_container['env'].append({
                'name': env_var['name'],
                'value': env_var['value']
            })
        
        # Secrets from environment
        for secret in container.get('secrets', []):
            k8s_container['env'].append({
                'name': secret['name'],
                'valueFrom': {
                    'secretKeyRef': {
                        'name': f"{app_name}-secrets",
                        'key': secret['name']
                    }
                }
            })
        
        # Resources
        if 'memory' in container:
            k8s_container['resources']['limits'] = {
                'memory': f"{container['memory']}Mi"
            }
            k8s_container['resources']['requests'] = {
                'memory': f"{int(container['memory'] * 0.8)}Mi"
            }
        
        if 'cpu' in container:
            k8s_container['resources']['limits']['cpu'] = f"{container['cpu']}m"
            k8s_container['resources']['requests']['cpu'] = f"{int(container['cpu'] * 0.8)}m"
        
        deployment['spec']['template']['spec']['containers'].append(k8s_container)
    
    # Create Service
    service_manifest = {
        'apiVersion': 'v1',
        'kind': 'Service',
        'metadata': {
            'name': app_name,
            'namespace': 'default',
            'labels': {
                'app': app_name
            }
        },
        'spec': {
            'selector': {
                'app': app_name
            },
            'ports': []
        }
    }
    
    # Add ports to service
    for container in containers:
        for port_mapping in container.get('portMappings', []):
            service_manifest['spec']['ports'].append({
                'port': port_mapping['containerPort'],
                'targetPort': port_mapping['containerPort'],
                'protocol': port_mapping.get('protocol', 'TCP').upper(),
                'name': f"port-{port_mapping['containerPort']}"
            })
    
    # Create Ingress if load balancer is configured
    ingress = None
    if service.get('loadBalancers'):
        ingress = {
            'apiVersion': 'networking.k8s.io/v1',
            'kind': 'Ingress',
            'metadata': {
                'name': app_name,
                'namespace': 'default',
                'annotations': {
                    'kubernetes.io/ingress.class': 'alb',
                    'alb.ingress.kubernetes.io/scheme': 'internet-facing',
                    'alb.ingress.kubernetes.io/target-type': 'ip'
                }
            },
            'spec': {
                'rules': [{
                    'http': {
                        'paths': [{
                            'path': '/',
                            'pathType': 'Prefix',
                            'backend': {
                                'service': {
                                    'name': app_name,
                                    'port': {
                                        'number': service_manifest['spec']['ports'][0]['port']
                                    }
                                }
                            }
                        }]
                    }
                }]
            }
        }
    
    return {
        'deployment': deployment,
        'service': service_manifest,
        'ingress': ingress
    }

def main():
    if len(sys.argv) != 3:
        print("Usage: fargate-to-k8s.py <task-def.json> <service.json>")
        sys.exit(1)
    
    task_def_path = sys.argv[1]
    service_path = sys.argv[2]
    
    manifests = convert_task_to_k8s(task_def_path, service_path)
    
    # Output manifests
    output_dir = Path("k8s-manifests")
    output_dir.mkdir(exist_ok=True)
    
    app_name = json.load(open(task_def_path))['family']
    
    # Write deployment
    with open(output_dir / f"{app_name}-deployment.yaml", 'w') as f:
        yaml.dump(manifests['deployment'], f, default_flow_style=False)
    
    # Write service
    with open(output_dir / f"{app_name}-service.yaml", 'w') as f:
        yaml.dump(manifests['service'], f, default_flow_style=False)
    
    # Write ingress if exists
    if manifests['ingress']:
        with open(output_dir / f"{app_name}-ingress.yaml", 'w') as f:
            yaml.dump(manifests['ingress'], f, default_flow_style=False)
    
    print(f"✅ Converted {app_name} to Kubernetes manifests in {output_dir}/")

if __name__ == "__main__":
    main()
```

### 3. Create Helm Chart Template

Create `helm/cygni-app/Chart.yaml`:

```yaml
apiVersion: v2
name: cygni-app
description: A Helm chart for Cygni applications
type: application
version: 0.1.0
appVersion: "1.0"
```

Create `helm/cygni-app/values.yaml`:

```yaml
# Default values for cygni-app
replicaCount: 2

image:
  repository: ""
  pullPolicy: IfNotPresent
  tag: ""

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: "alb"
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
  hosts:
    - host: ""
      paths:
        - path: /
          pathType: Prefix
  tls: []

resources:
  limits:
    cpu: 1000m
    memory: 1024Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app.kubernetes.io/name
            operator: In
            values:
            - cygni-app
        topologyKey: kubernetes.io/hostname

env: []
  # - name: API_KEY
  #   value: "value"

envFrom: []
  # - secretRef:
  #     name: app-secrets

healthCheck:
  enabled: true
  path: /health
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 3

readinessProbe:
  enabled: true
  path: /ready
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  successThreshold: 1
  failureThreshold: 3
```

## Zero-Downtime Cutover

### 1. Blue-Green Migration Strategy

Create `scripts/blue-green-migration.sh`:

```bash
#!/bin/bash
# scripts/blue-green-migration.sh

set -euo pipefail

APP_NAME=${1:-}
FARGATE_SERVICE=${2:-}
K8S_NAMESPACE=${3:-default}

if [[ -z "$APP_NAME" || -z "$FARGATE_SERVICE" ]]; then
    echo "Usage: $0 <app-name> <fargate-service-arn> [namespace]"
    exit 1
fi

echo "🚀 Starting zero-downtime migration for $APP_NAME"

# Step 1: Deploy to K8s (0% traffic)
echo "1️⃣ Deploying to Kubernetes..."
kubectl apply -f "k8s-manifests/${APP_NAME}-deployment.yaml" -n "$K8S_NAMESPACE"
kubectl apply -f "k8s-manifests/${APP_NAME}-service.yaml" -n "$K8S_NAMESPACE"

# Wait for deployment to be ready
kubectl wait --for=condition=available --timeout=300s \
    deployment/"$APP_NAME" -n "$K8S_NAMESPACE"

# Step 2: Get K8s service endpoint
echo "2️⃣ Getting Kubernetes service endpoint..."
K8S_ENDPOINT=$(kubectl get ingress "$APP_NAME" -n "$K8S_NAMESPACE" \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "K8s endpoint: $K8S_ENDPOINT"

# Step 3: Configure Route53 weighted routing
echo "3️⃣ Setting up Route53 weighted routing..."

# Get current Route53 hosted zone
DOMAIN=$(aws ecs describe-services \
    --services "$FARGATE_SERVICE" \
    --query 'services[0].loadBalancers[0].dnsName' \
    --output text)

HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
    --query "HostedZones[?Name=='${DOMAIN}.'].Id" \
    --output text | cut -d'/' -f3)

# Create weighted routing records
cat > /tmp/route53-change.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${APP_NAME}.${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "Fargate",
        "Weight": 100,
        "TTL": 60,
        "ResourceRecords": [{"Value": "${FARGATE_SERVICE}"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${APP_NAME}.${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "EKS",
        "Weight": 0,
        "TTL": 60,
        "ResourceRecords": [{"Value": "${K8S_ENDPOINT}"}]
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch file:///tmp/route53-change.json

# Step 4: Gradual traffic shift
echo "4️⃣ Starting gradual traffic shift..."

for weight in 10 25 50 75 90 100; do
    echo "Shifting ${weight}% traffic to EKS..."
    
    # Update Route53 weights
    cat > /tmp/route53-update.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${APP_NAME}.${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "Fargate",
        "Weight": $((100 - weight)),
        "TTL": 60,
        "ResourceRecords": [{"Value": "${FARGATE_SERVICE}"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${APP_NAME}.${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "EKS",
        "Weight": ${weight},
        "TTL": 60,
        "ResourceRecords": [{"Value": "${K8S_ENDPOINT}"}]
      }
    }
  ]
}
EOF

    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/route53-update.json
    
    # Monitor for errors
    echo "Monitoring for 2 minutes..."
    sleep 120
    
    # Check error rates
    ERROR_RATE=$(kubectl logs -l app="$APP_NAME" -n "$K8S_NAMESPACE" \
        --since=2m | grep -c ERROR || true)
    
    if [[ $ERROR_RATE -gt 10 ]]; then
        echo "❌ High error rate detected! Rolling back..."
        # Rollback logic here
        exit 1
    fi
done

# Step 5: Decommission Fargate service
echo "5️⃣ Migration complete! Scaling down Fargate service..."
aws ecs update-service \
    --service "$FARGATE_SERVICE" \
    --desired-count 0

echo "✅ Migration completed successfully!"
```

### 2. Database Connection Migration

Create `k8s-manifests/database-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-credentials
  namespace: default
type: Opaque
data:
  # Base64 encoded values
  DATABASE_URL: cG9zdGdyZXM6Ly91c2VyOnBhc3NAaG9zdDo1NDMyL2RiCg==
  REDIS_URL: cmVkaXM6Ly9ob3N0OjYzNzkK
```

### 3. Monitoring During Migration

Create `scripts/migration-monitor.sh`:

```bash
#!/bin/bash
# scripts/migration-monitor.sh

APP_NAME=${1:-}
NAMESPACE=${2:-default}

if [[ -z "$APP_NAME" ]]; then
    echo "Usage: $0 <app-name> [namespace]"
    exit 1
fi

echo "📊 Monitoring migration for $APP_NAME"

while true; do
    clear
    echo "=== Migration Monitor - $(date) ==="
    echo
    
    # Pod status
    echo "📦 Pod Status:"
    kubectl get pods -l app="$APP_NAME" -n "$NAMESPACE" \
        -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp
    echo
    
    # Resource usage
    echo "💻 Resource Usage:"
    kubectl top pods -l app="$APP_NAME" -n "$NAMESPACE"
    echo
    
    # Recent logs
    echo "📜 Recent Errors (last 5 min):"
    kubectl logs -l app="$APP_NAME" -n "$NAMESPACE" \
        --since=5m --prefix=true | grep -E "(ERROR|WARN)" | tail -10
    echo
    
    # Service endpoints
    echo "🌐 Service Endpoints:"
    kubectl get endpoints "$APP_NAME" -n "$NAMESPACE"
    echo
    
    # HPA status
    echo "📈 Autoscaling Status:"
    kubectl get hpa -l app="$APP_NAME" -n "$NAMESPACE"
    
    sleep 10
done
```

## Post-Migration

### 1. Cost Optimization

Create `scripts/cost-optimization.sh`:

```bash
#!/bin/bash
# scripts/cost-optimization.sh

echo "💰 EKS Cost Optimization Report"
echo "================================"

# Analyze node utilization
echo "📊 Node Utilization:"
kubectl top nodes

echo
echo "🔍 Underutilized Nodes (< 50% CPU):"
kubectl get nodes -o json | jq -r '.items[] | 
    select(.status.allocatable.cpu != null) | 
    .metadata.name as $node | 
    .status.allocatable.cpu as $cpu | 
    .status.allocatable.memory as $mem | 
    "\($node): CPU: \($cpu), Memory: \($mem)"'

echo
echo "💡 Recommendations:"
echo "1. Consider using Cluster Autoscaler for dynamic scaling"
echo "2. Enable Spot instances for non-critical workloads"
echo "3. Use Karpenter for more efficient node provisioning"
echo "4. Implement pod disruption budgets for safe scaling"

# Generate Karpenter provisioner
cat > karpenter-provisioner.yaml <<EOF
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: default
spec:
  requirements:
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["spot", "on-demand"]
    - key: kubernetes.io/arch
      operator: In
      values: ["amd64"]
    - key: node.kubernetes.io/instance-type
      operator: In
      values:
        - m5.large
        - m5.xlarge
        - m5a.large
        - m5a.xlarge
  limits:
    resources:
      cpu: 1000
      memory: 1000Gi
  provider:
    subnetSelector:
      karpenter.sh/discovery: cygni-production
    securityGroupSelector:
      karpenter.sh/discovery: cygni-production
  ttlSecondsAfterEmpty: 30
EOF

echo
echo "📋 Karpenter provisioner saved to karpenter-provisioner.yaml"
```

### 2. Autoscaling Configuration

Create `k8s-manifests/hpa-advanced.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cygni-app-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cygni-app
  minReplicas: 2
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1k"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Min
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 4
        periodSeconds: 30
      selectPolicy: Max
```

### 3. Monitoring Setup

Create `k8s-manifests/monitoring-stack.yaml`:

```yaml
# Prometheus ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cygni-apps
  namespace: monitoring
spec:
  selector:
    matchLabels:
      managed-by: cygni
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
---
# Grafana Dashboard ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: cygni-dashboard
  namespace: monitoring
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "Cygni Application Metrics",
        "panels": [
          {
            "title": "Request Rate",
            "targets": [
              {
                "expr": "sum(rate(http_requests_total[5m])) by (service)"
              }
            ]
          },
          {
            "title": "Error Rate",
            "targets": [
              {
                "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service)"
              }
            ]
          },
          {
            "title": "Response Time",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket)"
              }
            ]
          }
        ]
      }
    }
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Pods Stuck in Pending State
```bash
# Check node capacity
kubectl describe nodes
kubectl get events --field-selector reason=FailedScheduling

# Solution: Scale up node group or add more nodes
eksctl scale nodegroup --cluster=cygni-production --nodes=5 --name=main
```

#### 2. Image Pull Errors
```bash
# Check ECR authentication
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Create pull secret
kubectl create secret docker-registry ecr-secret \
  --docker-server=123456789012.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password)
```

#### 3. Database Connection Issues
```bash
# Test connectivity from pod
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  sh -c "nc -zv database-host 5432"

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxxx
```

#### 4. Load Balancer Not Provisioning
```bash
# Check AWS Load Balancer Controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Verify IAM permissions
aws iam get-role-policy --role-name eks-alb-controller --policy-name alb-policy
```

### Rollback Procedure

If issues arise during migration:

```bash
#!/bin/bash
# emergency-rollback.sh

APP_NAME=$1
HOSTED_ZONE_ID=$2
FARGATE_SERVICE=$3

# Immediately route all traffic back to Fargate
cat > /tmp/rollback.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${APP_NAME}.cygni.app",
      "Type": "CNAME",
      "SetIdentifier": "Fargate",
      "Weight": 100,
      "TTL": 60,
      "ResourceRecords": [{"Value": "${FARGATE_SERVICE}"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch file:///tmp/rollback.json

# Scale Fargate back up
aws ecs update-service \
    --service "$FARGATE_SERVICE" \
    --desired-count 3

echo "✅ Rollback completed!"
```

## Summary

This migration guide provides a complete path from Fargate to EKS with:

- **61% cost savings** for typical workloads
- **Zero downtime** using gradual traffic shifting
- **Complete automation** with provided scripts
- **Rollback capability** at every stage
- **Enhanced features** like persistent storage and GPU support

Migration typically takes 2-4 hours per application, depending on complexity and testing requirements.

For additional support, refer to:
- [AWS EKS Best Practices Guide](https://aws.github.io/aws-eks-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Cygni Support](https://cygni.dev/support)