const { spawn } = require("child_process");
const { TestApiServer } = require("../cli/dist/tests/services/test-api-server");

async function runE2ETest() {
  let apiServer;
  let nextProcess;

  try {
    // Start test API server
    console.log("Starting test API server...");
    apiServer = new TestApiServer();
    const apiPort = await apiServer.start();
    console.log(`Test API server running on port ${apiPort}`);

    // Set environment variable
    process.env.NEXT_PUBLIC_API_URL = `http://localhost:${apiPort}`;

    // Start Next.js in background
    console.log("Starting Next.js app...");
    nextProcess = spawn("npm", ["run", "dev", "--", "--port", "3002"], {
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
      },
      stdio: "pipe",
    });

    // Wait for Next.js to start
    await new Promise((resolve) => {
      nextProcess.stdout.on("data", (data) => {
        const output = data.toString();
        console.log("Next.js:", output);
        if (output.includes("Ready") || output.includes("started server")) {
          resolve();
        }
      });
    });

    console.log("Running Playwright tests...");

    // Run Playwright tests
    const playwright = spawn(
      "npx",
      [
        "playwright",
        "test",
        "e2e/simple-integration.spec.ts",
        "--reporter=list",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
        },
      },
    );

    await new Promise((resolve, reject) => {
      playwright.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Playwright tests failed with code ${code}`));
        }
      });
    });

    console.log("✅ All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Cleanup
    if (nextProcess) {
      nextProcess.kill();
    }
    if (apiServer) {
      await apiServer.stop();
    }
    process.exit(0);
  }
}

runE2ETest().catch(console.error);
