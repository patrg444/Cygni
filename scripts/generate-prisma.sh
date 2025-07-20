#!/bin/bash
# Generate Prisma clients for all services

echo "Generating Prisma clients..."

# Find all prisma directories and generate clients
for prisma_dir in services/*/prisma packages/*/prisma; do
  if [ -d "$prisma_dir" ]; then
    service_dir=$(dirname "$prisma_dir")
    echo "Generating Prisma client for $service_dir"
    (cd "$service_dir" && npx prisma generate)
  fi
done

echo "Prisma client generation complete!"