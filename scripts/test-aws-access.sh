#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Testing AWS Access and Configuration"
echo "======================================="

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Test AWS credentials
echo -e "\n${YELLOW}Testing AWS credentials...${NC}"
if aws sts get-caller-identity > /tmp/aws-identity.json 2>/dev/null; then
    echo -e "${GREEN}✓ AWS credentials are valid${NC}"
    
    # Extract and display account info
    ACCOUNT_ID=$(cat /tmp/aws-identity.json | jq -r '.Account')
    USER_ARN=$(cat /tmp/aws-identity.json | jq -r '.Arn')
    
    echo -e "\nAWS Account ID: ${GREEN}$ACCOUNT_ID${NC}"
    echo -e "User ARN: $USER_ARN"
    
    # Update .env with actual account ID
    if [ "$ACCOUNT_ID" != "123456789012" ]; then
        echo -e "\n${YELLOW}Updating .env with actual AWS Account ID...${NC}"
        sed -i.bak "s/AWS_ACCOUNT_ID=.*/AWS_ACCOUNT_ID=$ACCOUNT_ID/" .env
        echo -e "${GREEN}✓ Updated AWS_ACCOUNT_ID in .env${NC}"
    fi
else
    echo -e "${RED}✗ AWS credentials are invalid or not configured${NC}"
    exit 1
fi

# Test specific service access
echo -e "\n${YELLOW}Testing AWS service access...${NC}"

# Test S3
echo -n "S3: "
if aws s3 ls --max-items 1 >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Test ECR
echo -n "ECR: "
if aws ecr describe-repositories --max-items 1 >/dev/null 2>&1 || [ $? -eq 255 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Test ECS
echo -n "ECS: "
if aws ecs list-clusters --max-items 1 >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Test IAM (list attached policies)
echo -n "IAM: "
if aws iam get-user >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    
    # List user policies
    echo -e "\n${YELLOW}User policies:${NC}"
    aws iam list-attached-user-policies --user-name $(aws iam get-user | jq -r '.User.UserName') 2>/dev/null || echo "No attached policies"
    aws iam list-user-policies --user-name $(aws iam get-user | jq -r '.User.UserName') 2>/dev/null || echo "No inline policies"
else
    echo -e "${RED}✗${NC}"
fi

# Check for existing Cygni resources
echo -e "\n${YELLOW}Checking for existing Cygni resources...${NC}"

# Check ECR repository
echo -n "ECR Repository (cygni-builds): "
if aws ecr describe-repositories --repository-names cygni-builds >/dev/null 2>&1; then
    echo -e "${GREEN}exists${NC}"
    REPO_URI=$(aws ecr describe-repositories --repository-names cygni-builds | jq -r '.repositories[0].repositoryUri')
    echo "  Repository URI: $REPO_URI"
else
    echo -e "${YELLOW}not found${NC}"
    echo "  Create with: aws ecr create-repository --repository-name cygni-builds"
fi

# Check S3 bucket
echo -n "S3 Bucket (cygni-build-artifacts): "
if aws s3api head-bucket --bucket cygni-build-artifacts 2>/dev/null; then
    echo -e "${GREEN}exists${NC}"
else
    echo -e "${YELLOW}not found${NC}"
    echo "  Create with: aws s3api create-bucket --bucket cygni-build-artifacts --region $AWS_REGION"
fi

# Clean up
rm -f /tmp/aws-identity.json

echo -e "\n${GREEN}AWS access test complete!${NC}"
echo -e "\nNext steps:"
echo "1. Review the permissions above"
echo "2. Create any missing resources"
echo "3. Update ECR_REPOSITORY_URI in .env if needed"