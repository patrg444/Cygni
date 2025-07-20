#!/bin/bash
set -e

echo "🚀 Starting Cygni Backend Smoke Test"
echo "===================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to wait for service
wait_for_service() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for $url to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}✗${NC}"
    return 1
}

# Check if docker-compose.test.yml exists, otherwise use regular docker-compose.yml
COMPOSE_FILE="docker-compose.test.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="docker-compose.yml"
fi

echo "📦 Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "🐳 Starting services with $COMPOSE_FILE..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL..."
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready > /dev/null 2>&1; do
    sleep 1
done
echo -e "PostgreSQL is ready ${GREEN}✓${NC}"

# Wait for Redis
echo "⏳ Waiting for Redis..."
until docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "Redis is ready ${GREEN}✓${NC}"

echo "🔨 Building services..."
pnpm --filter services/api build
pnpm --filter services/builder build

echo "🗄️  Running database migrations..."
pnpm --filter services/api prisma:migrate:dev || pnpm --filter services/api prisma:migrate

echo "🌱 Seeding database..."
pnpm --filter services/api prisma:seed

echo "🚀 Starting API service..."
pnpm --filter services/api start &
API_PID=$!

echo "🚀 Starting Builder service..."
pnpm --filter services/builder start &
BUILDER_PID=$!

# Wait for services to be ready
if ! wait_for_service "http://localhost:3000/api/health"; then
    echo -e "${RED}API service failed to start${NC}"
    kill $API_PID $BUILDER_PID 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" down
    exit 1
fi

if ! wait_for_service "http://localhost:3001/health"; then
    echo -e "${RED}Builder service failed to start${NC}"
    kill $API_PID $BUILDER_PID 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" down
    exit 1
fi

echo -e "\n${GREEN}✓ All services are healthy!${NC}\n"

# Create test data
echo "📝 Creating test build request..."

# First, get an API key from the seeded data
API_KEY=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d cygni -t -c "SELECT key FROM api_keys LIMIT 1;" | tr -d ' \n')

if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}No API key found, creating one...${NC}"
    # You would need to implement API key creation here
    API_KEY="test-api-key"
fi

# Create sample build spec
cat > /tmp/sample-build-spec.json <<EOF
{
  "projectId": "demo-project-1",
  "branch": "main",
  "commitSha": "$(git rev-parse --short HEAD 2>/dev/null || echo 'abc123')",
  "dockerfilePath": "Dockerfile",
  "buildArgs": {
    "NODE_ENV": "production"
  }
}
EOF

echo "🏗️  Submitting build request..."
BUILD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/builds \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d @/tmp/sample-build-spec.json)

BUILD_ID=$(echo "$BUILD_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")

if [ -z "$BUILD_ID" ] || [ "$BUILD_ID" = "null" ]; then
    echo -e "${RED}Failed to create build${NC}"
    echo "Response: $BUILD_RESPONSE"
    FAILED=true
else
    echo -e "${GREEN}✓ Build created with ID: $BUILD_ID${NC}"
    
    echo "📊 Checking build status..."
    BUILD_STATUS=$(curl -s http://localhost:3000/api/builds/$BUILD_ID \
        -H "X-API-Key: $API_KEY" | jq -r '.status' 2>/dev/null || echo "")
    
    echo "Build status: $BUILD_STATUS"
fi

echo -e "\n🧪 Running unit tests..."
pnpm run test || FAILED=true

echo -e "\n🔍 Running lint checks..."
pnpm run lint || FAILED=true

echo -e "\n📋 Test Summary:"
echo "=================="
if [ -z "$FAILED" ]; then
    echo -e "${GREEN}✓ All smoke tests passed!${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    EXIT_CODE=1
fi

# Cleanup
echo -e "\n🧹 Cleaning up..."
kill $API_PID $BUILDER_PID 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" down
rm -f /tmp/sample-build-spec.json

echo -e "\n${YELLOW}Smoke test complete!${NC}"
exit $EXIT_CODE