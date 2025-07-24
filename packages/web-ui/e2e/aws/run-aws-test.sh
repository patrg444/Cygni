#!/bin/bash

# AWS E2E Test Runner
# This script runs the complete AWS deployment E2E test

set -e  # Exit on error

echo "🚀 Cygni AWS E2E Test Runner"
echo "============================"
echo ""

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$SCRIPT_DIR/../../../.."

# 1. Verify setup
echo "📋 Step 1: Verifying prerequisites..."
cd "$SCRIPT_DIR/../.."
npm run test:e2e:aws:verify

# 2. Build CLI if needed
echo ""
echo "🔨 Step 2: Building CLI..."
cd "$ROOT_DIR/packages/cli"
if [ ! -f "dist/index.js" ]; then
  echo "Building CLI..."
  npm run build
else
  echo "CLI already built ✓"
fi

# 3. Build test utilities
echo ""
echo "🔧 Step 3: Building test utilities..."
if [ ! -f "dist/tests/services/test-api-server.js" ]; then
  echo "Building test utilities..."
  npm run build:test-utils
else
  echo "Test utilities already built ✓"
fi

# 4. Install Playwright browsers if needed
echo ""
echo "🌐 Step 4: Ensuring Playwright browsers are installed..."
cd "$ROOT_DIR/packages/web-ui"
npx playwright install chromium

# 5. Run the test
echo ""
echo "🧪 Step 5: Running AWS E2E test..."
echo "⚠️  This will create real AWS resources and incur costs!"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm run test:e2e:aws
else
  echo "Test cancelled."
  exit 0
fi