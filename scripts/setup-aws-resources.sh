#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Setting up AWS Resources for Cygni"
echo "====================================="

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Create ECR Repository
echo -e "\n${YELLOW}Creating ECR Repository...${NC}"
if aws ecr create-repository --repository-name cygni-builds --region $AWS_REGION > /tmp/ecr-output.json 2>/dev/null; then
    ECR_URI=$(cat /tmp/ecr-output.json | jq -r '.repository.repositoryUri')
    echo -e "${GREEN}✓ ECR Repository created${NC}"
    echo "  Repository URI: $ECR_URI"
    
    # Update .env with ECR URI
    sed -i.bak "s|ECR_REPOSITORY_URI=.*|ECR_REPOSITORY_URI=$ECR_URI|" .env
    echo -e "${GREEN}✓ Updated ECR_REPOSITORY_URI in .env${NC}"
else
    echo -e "${YELLOW}ECR Repository already exists or error occurred${NC}"
    # Try to get existing repository URI
    if aws ecr describe-repositories --repository-names cygni-builds --region $AWS_REGION > /tmp/ecr-output.json 2>/dev/null; then
        ECR_URI=$(cat /tmp/ecr-output.json | jq -r '.repositories[0].repositoryUri')
        echo "  Existing Repository URI: $ECR_URI"
        sed -i.bak "s|ECR_REPOSITORY_URI=.*|ECR_REPOSITORY_URI=$ECR_URI|" .env
        echo -e "${GREEN}✓ Updated ECR_REPOSITORY_URI in .env${NC}"
    fi
fi

# Create S3 Bucket
echo -e "\n${YELLOW}Creating S3 Bucket...${NC}"
BUCKET_NAME="cygni-build-artifacts-${AWS_ACCOUNT_ID}"
if aws s3api create-bucket \
    --bucket $BUCKET_NAME \
    --region $AWS_REGION \
    --acl private 2>/dev/null; then
    echo -e "${GREEN}✓ S3 Bucket created: $BUCKET_NAME${NC}"
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket $BUCKET_NAME \
        --versioning-configuration Status=Enabled
    echo -e "${GREEN}✓ Versioning enabled${NC}"
    
    # Update .env with bucket name
    sed -i.bak "s|S3_BUCKET_NAME=.*|S3_BUCKET_NAME=$BUCKET_NAME|" .env
    echo -e "${GREEN}✓ Updated S3_BUCKET_NAME in .env${NC}"
else
    echo -e "${YELLOW}S3 Bucket already exists or error occurred${NC}"
    # Check if bucket exists
    if aws s3api head-bucket --bucket $BUCKET_NAME 2>/dev/null; then
        echo "  Bucket exists: $BUCKET_NAME"
        sed -i.bak "s|S3_BUCKET_NAME=.*|S3_BUCKET_NAME=$BUCKET_NAME|" .env
        echo -e "${GREEN}✓ Updated S3_BUCKET_NAME in .env${NC}"
    fi
fi

# Create DynamoDB table for build metadata (optional)
echo -e "\n${YELLOW}Creating DynamoDB table for build metadata...${NC}"
if aws dynamodb create-table \
    --table-name cygni-builds \
    --attribute-definitions \
        AttributeName=buildId,AttributeType=S \
        AttributeName=projectId,AttributeType=S \
    --key-schema \
        AttributeName=buildId,KeyType=HASH \
    --global-secondary-indexes \
        "IndexName=ProjectIndex,Keys=[{AttributeName=projectId,KeyType=HASH},{AttributeName=buildId,KeyType=RANGE}],Projection={ProjectionType=ALL},BillingMode=PAY_PER_REQUEST" \
    --billing-mode PAY_PER_REQUEST \
    --region $AWS_REGION >/dev/null 2>&1; then
    echo -e "${GREEN}✓ DynamoDB table created${NC}"
else
    echo -e "${YELLOW}DynamoDB table already exists or error occurred${NC}"
fi

# Create CloudWatch Log Groups
echo -e "\n${YELLOW}Creating CloudWatch Log Groups...${NC}"
for log_group in "/cygni/api" "/cygni/builder" "/cygni/builds"; do
    if aws logs create-log-group --log-group-name $log_group --region $AWS_REGION 2>/dev/null; then
        echo -e "${GREEN}✓ Created log group: $log_group${NC}"
    else
        echo -e "${YELLOW}  Log group $log_group already exists${NC}"
    fi
done

# Display summary
echo -e "\n${GREEN}AWS Resources Setup Complete!${NC}"
echo -e "\nResources created/verified:"
echo "✓ ECR Repository: cygni-builds"
echo "✓ S3 Bucket: $BUCKET_NAME"
echo "✓ DynamoDB Table: cygni-builds (optional)"
echo "✓ CloudWatch Log Groups"

echo -e "\n${YELLOW}Updated .env file with:${NC}"
grep -E "(ECR_REPOSITORY_URI|S3_BUCKET_NAME|AWS_ACCOUNT_ID)" .env

# Test ECR login
echo -e "\n${YELLOW}Testing ECR login...${NC}"
if aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI 2>/dev/null; then
    echo -e "${GREEN}✓ Successfully authenticated with ECR${NC}"
else
    echo -e "${YELLOW}⚠ Could not authenticate with ECR (Docker may not be running)${NC}"
fi

# Clean up
rm -f /tmp/ecr-output.json

echo -e "\n${GREEN}Setup complete! Your AWS resources are ready.${NC}"
echo -e "\nNext steps:"
echo "1. Run 'pnpm run build' to build the services"
echo "2. Run './scripts/smoke-test.sh' to test the setup"
echo "3. Deploy to ECS when ready"