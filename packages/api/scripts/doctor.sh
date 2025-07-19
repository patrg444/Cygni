#!/bin/bash
# CloudExpress API Doctor - Checks connectivity and dependencies

set -e

echo "🩺 CloudExpress API Doctor"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Helper function to check status
check() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    local name=$1
    local command=$2
    
    printf "%-30s" "$name"
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Check Node.js version
check "Node.js (>=18)" "node -v | grep -E 'v(1[89]|[2-9][0-9])'"

# Check npm
check "npm" "which npm"

# Check TypeScript
check "TypeScript" "npx tsc --version"

# Check Prisma
check "Prisma CLI" "npx prisma --version"

# Check environment file
check ".env file" "test -f .env"

# Check required env vars
echo ""
echo "Environment Variables:"
echo "---------------------"

check_env() {
    local var=$1
    printf "%-30s" "$var"
    
    if [ -n "${!var}" ] || grep -q "^$var=" .env 2>/dev/null; then
        echo -e "${GREEN}✅ Set${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}❌ Missing${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

check_env "DATABASE_URL"
check_env "JWT_SECRET"
check_env "PORT"
check_env "NODE_ENV"

# Check database connectivity
echo ""
echo "Database:"
echo "---------"

# Extract DB info from DATABASE_URL
if [ -f .env ]; then
    source .env
fi

check "PostgreSQL connection" "npx prisma db execute --stdin <<< 'SELECT 1' 2>/dev/null"
check "Prisma schema valid" "npx prisma validate"

# Check Redis if configured
echo ""
echo "Redis:"
echo "------"

if [ -n "$REDIS_URL" ] || grep -q "^REDIS_URL=" .env 2>/dev/null; then
    check "Redis connection" "redis-cli ping"
else
    echo "Redis URL not configured (optional)"
fi

# Check ports
echo ""
echo "Network:"
echo "--------"

PORT=${PORT:-3000}
check "Port $PORT available" "! lsof -i:$PORT"

# Check Docker (optional)
echo ""
echo "Docker (optional):"
echo "-----------------"

if which docker > /dev/null 2>&1; then
    check "Docker daemon" "docker info"
    check "Docker Compose" "docker-compose --version"
else
    echo "Docker not installed (optional)"
fi

# Check disk space
echo ""
echo "System:"
echo "-------"

DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -lt 90 ]; then
    printf "%-30s" "Disk space"
    echo -e "${GREEN}✅ ${DISK_USAGE}% used${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    printf "%-30s" "Disk space"
    echo -e "${RED}❌ ${DISK_USAGE}% used (low space)${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Summary
echo ""
echo "=========================="
echo "Summary"
echo "=========================="
echo "Total checks: $TOTAL_CHECKS"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}🎉 All checks passed! Your system is ready.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some checks failed. Please fix the issues above.${NC}"
    exit 1
fi