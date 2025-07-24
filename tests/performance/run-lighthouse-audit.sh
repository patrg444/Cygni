#!/bin/bash

echo "🚀 Starting Real Lighthouse Performance Audit"
echo ""

# Check if the web-ui is built
if [ ! -d "packages/web-ui/dist" ]; then
    echo "📦 Building web-ui..."
    cd packages/web-ui
    npm run build
    cd ../..
fi

# Start the web-ui server in preview mode
echo "🌐 Starting web-ui server..."
cd packages/web-ui
npm run preview &
SERVER_PID=$!
cd ../..

# Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
sleep 5

# Check if server is responding
if ! curl -s http://localhost:4173 > /dev/null; then
    echo "❌ Server is not responding on port 4173"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "✅ Server is ready"
echo ""

# Install Playwright browsers if needed
echo "🎭 Ensuring Playwright browsers are installed..."
cd packages/web-ui
npx playwright install chromium

# Run the Lighthouse test
echo "🏃 Running Lighthouse audit..."
echo ""
npx playwright test tests/lighthouse-audit.spec.ts --reporter=list

# Save exit code
TEST_EXIT_CODE=$?

# Stop the server
echo ""
echo "🛑 Stopping web-ui server..."
kill $SERVER_PID 2>/dev/null

# Return the test exit code
exit $TEST_EXIT_CODE