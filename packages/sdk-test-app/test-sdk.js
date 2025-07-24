const { TestApiServer } = require("../cli/dist/tests/services/test-api-server");
const { spawn } = require("child_process");

async function runTest() {
  console.log("Starting test API server...");

  // Start the test API server
  const apiServer = new TestApiServer();
  const apiPort = await apiServer.start();

  console.log(`Test API server running on port ${apiPort}`);

  // Set environment variable for Next.js app
  process.env.NEXT_PUBLIC_API_URL = `http://localhost:${apiPort}`;

  console.log("Starting Next.js app...");

  // Start Next.js dev server
  const nextProcess = spawn("npm", ["run", "dev"], {
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
      PORT: "3001", // Run Next.js on different port
    },
    stdio: "inherit",
  });

  console.log("\n===========================================");
  console.log("Test servers are running:");
  console.log(`API Server: http://localhost:${apiPort}`);
  console.log("Next.js App: http://localhost:3001");
  console.log("Open the Next.js app in your browser to test the SDK");
  console.log("Press Ctrl+C to stop");
  console.log("===========================================\n");

  // Handle cleanup
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    nextProcess.kill();
    await apiServer.stop();
    process.exit(0);
  });
}

runTest().catch(console.error);
