#!/bin/bash

# Demo Preparation Script
# Run this before recording to ensure everything is ready

set -e

echo "🎬 Preparing Cygni AWS Demo Environment"
echo "========================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Configuration
DEMO_APP_NAME="demo-app"
DEMO_REGION="us-east-1"

echo -e "\n${BLUE}1. Cleaning up old CloudFormation stacks...${NC}"
# List all Cygni stacks
STACKS=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'cygni-')].StackName" \
  --output text)

if [ -n "$STACKS" ]; then
  for stack in $STACKS; do
    echo "   Deleting stack: $stack"
    aws cloudformation delete-stack --stack-name "$stack" || true
  done
  echo -e "${GREEN}   ✓ Cleanup initiated${NC}"
else
  echo -e "${GREEN}   ✓ No old stacks found${NC}"
fi

echo -e "\n${BLUE}2. Checking Route53 and ACM setup...${NC}"
# Check for required environment variables
if [ -z "$CX_HOSTED_ZONE_ID" ] || [ -z "$CX_CERTIFICATE_ARN" ]; then
  echo -e "${YELLOW}   ⚠ Missing environment variables${NC}"
  echo "   Please set:"
  echo "     export CX_HOSTED_ZONE_ID=<your-zone-id>"
  echo "     export CX_CERTIFICATE_ARN=<your-cert-arn>"
else
  echo -e "${GREEN}   ✓ DNS configuration found${NC}"
  
  # Verify certificate is validated
  CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn "$CX_CERTIFICATE_ARN" \
    --query "Certificate.Status" \
    --output text 2>/dev/null || echo "NOT_FOUND")
  
  if [ "$CERT_STATUS" = "ISSUED" ]; then
    echo -e "${GREEN}   ✓ Certificate is validated${NC}"
  else
    echo -e "${YELLOW}   ⚠ Certificate status: $CERT_STATUS${NC}"
  fi
fi

echo -e "\n${BLUE}3. Warming Docker cache...${NC}"
cd examples/express-demo

# Pull base image
docker pull node:20-alpine >/dev/null 2>&1 &
DOCKER_PID=$!

# Install npm dependencies
if [ ! -d "node_modules" ]; then
  npm install --quiet
fi

wait $DOCKER_PID
echo -e "${GREEN}   ✓ Docker cache warmed${NC}"

echo -e "\n${BLUE}4. Building CLI...${NC}"
cd ../..
pnpm build >/dev/null 2>&1
echo -e "${GREEN}   ✓ CLI built${NC}"

echo -e "\n${BLUE}5. Setting up demo environment...${NC}"
# Clean terminal prompt for recording
export PS1="[cygni-demo] $ "
echo -e "${GREEN}   ✓ Terminal prompt configured${NC}"

# Create demo aliases
alias cx="./cx"
echo -e "${GREEN}   ✓ Aliases created${NC}"

echo -e "\n${BLUE}6. Pre-flight checks...${NC}"
# Test health endpoint locally
cd examples/express-demo
timeout 2s node index.js >/dev/null 2>&1 &
sleep 1
if curl -s http://localhost:3000/health | grep -q "ok" >/dev/null 2>&1; then
  echo -e "${GREEN}   ✓ Express app health check works${NC}"
else
  echo -e "${YELLOW}   ⚠ Express app health check failed${NC}"
fi
pkill -f "node index.js" 2>/dev/null || true

echo -e "\n${GREEN}✅ Demo environment ready!${NC}"
echo -e "\n${BLUE}Quick reminders:${NC}"
echo "  • Record in examples/express-demo directory"
echo "  • Use '${DEMO_APP_NAME}' as the app name"
echo "  • Browser bookmarked: https://${DEMO_APP_NAME}.cx-demo.xyz"
echo "  • CloudWatch Insights tab ready"
echo "  • Terminal font size increased"
echo -e "\n${BLUE}Demo commands:${NC}"
echo "  1. cd examples/express-demo"
echo "  2. cat index.js  # Show the code"
echo "  3. cx deploy --aws --name ${DEMO_APP_NAME}"
echo "  4. curl https://${DEMO_APP_NAME}.cx-demo.xyz"
echo "  5. cx deploy --aws --name ${DEMO_APP_NAME} --rollback"

echo -e "\n${YELLOW}Recording tip:${NC} Start recording now, then run the commands above"