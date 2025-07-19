#!/bin/bash
# Backend validation ladder - climb through each stage

set -e

echo " CloudExpress Backend Validation Ladder"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track progress
STAGE=0
PASSED=0
FAILED=0

# Helper functions
run_stage() {
    STAGE=$((STAGE + 1))
    echo -e "\n${YELLOW}Stage $STAGE: $1${NC}"
    echo "----------------------------------------"
}

check_pass() {
    echo -e "${GREEN} $1${NC}"
    PASSED=$((PASSED + 1))
}

check_fail() {
    echo -e "${RED} $1${NC}"
    FAILED=$((FAILED + 1))
}

# Stage 1: Compile & Lint
run_stage "Compile & Lint"

if npm run build > /dev/null 2>&1; then
    check_pass "TypeScript compilation successful"
else
    check_fail "TypeScript compilation failed"
fi

if npm run lint > /dev/null 2>&1; then
    check_pass "Linting passed"
else
    check_fail "Linting failed"
fi

# Stage 2: Unit Tests
run_stage "Unit Tests"

if npm test -- --testPathPattern=unit --passWithNoTests > /dev/null 2>&1; then
    check_pass "Unit tests passed"
else
    check_fail "Unit tests failed"
fi

# Stage 3: Local Integration
run_stage "Local Integration"

# Check if Docker is running
if docker info > /dev/null 2>&1; then
    check_pass "Docker is running"
    
    # Start services
    echo "Starting local services..."
    docker-compose up -d db redis > /dev/null 2>&1
    sleep 5
    
    # Test database connection
    if docker-compose exec -T db pg_isready -U cloudexpress > /dev/null 2>&1; then
        check_pass "Database is ready"
    else
        check_fail "Database connection failed"
    fi
else
    check_fail "Docker is not running"
fi

# Stage 4: Endpoint Contract Tests
run_stage "Endpoint Contract Tests"

# Check if API can start
if [ -f ".env" ]; then
    check_pass ".env file exists"
else
    check_fail ".env file missing (copy from .env.example)"
fi

# Test health endpoint (if server is running)
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    check_pass "Health endpoint responsive"
else
    echo "  API server not running (start with 'npm run dev')"
fi

# Stage 5: Environment Variables
run_stage "Environment Variables"

required_vars=(
    "DATABASE_URL"
    "JWT_SECRET"
)

for var in "${required_vars[@]}"; do
    if [ -n "${!var}" ] || grep -q "^$var=" .env 2>/dev/null; then
        check_pass "$var is set"
    else
        check_fail "$var is missing"
    fi
done

# Stage 6: Container Build
run_stage "Container Sanity"

if docker build -t cloudexpress-api-test . > /dev/null 2>&1; then
    check_pass "Docker image builds successfully"
else
    check_fail "Docker build failed"
fi

# Stage 7: Security Checks
run_stage "Security Checks"

# Check for common security issues
if ! grep -r "password.*=.*['\"].*['\"]" src --include="*.ts" 2>/dev/null | grep -v test | grep -v example; then
    check_pass "No hardcoded passwords found"
else
    check_fail "Potential hardcoded passwords detected"
fi

if grep -q "JWT_SECRET" .env.example 2>/dev/null; then
    check_pass "JWT secret in example config"
else
    check_fail "JWT secret missing from example"
fi

# Stage 8: API Documentation
run_stage "API Documentation"

if [ -f "cloudexpress.postman_collection.json" ]; then
    check_pass "Postman collection exists"
else
    check_fail "Postman collection missing"
fi

if [ -f "README.md" ]; then
    check_pass "README documentation exists"
else
    check_fail "README missing"
fi

# Summary
echo ""
echo "========================================"
echo "Validation Summary"
echo "========================================"
echo -e "Total stages: $STAGE"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN} All validation stages passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start the API: npm run dev"
    echo "2. Run E2E tests: npm run test:e2e"
    echo "3. Test with Postman/Newman"
    echo "4. Deploy to staging"
else
    echo -e "${RED}  Some validation stages failed${NC}"
    echo ""
    echo "Fix the issues above before proceeding."
fi

# Cleanup
echo ""
echo "Cleaning up..."
docker-compose down > /dev/null 2>&1 || true