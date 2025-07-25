#!/bin/bash
# Blue-Green migration from Fargate to EKS with zero downtime
# Usage: ./blue-green-migration.sh <app-name> <fargate-service-arn> [namespace]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arguments
APP_NAME=${1:-}
FARGATE_SERVICE=${2:-}
K8S_NAMESPACE=${3:-default}

# Configuration
TRAFFIC_SHIFT_INTERVALS=(10 25 50 75 90 100)
MONITORING_DURATION=120  # seconds between traffic shifts
ERROR_THRESHOLD=10       # max errors before rollback

if [[ -z "$APP_NAME" || -z "$FARGATE_SERVICE" ]]; then
    echo -e "${RED}Usage: $0 <app-name> <fargate-service-arn> [namespace]${NC}"
    echo "Example: $0 api-gateway arn:aws:ecs:us-east-1:123456789012:service/cluster/api-gateway"
    exit 1
fi

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Cleanup function
cleanup() {
    if [[ -f /tmp/route53-change.json ]]; then
        rm -f /tmp/route53-change.json
    fi
    if [[ -f /tmp/route53-update.json ]]; then
        rm -f /tmp/route53-update.json
    fi
}
trap cleanup EXIT

log "🚀 Starting zero-downtime migration for $APP_NAME"

# Step 1: Deploy to Kubernetes
log "1️⃣ Deploying application to Kubernetes..."

if [[ ! -f "k8s-manifests/${APP_NAME}-all.yaml" ]]; then
    error "Kubernetes manifests not found. Run fargate-to-k8s.py first."
    exit 1
fi

kubectl apply -f "k8s-manifests/${APP_NAME}-all.yaml" -n "$K8S_NAMESPACE"

# Wait for deployment to be ready
log "Waiting for deployment to be ready..."
if ! kubectl wait --for=condition=available --timeout=300s \
    deployment/"$APP_NAME" -n "$K8S_NAMESPACE"; then
    error "Deployment failed to become ready"
    exit 1
fi

# Step 2: Get endpoints
log "2️⃣ Getting service endpoints..."

# Get Fargate ALB DNS
FARGATE_ALB=$(aws ecs describe-services \
    --cluster "$(echo $FARGATE_SERVICE | cut -d'/' -f2)" \
    --services "$FARGATE_SERVICE" \
    --query 'services[0].loadBalancers[0].dnsName' \
    --output text)

if [[ "$FARGATE_ALB" == "None" || -z "$FARGATE_ALB" ]]; then
    error "No load balancer found for Fargate service"
    exit 1
fi

log "Fargate ALB: $FARGATE_ALB"

# Get K8s Ingress endpoint
K8S_ENDPOINT=""
for i in {1..30}; do
    K8S_ENDPOINT=$(kubectl get ingress "$APP_NAME" -n "$K8S_NAMESPACE" \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
    
    if [[ -n "$K8S_ENDPOINT" ]]; then
        break
    fi
    
    log "Waiting for Ingress endpoint... ($i/30)"
    sleep 10
done

if [[ -z "$K8S_ENDPOINT" ]]; then
    error "Failed to get Kubernetes Ingress endpoint"
    exit 1
fi

log "Kubernetes endpoint: $K8S_ENDPOINT"

# Step 3: Test K8s endpoint
log "3️⃣ Testing Kubernetes endpoint..."

if ! curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$K8S_ENDPOINT/health" | grep -q "200"; then
    warning "Health check failed on K8s endpoint. Attempting alternate path..."
    if ! curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$K8S_ENDPOINT/" | grep -q "200"; then
        error "Kubernetes endpoint is not responding"
        exit 1
    fi
fi

log "✅ Kubernetes endpoint is healthy"

# Step 4: Setup Route53 weighted routing
log "4️⃣ Configuring Route53 for traffic shifting..."

# Assuming the app has a domain like app-name.cygni.app
DOMAIN="${APP_NAME}.cygni.app"
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
    --query "HostedZones[?contains(Name, 'cygni.app')].Id" \
    --output text | cut -d'/' -f3)

if [[ -z "$HOSTED_ZONE_ID" ]]; then
    warning "No hosted zone found for cygni.app. Using ALB DNS names directly."
    SKIP_ROUTE53=true
else
    SKIP_ROUTE53=false
    
    # Create initial weighted routing records
    cat > /tmp/route53-change.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "Fargate",
        "Weight": 100,
        "TTL": 60,
        "ResourceRecords": [{"Value": "${FARGATE_ALB}"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
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

    if ! aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/route53-change.json; then
        error "Failed to create Route53 records"
        exit 1
    fi
    
    log "✅ Route53 weighted routing configured"
fi

# Step 5: Gradual traffic shift
log "5️⃣ Starting gradual traffic migration..."

rollback() {
    error "Rolling back migration!"
    
    if [[ "$SKIP_ROUTE53" == "false" ]]; then
        # Route all traffic back to Fargate
        cat > /tmp/route53-rollback.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${DOMAIN}",
      "Type": "CNAME",
      "SetIdentifier": "Fargate",
      "Weight": 100,
      "TTL": 60,
      "ResourceRecords": [{"Value": "${FARGATE_ALB}"}]
    }
  }]
}
EOF
        aws route53 change-resource-record-sets \
            --hosted-zone-id "$HOSTED_ZONE_ID" \
            --change-batch file:///tmp/route53-rollback.json || true
    fi
    
    # Scale K8s deployment to 0
    kubectl scale deployment "$APP_NAME" -n "$K8S_NAMESPACE" --replicas=0
    
    exit 1
}

for weight in "${TRAFFIC_SHIFT_INTERVALS[@]}"; do
    log "📊 Shifting ${weight}% traffic to EKS..."
    
    if [[ "$SKIP_ROUTE53" == "false" ]]; then
        # Update Route53 weights
        cat > /tmp/route53-update.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
        "Type": "CNAME",
        "SetIdentifier": "Fargate",
        "Weight": $((100 - weight)),
        "TTL": 60,
        "ResourceRecords": [{"Value": "${FARGATE_ALB}"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
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

        if ! aws route53 change-resource-record-sets \
            --hosted-zone-id "$HOSTED_ZONE_ID" \
            --change-batch file:///tmp/route53-update.json; then
            error "Failed to update Route53 weights"
            rollback
        fi
    fi
    
    # Monitor for errors
    log "Monitoring application health for ${MONITORING_DURATION} seconds..."
    
    START_TIME=$(date +%s)
    ERROR_COUNT=0
    
    while [[ $(($(date +%s) - START_TIME)) -lt $MONITORING_DURATION ]]; do
        # Check pod status
        NOT_READY=$(kubectl get pods -l app="$APP_NAME" -n "$K8S_NAMESPACE" \
            --field-selector=status.phase!=Running --no-headers | wc -l)
        
        if [[ $NOT_READY -gt 0 ]]; then
            warning "$NOT_READY pods are not ready"
        fi
        
        # Check for errors in logs
        RECENT_ERRORS=$(kubectl logs -l app="$APP_NAME" -n "$K8S_NAMESPACE" \
            --since=30s --prefix=true 2>/dev/null | grep -c -E "(ERROR|CRITICAL|FATAL)" || true)
        
        ERROR_COUNT=$((ERROR_COUNT + RECENT_ERRORS))
        
        if [[ $ERROR_COUNT -gt $ERROR_THRESHOLD ]]; then
            error "Error threshold exceeded! ($ERROR_COUNT errors)"
            rollback
        fi
        
        # Display progress
        ELAPSED=$(($(date +%s) - START_TIME))
        printf "\r⏱️  Progress: %d/%d seconds | Errors: %d | Weight: %d%%" \
            "$ELAPSED" "$MONITORING_DURATION" "$ERROR_COUNT" "$weight"
        
        sleep 5
    done
    
    printf "\n"
    log "✅ Weight ${weight}% completed successfully (${ERROR_COUNT} errors)"
done

# Step 6: Final validation
log "6️⃣ Performing final validation..."

# Check all pods are running
TOTAL_PODS=$(kubectl get pods -l app="$APP_NAME" -n "$K8S_NAMESPACE" --no-headers | wc -l)
RUNNING_PODS=$(kubectl get pods -l app="$APP_NAME" -n "$K8S_NAMESPACE" \
    --field-selector=status.phase=Running --no-headers | wc -l)

if [[ $TOTAL_PODS -ne $RUNNING_PODS ]]; then
    error "Not all pods are running ($RUNNING_PODS/$TOTAL_PODS)"
    rollback
fi

log "✅ All pods are healthy"

# Step 7: Scale down Fargate
log "7️⃣ Scaling down Fargate service..."

CLUSTER_NAME=$(echo "$FARGATE_SERVICE" | cut -d'/' -f2)
SERVICE_NAME=$(echo "$FARGATE_SERVICE" | cut -d'/' -f3)

if aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --desired-count 0; then
    log "✅ Fargate service scaled to 0"
else
    warning "Failed to scale down Fargate service. Manual intervention required."
fi

# Success!
log "🎉 Migration completed successfully!"
log ""
log "📋 Summary:"
log "  • Application: $APP_NAME"
log "  • Namespace: $K8S_NAMESPACE"
log "  • K8s Endpoint: $K8S_ENDPOINT"
if [[ "$SKIP_ROUTE53" == "false" ]]; then
    log "  • Domain: $DOMAIN"
fi
log ""
log "📌 Next steps:"
log "  1. Monitor application metrics and logs"
log "  2. Update DNS records to point directly to K8s"
log "  3. Delete Fargate resources after validation period"
log ""
log "🔄 To rollback: kubectl scale deployment $APP_NAME -n $K8S_NAMESPACE --replicas=0"