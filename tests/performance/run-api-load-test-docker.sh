#!/bin/bash

# Script to run k6 load test using Docker

echo "🚀 Starting API Load Test (Docker version)"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start TestApiServer in background
echo "📡 Starting TestApiServer..."
cd packages/cli
npm run build > /dev/null 2>&1

# Create a temporary test script to start the server
cat > /tmp/start-test-server.js << 'EOF'
const { TestApiServer } = require('./dist/lib/test-api-server.js');

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

# Start the server
node /tmp/start-test-server.js &
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

# Run k6 test using Docker
echo "🏃 Running k6 load test..."
echo "   • 20 concurrent users"
echo "   • 60 seconds duration"
echo "   • Target: 100+ requests/second"
echo ""

# Note: host.docker.internal allows Docker container to access host's localhost
docker run --rm \
  -v $(pwd)/tests/performance:/scripts \
  -e BASE_URL=http://host.docker.internal:3333 \
  -e PROJECT_ID=perf-test-project \
  grafana/k6 run /scripts/api-load-test.js

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
else
    echo ""
    echo "❌ Load test failed!"
    echo "   Check the output above for details"
fi

exit $TEST_EXIT_CODE