#!/bin/bash

# Simulate the demo output for testing visual appearance
# This helps verify the output looks good before actual deployment

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Timing
STEP_DELAY=0.5
BUILD_DELAY=0.3

echo -e "\n${BLUE}${BOLD}🚀 Deploying demo-app to AWS${NC}\n"
sleep $STEP_DELAY

echo -e "${GREEN}✓ AWS credentials found${NC}"
sleep $STEP_DELAY

echo -e "${GREEN}✓ Detected node-20 application${NC}"
sleep $STEP_DELAY

echo -e "${GREEN}✓ Dockerfile created${NC}"
sleep $STEP_DELAY

echo -e "${GREEN}✓ Setting up container registry${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Authenticating with ECR${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Building container (this may take a moment)${NC}"
sleep $BUILD_DELAY

# Simulate Docker build output
echo -e "${GRAY}  Step 1/7 : FROM node:20-alpine${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> a1b2c3d4e5f6${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 2/7 : WORKDIR /app${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> cdef12345678${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 3/7 : COPY package*.json ./${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> 9876543210fe${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 4/7 : RUN npm ci --only=production${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> fedcba987654${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 5/7 : COPY . .${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> 321098765432${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 6/7 : EXPOSE 3000${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> 109876543210${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Step 7/7 : CMD [\"npm\", \"start\"]${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  ----> abc123def456${NC}"
sleep $BUILD_DELAY
echo -e "${GREEN}  ✓ Successfully built abc123def456${NC}"
sleep $BUILD_DELAY
echo -e "${GREEN}  ✓ Successfully tagged 123456789012.dkr.ecr.us-east-1.amazonaws.com/cygni/demo-app:latest${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  Pushing image to ECR${NC}"
sleep $STEP_DELAY

echo -e "${GREEN}✓ Building application image${NC}"
sleep $STEP_DELAY

echo -e "${GREEN}✓ Creating infrastructure${NC}"
sleep $BUILD_DELAY
echo -e "${GRAY}  CloudFormation: CREATE_IN_PROGRESS${NC}"
sleep 2
echo -e "${GRAY}  CloudFormation: CREATE_COMPLETE${NC}"
sleep $STEP_DELAY

echo -e "\n${GREEN}${BOLD}✅ Deployment complete!${NC}"
echo -e "\nYour app is available at:"
echo -e "${CYAN}${BOLD}  https://demo-app.cx-demo.xyz${NC}"
echo -e "${GRAY}\n✨ Finished in 2m 47s${NC}"

echo -e "\nUseful commands:"
echo -e "${GRAY}  cx deploy --aws --name demo-app --rollback  # Rollback${NC}"
echo -e "${GRAY}  cx logs demo-app --aws                      # View logs${NC}"
echo -e "${GRAY}  cx status demo-app --aws                    # Check status${NC}"