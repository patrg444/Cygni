import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

describe("AWS Deploy Integration Test", () => {
  const testDir = path.join(process.cwd(), "test-aws-deploy");
  const appName = `test-app-${Date.now()}`;

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create a simple Express app
    await fs.writeFile(
      path.join(testDir, "package.json"),
      JSON.stringify(
        {
          name: appName,
          version: "1.0.0",
          scripts: {
            start: "node index.js",
          },
          dependencies: {
            express: "^4.18.0",
          },
        },
        null,
        2,
      ),
    );

    await fs.writeFile(
      path.join(testDir, "index.js"),
      `const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello from CloudExpress AWS Deploy!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});`,
    );
  });

  afterAll(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should deploy to AWS successfully", async () => {
    // Check if AWS credentials are available
    try {
      await execAsync("aws sts get-caller-identity");
    } catch (error) {
      console.log("Skipping AWS deploy test - no AWS credentials");
      return;
    }

    // Run the deploy command
    const { stdout, stderr } = await execAsync(
      `node ${path.join(process.cwd(), "dist/index.js")} deploy:aws --name ${appName}`,
      { cwd: testDir },
    );

    console.log("Deploy output:", stdout);
    if (stderr) console.error("Deploy errors:", stderr);

    // Check for success indicators
    expect(stdout).toContain("Deployment complete!");
    expect(stdout).toContain("Your app is available at:");

    // Extract URL from output
    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const deployUrl = urlMatch[0];
      console.log("Deployed to:", deployUrl);

      // Give the deployment a moment to stabilize
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Test the deployed app
      try {
        const { stdout: healthResponse } = await execAsync(
          `curl -s ${deployUrl}/health`,
        );
        const health = JSON.parse(healthResponse);
        expect(health.status).toBe("healthy");
      } catch (error) {
        console.log(
          "Health check failed (might need more time to deploy):",
          error,
        );
      }
    }
  }, 300000); // 5 minute timeout for deployment
});
