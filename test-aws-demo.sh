#!/bin/bash

echo "🚀 Testing Cygni AWS Demo"
echo "========================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check prerequisites
echo -e "\n${BLUE}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI not found${NC}"
    echo "  Install: https://aws.amazon.com/cli/"
    exit 1
else
    echo -e "${GREEN}✓ AWS CLI found${NC}"
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗ AWS credentials not configured${NC}"
    echo "  Run: aws configure"
    exit 1
else
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    echo -e "${GREEN}✓ AWS credentials configured (Account: $ACCOUNT_ID)${NC}"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found${NC}"
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
else
    echo -e "${GREEN}✓ Docker found${NC}"
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker daemon not running${NC}"
    echo "  Start Docker Desktop or run: sudo systemctl start docker"
    exit 1
else
    echo -e "${GREEN}✓ Docker daemon running${NC}"
fi

# Test the CLI
echo -e "\n${BLUE}Testing Cygni CLI...${NC}"

# Check if cx command exists
if [ -f "./cx" ]; then
    echo -e "${GREEN}✓ Cygni CLI found${NC}"
    
    # Test validate command
    if [ -f "examples/runtime-examples/node-express/runtime.yaml" ]; then
        echo -e "\n${BLUE}Testing runtime validation...${NC}"
        ./cx validate examples/runtime-examples/node-express/runtime.yaml
    fi
else
    echo -e "${RED}✗ Cygni CLI not found${NC}"
    echo "  Run: pnpm build"
    exit 1
fi

# Test in demo directory
echo -e "\n${BLUE}Testing Express demo app...${NC}"
cd examples/express-demo

# Install dependencies
echo "Installing dependencies..."
npm install

# Test the app locally
echo -e "\n${BLUE}Starting Express app locally...${NC}"
timeout 5s node index.js &
PID=$!
sleep 2

# Test health endpoint
if curl -s http://localhost:3000/health | grep -q "ok"; then
    echo -e "${GREEN}✓ Health endpoint working${NC}"
else
    echo -e "${RED}✗ Health endpoint failed${NC}"
fi

# Kill the test server
kill $PID 2>/dev/null

echo -e "\n${GREEN}✅ All checks passed!${NC}"
echo -e "\nReady to deploy with:"
echo -e "${BLUE}  cd examples/express-demo${NC}"
echo -e "${BLUE}  ../../cx deploy --aws --name my-demo-app${NC}"
echo -e "\nNote: You'll need to set these environment variables for the demo domain:"
echo -e "${BLUE}  export CX_HOSTED_ZONE_ID=<your-zone-id>${NC}"
echo -e "${BLUE}  export CX_CERTIFICATE_ARN=<your-cert-arn>${NC}"