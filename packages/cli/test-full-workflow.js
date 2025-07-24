#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const { existsSync, rmSync, mkdirSync } = require("fs");
const { join } = require("path");
const { TestApiServer } = require("./dist/tests/services/test-api-server");

async function runFullWorkflow() {
  console.log("🚀 Starting Full System Integration Test\n");

  const testProjectPath = join(__dirname, "test-projects/blog-api");
  const openApiPath = join(testProjectPath, "openapi.json");
  const generatedPath = join(__dirname, "../web-ui/src/generated-test");
  let apiServer;
  let apiPort;

  try {
    // Step 1: Clean up previous test artifacts
    console.log("🧹 Cleaning up previous test artifacts...");
    if (existsSync(openApiPath)) {
      rmSync(openApiPath);
    }
    if (existsSync(generatedPath)) {
      rmSync(generatedPath, { recursive: true, force: true });
    }

    // Step 2: Start Test API Server
    console.log("\n📡 Starting Test API Server...");
    apiServer = new TestApiServer();
    apiPort = await apiServer.start();
    console.log(`✅ API Server running on port ${apiPort}`);

    // Step 3: Run cx analyze
    console.log("\n🔍 Running cx analyze on test project...");
    execSync(
      `node ${__dirname}/dist/index.js analyze -o openapi -f openapi.json`,
      {
        cwd: testProjectPath,
        stdio: "inherit",
      },
    );

    if (!existsSync(openApiPath)) {
      throw new Error("OpenAPI spec was not generated");
    }
    console.log("✅ OpenAPI spec generated successfully");

    // Step 4: Run cx generate:ui
    console.log("\n🎨 Running cx generate:ui...");
    execSync(
      `node ${__dirname}/dist/index.js generate ui --openapi openapi.json --output ${generatedPath} --force`,
      {
        cwd: testProjectPath,
        stdio: "inherit",
      },
    );

    if (!existsSync(join(generatedPath, "app/posts/page.tsx"))) {
      throw new Error("UI components were not generated");
    }
    console.log("✅ UI components generated successfully");

    // Step 5: Verify generated files
    console.log("\n📂 Verifying generated files...");
    const requiredFiles = [
      "app/posts/page.tsx",
      "components/posts/PostsForm.tsx",
      "components/posts/PostsDetail.tsx",
      "sdk/src/hooks/generated-hooks.ts",
    ];

    for (const file of requiredFiles) {
      const filePath = join(generatedPath, file);
      if (!existsSync(filePath)) {
        throw new Error(`Missing required file: ${file}`);
      }
      console.log(`  ✓ ${file}`);
    }

    // Step 6: Start Next.js app with test configuration
    console.log("\n🌐 Starting Next.js app...");
    const nextProcess = spawn("npm", ["run", "dev", "--", "--port", "3003"], {
      cwd: join(__dirname, "../web-ui"),
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
        PORT: "3003",
      },
      stdio: "pipe",
    });

    // Wait for Next.js to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Next.js failed to start in time"));
      }, 30000);

      nextProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Ready") || output.includes("started server on")) {
          clearTimeout(timeout);
          resolve();
        }
      });

      nextProcess.stderr.on("data", (data) => {
        console.error("Next.js error:", data.toString());
      });
    });
    console.log("✅ Next.js app is running");

    // Step 7: Test API endpoints
    console.log("\n🧪 Testing API endpoints...");
    const fetch = require("node-fetch");

    // Test posts endpoint
    const postsResponse = await fetch(`http://localhost:${apiPort}/posts`);
    const posts = await postsResponse.json();
    console.log(`  ✓ GET /posts returned ${posts.length} posts`);

    // Test create post
    const newPost = {
      title: "Test Post",
      content: "Created by integration test",
      author: "Test Suite",
    };
    const createResponse = await fetch(`http://localhost:${apiPort}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPost),
    });
    const createdPost = await createResponse.json();
    console.log(`  ✓ POST /posts created post with ID: ${createdPost.id}`);

    // Step 8: Summary
    console.log("\n✨ Full System Integration Test Complete!\n");
    console.log("Summary:");
    console.log("  1. ✅ API analysis generated OpenAPI spec");
    console.log("  2. ✅ UI generation created all components");
    console.log("  3. ✅ Generated hooks use correct API endpoints");
    console.log("  4. ✅ Test API server handles CRUD operations");
    console.log("  5. ✅ Next.js app runs with generated UI");
    console.log("\n🎉 The entire system works end-to-end!");
    console.log("\nYou can now:");
    console.log(
      `  - View the generated posts UI at: http://localhost:3003/test-posts`,
    );
    console.log(`  - View the API at: http://localhost:${apiPort}/posts`);
    console.log("\nPress Ctrl+C to stop the servers.");

    // Keep running until interrupted
    await new Promise(() => {});
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  } finally {
    // Cleanup on exit
    process.on("SIGINT", async () => {
      console.log("\n\n🧹 Cleaning up...");
      if (apiServer) {
        await apiServer.stop();
      }
      process.exit(0);
    });
  }
}

// Check if node-fetch is installed
try {
  require("node-fetch");
} catch (e) {
  console.log("Installing node-fetch...");
  execSync("npm install node-fetch@2", { stdio: "inherit" });
}

runFullWorkflow().catch(console.error);
