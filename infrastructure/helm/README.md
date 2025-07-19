# Cygni Helm Charts

This directory contains Helm charts for deploying Cygni on Kubernetes.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.10+
- cert-manager (for TLS certificates)
- NGINX Ingress Controller (or compatible)

## Installation

### Add Helm repositories

```bash
# Add Bitnami repo for PostgreSQL and Redis
helm repo add bitnami https://charts.bitnami.com/bitnami

# Add MinIO repo
helm repo add minio https://charts.min.io/

# Update repos
helm repo update
```

### Install the chart

```bash
# Install with default values
helm install cygni ./cygni

# Install with custom values
helm install cygni ./cygni -f my-values.yaml

# Install in a specific namespace
helm install cygni ./cygni -n cygni --create-namespace
```

## Configuration

The following table lists the configurable parameters and their default values.

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Global Docker image registry | `""` |
| `global.imagePullSecrets` | Global Docker registry secret names | `[]` |
| `global.storageClass` | Global storage class for PVCs | `""` |

### API Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `api.enabled` | Enable API service | `true` |
| `api.replicaCount` | Number of API replicas | `2` |
| `api.image.repository` | API image repository | `cygni/api` |
| `api.image.tag` | API image tag | `""` (uses Chart appVersion) |
| `api.service.type` | Kubernetes service type | `ClusterIP` |
| `api.service.port` | Service port | `3000` |
| `api.ingress.enabled` | Enable ingress | `false` |
| `api.ingress.hosts[0].host` | Hostname for ingress | `api.cygni.dev` |
| `api.resources.requests.cpu` | CPU request | `100m` |
| `api.resources.requests.memory` | Memory request | `256Mi` |

### Database (PostgreSQL)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `postgresql.auth.database` | Database name | `cygni` |
| `postgresql.auth.username` | Database username | `cygni` |
| `postgresql.primary.persistence.size` | PVC size | `10Gi` |

### Cache (Redis)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.enabled` | Deploy Redis | `true` |
| `redis.architecture` | Redis architecture | `standalone` |
| `redis.auth.enabled` | Enable Redis auth | `true` |
| `redis.master.persistence.size` | PVC size | `8Gi` |

### Object Storage (MinIO)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `minio.enabled` | Deploy MinIO | `true` |
| `minio.mode` | MinIO mode | `standalone` |
| `minio.persistence.size` | PVC size | `20Gi` |

## Production Deployment

For production deployments, create a custom values file:

```yaml
# prod-values.yaml
global:
  storageClass: "fast-ssd"

api:
  replicaCount: 3
  
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
  
  ingress:
    enabled: true
    className: nginx
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    hosts:
      - host: api.cygni.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: api-cygni-tls
        hosts:
          - api.cygni.com

postgresql:
  primary:
    persistence:
      size: 100Gi
    resources:
      requests:
        cpu: 1000m
        memory: 2Gi

redis:
  master:
    persistence:
      size: 50Gi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
```

Then install:

```bash
helm install cygni ./cygni -f prod-values.yaml -n production
```

## Monitoring

The chart includes Prometheus monitoring support:

1. ServiceMonitor for metrics collection
2. PrometheusRule for alerts
3. Grafana dashboards (in future releases)

## Backup and Restore

Enable automated backups:

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"
  s3:
    bucket: cygni-backups
    region: us-east-1
```

## Upgrading

```bash
# Upgrade to a new version
helm upgrade cygni ./cygni

# Upgrade with new values
helm upgrade cygni ./cygni -f my-values.yaml

# Check upgrade history
helm history cygni
```

## Uninstalling

```bash
# Uninstall the release
helm uninstall cygni

# Uninstall and purge PVCs
helm uninstall cygni
kubectl delete pvc -l app.kubernetes.io/instance=cygni
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -l app.kubernetes.io/instance=cygni
```

### View logs
```bash
kubectl logs -l app.kubernetes.io/name=cygni,app.kubernetes.io/component=api
```

### Describe resources
```bash
kubectl describe deployment cygni-api
```

## Development

### Lint the chart
```bash
helm lint ./cygni
```

### Dry run installation
```bash
helm install cygni ./cygni --dry-run --debug
```

### Generate templates
```bash
helm template cygni ./cygni
```