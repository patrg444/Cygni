#!/bin/bash
set -e

echo "Installing observability stack for CloudExpress..."

# Create namespace
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Helm repositories
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Loki stack
echo "Installing Loki..."
helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --values values-loki.yaml \
  --wait

# Install Prometheus stack (includes Grafana)
echo "Installing Prometheus & Grafana..."
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values values-prometheus.yaml \
  --wait

# Create CloudExpress dashboards ConfigMap
echo "Creating CloudExpress dashboards..."
kubectl apply -f cloudexpress-dashboards.yaml

echo "Observability stack installed successfully!"
echo ""
echo "Access points:"
echo "- Grafana: https://grafana.cloudexpress.io (admin/changeme)"
echo "- Prometheus: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
echo "- Loki: https://loki.cloudexpress.io"