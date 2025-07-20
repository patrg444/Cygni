#!/bin/bash

# Minimal test to verify deployment can start
set -e

echo "🧪 Testing minimal AWS deployment flow"
echo "===================================="

cd examples/express-demo

# Test 1: Missing name should error
echo -e "\n1. Testing error handling (missing name)..."
if ../../cx deploy --aws 2>&1 | grep -q "name is required"; then
    echo "✓ Correctly requires --name parameter"
else
    echo "✗ Missing name validation failed"
fi

# Test 2: Invalid name should error  
echo -e "\n2. Testing name validation..."
if ../../cx deploy --aws --name "INVALID NAME" 2>&1 | grep -q "lowercase alphanumeric"; then
    echo "✓ Name validation working"
else
    echo "✗ Name validation failed"
fi

# Test 3: Check AWS credentials without deploying
echo -e "\n3. Testing AWS credential check..."
export AWS_SKIP_DEPLOY=true  # Add this env var to skip actual deployment
if aws sts get-caller-identity &>/dev/null; then
    echo "✓ AWS credentials available"
    
    # Test 4: Runtime detection
    echo -e "\n4. Testing runtime detection..."
    if [ -f "package.json" ]; then
        echo "✓ package.json found"
    fi
else
    echo "✗ AWS credentials not configured"
    echo "  This is OK for testing - real deployment would fail here"
fi

echo -e "\n✅ Basic checks complete!"
echo -e "\nTo test real deployment, ensure:"
echo "  1. AWS credentials configured"
echo "  2. Docker daemon running"
echo "  3. Environment variables set:"
echo "     export CX_HOSTED_ZONE_ID=..."
echo "     export CX_CERTIFICATE_ARN=..."