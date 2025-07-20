#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Running Integration Tests"
echo "==========================="

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Step 1: Start integration test environment
echo -e "\n${YELLOW}Starting integration test environment...${NC}"
docker compose -f docker-compose.integration.yml down -v
docker compose -f docker-compose.integration.yml up -d

# Wait for services to be healthy
echo -e "\n${YELLOW}Waiting for services to be ready...${NC}"
ATTEMPTS=0
MAX_ATTEMPTS=60

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if docker compose -f docker-compose.integration.yml ps | grep -q "(healthy)"; then
        HEALTHY_SERVICES=$(docker compose -f docker-compose.integration.yml ps | grep -c "(healthy)" || true)
        if [ "$HEALTHY_SERVICES" -ge 4 ]; then
            echo -e "${GREEN}✓ All services are healthy${NC}"
            break
        fi
    fi
    echo -n "."
    sleep 2
    ATTEMPTS=$((ATTEMPTS + 1))
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
    echo -e "\n${RED}✗ Services failed to become healthy${NC}"
    docker compose -f docker-compose.integration.yml logs
    exit 1
fi

# Step 2: Run database migrations
echo -e "\n${YELLOW}Running database migrations...${NC}"
docker compose -f docker-compose.integration.yml exec -T api pnpm prisma:migrate || true
docker compose -f docker-compose.integration.yml exec -T builder pnpm prisma:migrate || true

# Step 3: Run integration tests
echo -e "\n${YELLOW}Running Builder ↔ Redis ↔ Postgres integration tests...${NC}"
export API_URL=http://localhost:3000
export BUILDER_URL=http://localhost:3001
export REDIS_PORT=6381
export DATABASE_URL=postgresql://postgres:postgres@localhost:5434/cygni_integration

# Run builder integration tests
if pnpm --filter @cloudexpress/builder test:integration; then
    echo -e "${GREEN}✓ Builder integration tests passed${NC}"
else
    echo -e "${RED}✗ Builder integration tests failed${NC}"
    FAILED=true
fi

# Run API integration tests
if pnpm --filter @cloudexpress/services-api test:integration; then
    echo -e "${GREEN}✓ API integration tests passed${NC}"
else
    echo -e "${RED}✗ API integration tests failed${NC}"
    FAILED=true
fi

# Step 4: Clean up
echo -e "\n${YELLOW}Cleaning up...${NC}"
docker compose -f docker-compose.integration.yml down -v

# Summary
echo -e "\n${YELLOW}Integration Test Summary:${NC}"
echo "========================"
if [ -z "$FAILED" ]; then
    echo -e "${GREEN}✓ All integration tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some integration tests failed${NC}"
    exit 1
fi