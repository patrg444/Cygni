#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Running End-to-End Tests"
echo "=========================="

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check if Kind is installed
if ! command -v kind &> /dev/null; then
    echo -e "${RED}✗ kind is not installed${NC}"
    echo "Install with: brew install kind (macOS) or see https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}✗ kubectl is not installed${NC}"
    echo "Install with: brew install kubectl (macOS) or see https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites satisfied${NC}"

# Step 1: Setup Kind cluster
echo -e "\n${YELLOW}Setting up Kind cluster...${NC}"
if ! kubectl config get-contexts | grep -q "kind-cygni-test"; then
    ./scripts/setup-kind-cluster.sh
else
    echo -e "${GREEN}✓ Kind cluster already exists${NC}"
fi

# Step 2: Start services if not running
echo -e "\n${YELLOW}Checking if services are running...${NC}"
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Starting services..."
    docker compose up -d postgres redis
    
    # Wait for database
    until docker compose exec -T postgres pg_isready > /dev/null 2>&1; do
        sleep 1
    done
    
    # Run migrations
    pnpm --filter services/api prisma:migrate:dev || true
    
    # Start services
    pnpm --filter services/api start &
    API_PID=$!
    
    pnpm --filter services/builder start &
    BUILDER_PID=$!
    
    # Wait for services
    echo -n "Waiting for API service..."
    until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    echo -e " ${GREEN}✓${NC}"
    
    echo -n "Waiting for Builder service..."
    until curl -s http://localhost:3001/health > /dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    echo -e " ${GREEN}✓${NC}"
else
    echo -e "${GREEN}✓ Services are running${NC}"
fi

# Step 3: Run Kaniko E2E tests
echo -e "\n${YELLOW}Running Kaniko E2E tests...${NC}"
export API_URL=http://localhost:3000
export BUILDER_URL=http://localhost:3001

if pnpm --filter @cloudexpress/builder test tests/e2e/kaniko-local.test.ts; then
    echo -e "${GREEN}✓ Kaniko E2E tests passed${NC}"
    KANIKO_PASSED=true
else
    echo -e "${RED}✗ Kaniko E2E tests failed${NC}"
    KANIKO_PASSED=false
fi

# Step 4: Run Health & Rollback tests
echo -e "\n${YELLOW}Running Health & Rollback tests...${NC}"
if pnpm --filter @cloudexpress/services-api test tests/health-rollback.test.ts; then
    echo -e "${GREEN}✓ Health & Rollback tests passed${NC}"
    HEALTH_PASSED=true
else
    echo -e "${RED}✗ Health & Rollback tests failed${NC}"
    HEALTH_PASSED=false
fi

# Cleanup (optional)
if [ "${CLEANUP:-false}" = "true" ]; then
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
    [ -n "$BUILDER_PID" ] && kill $BUILDER_PID 2>/dev/null || true
    kind delete cluster --name cygni-test
    docker stop kind-registry && docker rm kind-registry
fi

# Summary
echo -e "\n${YELLOW}E2E Test Summary:${NC}"
echo "=================="
echo -n "Kaniko Build Tests: "
[ "$KANIKO_PASSED" = "true" ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}"
echo -n "Health & Rollback Tests: "
[ "$HEALTH_PASSED" = "true" ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}"

if [ "$KANIKO_PASSED" = "true" ] && [ "$HEALTH_PASSED" = "true" ]; then
    echo -e "\n${GREEN}✓ All E2E tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some E2E tests failed${NC}"
    exit 1
fi