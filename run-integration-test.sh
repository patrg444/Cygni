#!/bin/bash

echo "Running integration tests against Docker services..."

# Set environment variables for services
export API_URL=http://localhost:3000
export BUILDER_URL=http://localhost:3001
export DATABASE_URL=postgresql://postgres:postgres@localhost:5434/cygni_integration
export REDIS_HOST=localhost
export REDIS_PORT=6381

# Check if services are running
echo "Checking service health..."
curl -s ${API_URL}/health > /dev/null
if [ $? -ne 0 ]; then
  echo "API service is not running. Please run: docker-compose -f docker-compose.integration.yml up -d"
  exit 1
fi

curl -s ${BUILDER_URL}/health > /dev/null
if [ $? -ne 0 ]; then
  echo "Builder service is not running. Please run: docker-compose -f docker-compose.integration.yml up -d"
  exit 1
fi

echo "✓ Services are healthy"

# Run the integration tests
cd services/builder
pnpm test tests/integration/real-integration.test.ts -- --run