#!/bin/bash
# Real-time migration monitoring dashboard
# Usage: ./migration-monitor.sh <app-name> [namespace]

set -euo pipefail

APP_NAME=${1:-}
NAMESPACE=${2:-default}
REFRESH_INTERVAL=${3:-5}

if [[ -z "$APP_NAME" ]]; then
    echo "Usage: $0 <app-name> [namespace] [refresh-interval]"
    echo "Example: $0 api-gateway default 5"
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Clear screen and move cursor to top
clear_screen() {
    printf '\033[2J\033[H'
}

# Get terminal width
TERM_WIDTH=$(tput cols)

# Draw a line
draw_line() {
    printf '%*s\n' "${TERM_WIDTH}" '' | tr ' ' '─'
}

# Center text
center_text() {
    local text="$1"
    local width=${#text}
    local padding=$(( (TERM_WIDTH - width) / 2 ))
    printf "%*s%s%*s\n" $padding "" "$text" $padding ""
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$((bytes / 1048576))MB"
    else
        echo "$((bytes / 1073741824))GB"
    fi
}

# Main monitoring loop
while true; do
    clear_screen
    
    # Header
    echo -e "${CYAN}$(center_text "═══ CYGNI MIGRATION MONITOR ═══")${NC}"
    echo -e "${BLUE}$(center_text "Application: $APP_NAME | Namespace: $NAMESPACE")${NC}"
    echo -e "${BLUE}$(center_text "$(date '+%Y-%m-%d %H:%M:%S')")${NC}"
    draw_line
    
    # Pod Status
    echo -e "\n${GREEN}📦 POD STATUS${NC}"
    echo -e "NAME\t\t\t\tSTATUS\t\tRESTARTS\tAGE\tNODE"
    
    kubectl get pods -l app="$APP_NAME" -n "$NAMESPACE" \
        --no-headers \
        -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.phase,\
RESTARTS:.status.containerStatuses[0].restartCount,\
AGE:.status.startTime,\
NODE:.spec.nodeName 2>/dev/null | while read -r name status restarts age node; do
        
        # Color code status
        case $status in
            Running)
                status_color="${GREEN}${status}${NC}"
                ;;
            Pending|ContainerCreating)
                status_color="${YELLOW}${status}${NC}"
                ;;
            *)
                status_color="${RED}${status}${NC}"
                ;;
        esac
        
        # Calculate age
        if [[ -n "$age" && "$age" != "<none>" ]]; then
            age_seconds=$(( $(date +%s) - $(date -d "$age" +%s) ))
            if [[ $age_seconds -lt 60 ]]; then
                age="${age_seconds}s"
            elif [[ $age_seconds -lt 3600 ]]; then
                age="$((age_seconds / 60))m"
            else
                age="$((age_seconds / 3600))h"
            fi
        else
            age="N/A"
        fi
        
        # Truncate long names
        name_short=$(echo "$name" | cut -c1-30)
        node_short=$(echo "$node" | cut -c1-20)
        
        printf "%-30s\t%b\t\t%s\t\t%s\t%s\n" \
            "$name_short" "$status_color" "$restarts" "$age" "$node_short"
    done
    
    # Resource Usage
    echo -e "\n${GREEN}💻 RESOURCE USAGE${NC}"
    echo -e "POD\t\t\t\tCPU\t\tMEMORY"
    
    kubectl top pods -l app="$APP_NAME" -n "$NAMESPACE" --no-headers 2>/dev/null | \
    while read -r pod cpu memory; do
        pod_short=$(echo "$pod" | cut -c1-30)
        printf "%-30s\t%s\t\t%s\n" "$pod_short" "$cpu" "$memory"
    done || echo "Metrics not available (install metrics-server)"
    
    # Service Endpoints
    echo -e "\n${GREEN}🌐 SERVICE ENDPOINTS${NC}"
    kubectl get endpoints "$APP_NAME" -n "$NAMESPACE" 2>/dev/null | tail -n +2 || echo "No endpoints found"
    
    # HPA Status
    echo -e "\n${GREEN}📈 AUTOSCALING STATUS${NC}"
    kubectl get hpa -l app="$APP_NAME" -n "$NAMESPACE" 2>/dev/null | tail -n +2 || echo "No HPA configured"
    
    # Recent Events
    echo -e "\n${GREEN}📋 RECENT EVENTS${NC}"
    kubectl get events -n "$NAMESPACE" \
        --field-selector involvedObject.kind=Pod \
        --sort-by='.lastTimestamp' 2>/dev/null | \
        grep "$APP_NAME" | \
        tail -5 | \
        awk '{print $1, $4, $6}' || echo "No recent events"
    
    # Recent Logs Summary
    echo -e "\n${GREEN}📜 LOG SUMMARY (Last 2 minutes)${NC}"
    
    # Count log levels
    LOG_OUTPUT=$(kubectl logs -l app="$APP_NAME" -n "$NAMESPACE" \
        --since=2m --prefix=false --tail=1000 2>/dev/null || echo "")
    
    if [[ -n "$LOG_OUTPUT" ]]; then
        ERROR_COUNT=$(echo "$LOG_OUTPUT" | grep -c -E "(ERROR|CRITICAL|FATAL)" || echo "0")
        WARN_COUNT=$(echo "$LOG_OUTPUT" | grep -c -E "(WARN|WARNING)" || echo "0")
        INFO_COUNT=$(echo "$LOG_OUTPUT" | grep -c -E "(INFO|DEBUG)" || echo "0")
        
        echo -e "Errors: ${RED}${ERROR_COUNT}${NC} | Warnings: ${YELLOW}${WARN_COUNT}${NC} | Info: ${GREEN}${INFO_COUNT}${NC}"
        
        # Show last few errors if any
        if [[ $ERROR_COUNT -gt 0 ]]; then
            echo -e "\n${RED}Recent Errors:${NC}"
            echo "$LOG_OUTPUT" | grep -E "(ERROR|CRITICAL|FATAL)" | tail -3 | cut -c1-$((TERM_WIDTH - 5))
        fi
    else
        echo "No logs available"
    fi
    
    # Traffic Status (if Route53 is configured)
    echo -e "\n${GREEN}🚦 TRAFFIC STATUS${NC}"
    
    # Try to get ingress status
    INGRESS_LB=$(kubectl get ingress "$APP_NAME" -n "$NAMESPACE" \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
    
    if [[ -n "$INGRESS_LB" ]]; then
        echo "Ingress LB: $INGRESS_LB"
        
        # Quick health check
        if curl -s -o /dev/null -w "Health Check: %{http_code}\n" \
            --max-time 2 "$INGRESS_LB/health" 2>/dev/null | grep -q "200"; then
            echo -e "Status: ${GREEN}✓ Healthy${NC}"
        else
            echo -e "Status: ${RED}✗ Unhealthy${NC}"
        fi
    else
        echo "No ingress configured"
    fi
    
    # Footer
    draw_line
    echo -e "${CYAN}Refreshing every ${REFRESH_INTERVAL} seconds. Press Ctrl+C to exit.${NC}"
    
    sleep "$REFRESH_INTERVAL"
done