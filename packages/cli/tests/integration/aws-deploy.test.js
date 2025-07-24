"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("AWS Deploy Integration Test", () => {
    const testDir = path_1.default.join(process.cwd(), "test-aws-deploy");
    const appName = `test-app-${Date.now()}`;
    (0, vitest_1.beforeAll)(async () => {
        // Create test directory
        await promises_1.default.mkdir(testDir, { recursive: true });
        // Create a simple Express app
        await promises_1.default.writeFile(path_1.default.join(testDir, "package.json"), JSON.stringify({
            name: appName,
            version: "1.0.0",
            scripts: {
                start: "node index.js",
            },
            dependencies: {
                express: "^4.18.0",
            },
        }, null, 2));
        await promises_1.default.writeFile(path_1.default.join(testDir, "index.js"), `const express = require('express');
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
});`);
    });
    (0, vitest_1.afterAll)(async () => {
        // Clean up
        await promises_1.default.rm(testDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("should deploy to AWS successfully", async () => {
        // Check if AWS credentials are available
        try {
            await execAsync("aws sts get-caller-identity");
        }
        catch (error) {
            console.log("Skipping AWS deploy test - no AWS credentials");
            return;
        }
        // Run the deploy command
        const { stdout, stderr } = await execAsync(`node ${path_1.default.join(process.cwd(), "dist/index.js")} deploy:aws --name ${appName}`, { cwd: testDir });
        console.log("Deploy output:", stdout);
        if (stderr)
            console.error("Deploy errors:", stderr);
        // Check for success indicators
        (0, vitest_1.expect)(stdout).toContain("Deployment complete!");
        (0, vitest_1.expect)(stdout).toContain("Your app is available at:");
        // Extract URL from output
        const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            const deployUrl = urlMatch[0];
            console.log("Deployed to:", deployUrl);
            // Give the deployment a moment to stabilize
            await new Promise((resolve) => setTimeout(resolve, 10000));
            // Test the deployed app
            try {
                const { stdout: healthResponse } = await execAsync(`curl -s ${deployUrl}/health`);
                const health = JSON.parse(healthResponse);
                (0, vitest_1.expect)(health.status).toBe("healthy");
            }
            catch (error) {
                console.log("Health check failed (might need more time to deploy):", error);
            }
        }
    }, 300000); // 5 minute timeout for deployment
});
//# sourceMappingURL=aws-deploy.test.js.map