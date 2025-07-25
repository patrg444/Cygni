#!/bin/bash
# Export Fargate task definitions and services
# Usage: ./export-fargate-tasks.sh [cluster-name]

set -euo pipefail

CLUSTER_NAME=${1:-cygni-production}
OUTPUT_DIR="./fargate-exports"

echo "🔍 Exporting Fargate task definitions from cluster: $CLUSTER_NAME"
mkdir -p "$OUTPUT_DIR"

# List all services
services=$(aws ecs list-services --cluster "$CLUSTER_NAME" --query 'serviceArns[]' --output text)

if [[ -z "$services" ]]; then
    echo "No services found in cluster $CLUSTER_NAME"
    exit 1
fi

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
    
    if [[ -n "$task_def" ]]; then
        aws ecs describe-task-definition \
            --task-definition "$task_def" \
            --query 'taskDefinition' \
            > "$OUTPUT_DIR/task-def-$service_name.json"
    fi
done

echo "✅ Export complete! Files saved to $OUTPUT_DIR"
echo "📊 Exported $(ls -1 $OUTPUT_DIR | wc -l) files"