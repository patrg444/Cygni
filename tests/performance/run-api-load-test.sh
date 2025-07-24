#!/bin/bash

# Script to run k6 load test against TestApiServer

echo "🚀 Starting API Load Test"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed. Please install it first:"
    echo "   brew install k6  (macOS)"
    echo "   or visit: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Start TestApiServer in background
echo "📡 Starting TestApiServer..."
PROJECT_DIR=$(pwd)
cd packages/cli

# Build the CLI
echo "   Building CLI..."
npm run build > /dev/null 2>&1

# Create a temporary test script to start the server
cat > /tmp/start-test-server.ts << EOF
import { TestApiServer } from '${PROJECT_DIR}/packages/cli/tests/services/test-api-server';

const server = new TestApiServer();
server.start(3333).then(() => {
  console.log('TestApiServer started on port 3333');
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Keep the process alive
process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});
EOF

# Start the server using tsx
npx tsx /tmp/start-test-server.ts &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
sleep 3

# Check if server is responding
if ! curl -s http://localhost:3333/health > /dev/null; then
    echo "❌ Server is not responding"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "✅ Server is ready"
echo ""

# Go back to project root
cd ../..

# Run k6 test
echo "🏃 Running k6 load test..."
echo "   • 20 concurrent users"
echo "   • 60 seconds duration"
echo "   • Target: 100+ requests/second"
echo ""

k6 run \
  --env BASE_URL=http://localhost:3333 \
  --env PROJECT_ID=perf-test-project \
  tests/performance/api-load-test.js

# Save exit code
TEST_EXIT_CODE=$?

# Stop the server
echo ""
echo "🛑 Stopping TestApiServer..."
kill $SERVER_PID 2>/dev/null
rm /tmp/start-test-server.js

# Check if test passed
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Load test completed successfully!"
    
    # Parse and display results from summary.json if it exists
    if [ -f summary.json ]; then
        echo ""
        echo "📊 Test Results:"
        REQUESTS_PER_SEC=$(jq -r '.requestsPerSecond' summary.json)
        ERROR_RATE=$(jq -r '.errorRate' summary.json)
        P95_RESPONSE=$(jq -r '.p95ResponseTime' summary.json)
        
        echo "   • Requests/second: ${REQUESTS_PER_SEC}"
        echo "   • Error rate: $(echo "$ERROR_RATE * 100" | bc -l | xargs printf "%.2f")%"
        echo "   • 95th percentile response time: ${P95_RESPONSE}ms"
        
        # Check if we met the target
        if (( $(echo "$REQUESTS_PER_SEC >= 100" | bc -l) )) && (( $(echo "$ERROR_RATE < 0.01" | bc -l) )); then
            echo ""
            echo "🎉 Performance target achieved!"
            echo "   ✓ Sustained 100+ requests/second"
            echo "   ✓ Error rate < 1%"
        else
            echo ""
            echo "⚠️  Performance target not met"
            if (( $(echo "$REQUESTS_PER_SEC < 100" | bc -l) )); then
                echo "   ✗ Requests/second below 100"
            fi
            if (( $(echo "$ERROR_RATE >= 0.01" | bc -l) )); then
                echo "   ✗ Error rate above 1%"
            fi
        fi
        
        rm summary.json
    fi
else
    echo ""
    echo "❌ Load test failed!"
    echo "   Check the output above for details"
fi

exit $TEST_EXIT_CODE