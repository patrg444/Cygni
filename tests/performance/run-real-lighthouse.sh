#!/bin/bash

echo "🚀 Starting Real Lighthouse Performance Audit"
echo ""

# Start the TestApiServer for API endpoints
echo "📡 Starting TestApiServer..."
PROJECT_DIR=$(pwd)
cd packages/cli

# Build the CLI if needed
if [ ! -d "dist" ]; then
    echo "   Building CLI..."
    npm run build
fi

# Start test server
cat > /tmp/start-test-server.ts << EOF
import { TestApiServer } from '${PROJECT_DIR}/packages/cli/tests/services/test-api-server';

const server = new TestApiServer();
server.start(3333).then(() => {
  console.log('TestApiServer started on port 3333');
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});
EOF

npx tsx /tmp/start-test-server.ts &
API_SERVER_PID=$!
cd $PROJECT_DIR

# Wait for API server
sleep 3

# Build and start web-ui
echo "🌐 Starting web-ui server..."
cd packages/web-ui

# Always build to ensure latest
echo "   Building web-ui..."
npm run build

# Start the production server
npm start &
UI_SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for servers to be ready..."
sleep 10

# Check if server is responding
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Web UI server is not responding on port 3000"
    kill $API_SERVER_PID 2>/dev/null
    kill $UI_SERVER_PID 2>/dev/null
    rm /tmp/start-test-server.ts
    exit 1
fi

echo "✅ Servers are ready"
echo ""

# Run the Lighthouse test
echo "🏃 Running Lighthouse audit..."
echo ""
node tests/lighthouse-real.js

# Save exit code
TEST_EXIT_CODE=$?

# Cleanup
echo ""
echo "🛑 Stopping servers..."
kill $API_SERVER_PID 2>/dev/null
kill $UI_SERVER_PID 2>/dev/null
rm /tmp/start-test-server.ts

# Show summary
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "🎉 Lighthouse audit completed successfully!"
else
    echo ""
    echo "❌ Lighthouse audit failed or performance score < 90"
fi

exit $TEST_EXIT_CODE