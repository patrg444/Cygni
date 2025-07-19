#!/bin/bash
# CloudExpress Failure Friday - Weekly chaos testing script
# Tests automatic rollback and alerting systems

set -e

echo " CloudExpress Failure Friday - $(date)"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE=${NAMESPACE:-production}
SERVICE=${SERVICE:-demo-app}
FAILURE_TYPE=${1:-health-gate}

echo "Test Configuration:"
echo "  Namespace: $NAMESPACE"
echo "  Service: $SERVICE"
echo "  Failure Type: $FAILURE_TYPE"
echo ""

# Function to inject failures
inject_failure() {
    case $FAILURE_TYPE in
        "health-gate")
            echo -e "${YELLOW} Injecting health gate failure...${NC}"
            # Set impossibly low error rate threshold to trigger failure
            kubectl patch cloudexpressservice $SERVICE -n $NAMESPACE \
                --type='json' -p='[{"op": "replace", "path": "/spec/healthGate/maxErrorRate", "value": 0.01}]'
            ;;
        
        "high-latency")
            echo -e "${YELLOW} Injecting high latency...${NC}"
            # Set low P95 latency threshold
            kubectl patch cloudexpressservice $SERVICE -n $NAMESPACE \
                --type='json' -p='[{"op": "replace", "path": "/spec/healthGate/maxP95Latency", "value": 10}]'
            ;;
        
        "pod-failure")
            echo -e "${YELLOW} Killing random pod...${NC}"
            # Delete a random pod
            POD=$(kubectl get pods -n $NAMESPACE -l app=$SERVICE -o jsonpath='{.items[0].metadata.name}')
            kubectl delete pod $POD -n $NAMESPACE --grace-period=0 --force
            ;;
        
        "resource-pressure")
            echo -e "${YELLOW} Creating resource pressure...${NC}"
            # Lower resource limits to create pressure
            kubectl patch deployment $SERVICE -n $NAMESPACE \
                --type='json' -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "50Mi"}]'
            ;;
    esac
}

# Function to monitor rollback
monitor_rollback() {
    echo ""
    echo -e "${YELLOW} Monitoring for automatic rollback...${NC}"
    
    START_TIME=$(date +%s)
    TIMEOUT=300  # 5 minutes
    ROLLBACK_DETECTED=false
    
    while [ $(($(date +%s) - START_TIME)) -lt $TIMEOUT ]; do
        # Check deployment status
        STATUS=$(kubectl get cloudexpressservice $SERVICE -n $NAMESPACE -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
        
        if [[ "$STATUS" == "RollingBack" ]] || [[ "$STATUS" == "Failed" ]]; then
            ROLLBACK_DETECTED=true
            echo -e "\n${GREEN} Rollback detected! Status: $STATUS${NC}"
            break
        fi
        
        # Show current status
        echo -ne "\rCurrent status: $STATUS | Elapsed: $(($(date +%s) - START_TIME))s"
        sleep 2
    done
    
    if [ "$ROLLBACK_DETECTED" = false ]; then
        echo -e "\n${RED} No rollback detected within timeout!${NC}"
        return 1
    fi
}

# Function to verify alerts
verify_alerts() {
    echo ""
    echo -e "${YELLOW} Verifying alerts...${NC}"
    
    # Check for Kubernetes events
    echo "Recent events:"
    kubectl get events -n $NAMESPACE --field-selector involvedObject.name=$SERVICE \
        --sort-by='.lastTimestamp' | tail -5
    
    echo ""
    echo "TODO: Check your configured alert channels:"
    echo "  - PagerDuty incidents"
    echo "  - Slack #alerts channel"
    echo "  - Email notifications"
}

# Function to cleanup
cleanup() {
    echo ""
    echo -e "${YELLOW} Cleaning up...${NC}"
    
    # Reset health gate to normal values
    kubectl patch cloudexpressservice $SERVICE -n $NAMESPACE \
        --type='json' -p='[
            {"op": "replace", "path": "/spec/healthGate/maxErrorRate", "value": 5.0},
            {"op": "replace", "path": "/spec/healthGate/maxP95Latency", "value": 1000}
        ]'
    
    echo -e "${GREEN} Cleanup complete${NC}"
}

# Main execution
main() {
    echo "Starting Failure Friday drill..."
    echo ""
    
    # Pre-flight check
    echo "Pre-flight status:"
    kubectl get cloudexpressservice $SERVICE -n $NAMESPACE
    echo ""
    
    # Inject failure
    inject_failure
    
    # Monitor for rollback
    monitor_rollback
    
    # Verify alerts fired
    verify_alerts
    
    # Cleanup
    cleanup
    
    echo ""
    echo "================================================"
    echo -e "${GREEN}Failure Friday drill complete!${NC}"
    echo ""
    echo "Post-drill checklist:"
    echo "  [ ] Verify rollback worked correctly"
    echo "  [ ] Check all alerts were received"
    echo "  [ ] Review logs for any issues"
    echo "  [ ] Document any findings"
    echo ""
}

# Trap to ensure cleanup runs even if script fails
trap cleanup EXIT

# Run main function
main