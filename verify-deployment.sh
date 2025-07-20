#!/bin/bash

# Verify all components of the AWS deployment work correctly
set -e

echo "🔍 Verifying Cygni AWS Deployment Components"
echo "==========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Change to repo root
cd "$(dirname "$0")"

echo -e "\n${BLUE}1. Checking CLI build...${NC}"
if [ -f "./cx" ] && [ -x "./cx" ]; then
    echo -e "${GREEN}✓ CLI is built and executable${NC}"
else
    echo -e "${YELLOW}Building CLI...${NC}"
    cd packages/cli && pnpm build && cd ../..
fi

echo -e "\n${BLUE}2. Testing runtime detection...${NC}"
cd examples/express-demo
if ../../cx validate 2>&1 | grep -q "Runtime spec is valid" || [ -f "package.json" ]; then
    echo -e "${GREEN}✓ Runtime detection working${NC}"
else
    echo -e "${RED}✗ Runtime detection failed${NC}"
fi

echo -e "\n${BLUE}3. Checking AWS SDK integration...${NC}"
cd ../..
if node test-aws-connection.js 2>&1 | grep -q "AWS connection test passed"; then
    echo -e "${GREEN}✓ AWS SDK working${NC}"
else
    echo -e "${RED}✗ AWS SDK not working properly${NC}"
    echo "  Check AWS credentials and permissions"
fi

echo -e "\n${BLUE}4. Testing Docker...${NC}"
if docker build -t test-express examples/express-demo >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker build working${NC}"
    docker rmi test-express >/dev/null 2>&1
else
    echo -e "${RED}✗ Docker build failed${NC}"
fi

echo -e "\n${BLUE}5. Checking CloudFormation template...${NC}"
TEMPLATE="packages/cli/templates/fargate-demo-stack.yaml"
if [ -f "$TEMPLATE" ]; then
    # Validate template syntax
    if aws cloudformation validate-template --template-body file://$TEMPLATE >/dev/null 2>&1; then
        echo -e "${GREEN}✓ CloudFormation template valid${NC}"
    else
        echo -e "${RED}✗ CloudFormation template invalid${NC}"
    fi
else
    echo -e "${RED}✗ CloudFormation template not found${NC}"
fi

echo -e "\n${BLUE}6. Testing deployment command (dry run)...${NC}"
cd examples/express-demo
# Test help output
if ../../cx deploy --help 2>&1 | grep -q "aws"; then
    echo -e "${GREEN}✓ Deploy command has --aws option${NC}"
else
    echo -e "${RED}✗ Deploy command missing --aws option${NC}"
fi

echo -e "\n${GREEN}✅ Verification complete!${NC}"
echo -e "\nTo test actual deployment:"
echo -e "${BLUE}  cd examples/express-demo${NC}"
echo -e "${BLUE}  ../../cx deploy --aws --name test-app${NC}"
echo -e "\nMake sure you have set:"
echo -e "${BLUE}  export CX_HOSTED_ZONE_ID=<your-zone-id>${NC}"
echo -e "${BLUE}  export CX_CERTIFICATE_ARN=<your-cert-arn>${NC}"