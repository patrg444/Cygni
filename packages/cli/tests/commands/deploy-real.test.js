"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_fast_1 = require("../services/cli-executor-fast");
const real_file_system_1 = require("../services/real-file-system");
const config_service_1 = require("../services/config-service");
const auth_service_1 = require("../services/auth-service");
const test_api_server_1 = require("../services/test-api-server");
(0, vitest_1.describe)("deploy command - Real Implementation", () => {
    // Tests for both CloudExpress deploy and AWS deploy:aws commands
    let cli;
    let fileSystem;
    let testDir;
    let testHome;
    let configService;
    let authService;
    let testServer;
    let serverPort;
    const mockProject = {
        id: "proj_123",
        name: "test-project",
        slug: "test-project",
    };
    const mockEnvironments = [
        { id: "env_prod", name: "production", slug: "production" },
        { id: "env_staging", name: "staging", slug: "staging" },
    ];
    const mockDeployments = [
        {
            id: "deploy_123",
            projectId: "proj_123",
            environment: "production",
            version: "v1.0.0",
            commitSha: "abc123",
            status: "completed",
            url: "https://test-project.cygni.app",
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            healthStatus: "healthy",
            strategy: "rolling",
            build: {
                imageUrl: "123456.dkr.ecr.us-east-1.amazonaws.com/test-project:v1.0.0",
            },
        },
        {
            id: "deploy_122",
            projectId: "proj_123",
            environment: "production",
            version: "v0.9.0",
            commitSha: "def456",
            status: "completed",
            url: "https://test-project.cygni.app",
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            completedAt: new Date(Date.now() - 86400000).toISOString(),
            healthStatus: "healthy",
            strategy: "rolling",
            build: {
                imageUrl: "123456.dkr.ecr.us-east-1.amazonaws.com/test-project:v0.9.0",
            },
        },
    ];
    (0, vitest_1.beforeAll)(async () => {
        // Start test server
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        // Initialize services
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("deploy-command");
    });
    (0, vitest_1.afterAll)(async () => {
        await testServer.stop();
        await fileSystem.cleanup();
    });
    (0, vitest_1.beforeEach)(async () => {
        // Create test directories
        testDir = await fileSystem.createTestDir("project");
        testHome = await fileSystem.createTestDir("home");
        configService = new config_service_1.ConfigService(testDir);
        authService = new auth_service_1.AuthService(testHome);
        // Reset server data
        testServer.clearData();
        // Setup default auth
        const auth = {
            token: "test-token-123",
            email: "test@example.com",
            organizations: [
                { id: "org_123", name: "Test Org", slug: "test-org", role: "owner" },
            ],
        };
        await authService.saveAuth(auth);
        // Setup project config
        await configService.saveConfig({
            name: "test-project",
            projectId: "proj_123",
            framework: "nextjs",
            deploy: {
                build: "npm run build",
                start: "npm start",
                port: 3000,
            },
        });
        // Setup server data
        testServer.addProject("org_123", mockProject);
        testServer.addEnvironments("proj_123", mockEnvironments);
        testServer.addDeployments("proj_123", mockDeployments);
    });
    (0, vitest_1.afterEach)(async () => {
        await authService.clearAuth();
    });
    (0, vitest_1.describe)("deploy command (CloudExpress)", () => {
        (0, vitest_1.it)("should deploy to CloudExpress platform", async () => {
            // Create a git repo for the test
            await cli.execute(["git", "init"], { cwd: testDir });
            await cli.execute(["git", "config", "user.email", "test@example.com"], {
                cwd: testDir,
            });
            await cli.execute(["git", "config", "user.name", "Test User"], {
                cwd: testDir,
            });
            await fileSystem.createFile("index.js", 'console.log("Hello World");');
            await cli.execute(["git", "add", "."], { cwd: testDir });
            await cli.execute(["git", "commit", "-m", "Initial commit"], {
                cwd: testDir,
            });
            const result = await cli.execute(["deploy", "--health-gate", "off"], // Disable health checks for test
            {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            if (result.code !== 0) {
                console.log("STDOUT:", result.stdout);
                console.log("STDERR:", result.stderr);
            }
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Deploying to CloudExpress");
            (0, vitest_1.expect)(result.stdout).toContain("Deployment initiated!");
        });
        (0, vitest_1.it)("should support rollback", async () => {
            const result = await cli.execute(["deploy", "--rollback"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                input: "n\n", // Don't confirm rollback
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Rolling back deployment");
            (0, vitest_1.expect)(result.stdout).toContain("Rollback cancelled");
        });
        (0, vitest_1.it)("should support different environments", async () => {
            // Add mock for staging environment
            testServer.addDeployment("proj_123", {
                id: "deploy_staging",
                projectId: "proj_123",
                environment: "staging",
                version: "v1.0.1",
                commitSha: "stagingsha",
                status: "completed",
                url: "https://test-project-staging.cygni.app",
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                healthStatus: "healthy",
                strategy: "rolling",
                build: {
                    imageUrl: "123456.dkr.ecr.us-east-1.amazonaws.com/test-project:v1.0.1-staging",
                },
            });
            const result = await cli.execute(["deploy", "--env", "staging"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Environment: staging");
        });
        (0, vitest_1.it)("should support canary deployment strategy", async () => {
            const result = await cli.execute(["deploy", "--strategy", "canary"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Strategy: canary");
        });
        (0, vitest_1.it)("should handle health gate checks", async () => {
            const result = await cli.execute(["deploy", "--health-gate", "strict"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Checking deployment health");
            (0, vitest_1.expect)(result.stdout).toContain("Deployment is healthy");
        });
    });
    (0, vitest_1.describe)("deploy:aws command", () => {
        (0, vitest_1.it)("should require --name parameter", async () => {
            const result = await cli.execute(["deploy:aws"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("--name is required for AWS deployment");
        });
        (0, vitest_1.it)("should validate app name format", async () => {
            const result = await cli.execute(["deploy:aws", "--name", "Invalid_Name"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("App name must be lowercase alphanumeric with hyphens");
        });
        (0, vitest_1.it)("should check for AWS credentials", async () => {
            const result = await cli.execute(["deploy:aws", "--name", "test-app"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    // No AWS credentials
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stdout).toContain("AWS credentials not found");
        });
        vitest_1.it.skip("should deploy to AWS with valid credentials", async () => {
            // This test requires real AWS credentials and infrastructure
            // Skip in unit tests, but can be run in integration tests
            const result = await cli.execute(["deploy:aws", "--name", "test-app"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Deployment complete!");
        });
    });
    (0, vitest_1.describe)("deployment monitoring", () => {
        (0, vitest_1.it)("should skip health check with off setting", async () => {
            const result = await cli.execute(["deploy", "--health-gate", "off"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).not.toContain("Checking deployment health");
        });
        vitest_1.it.skip("should watch deployment logs", async () => {
            // This test requires handling streaming logs which is complex in tests
            const result = await cli.execute(["deploy", "--watch"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                timeout: 5000,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Watching deployment logs...");
        });
    });
    (0, vitest_1.describe)("AWS deployment integration", () => {
        (0, vitest_1.beforeEach)(async () => {
            // Create package.json for Node.js detection
            await fileSystem.createFile("package.json", JSON.stringify({
                name: "test-app",
                version: "1.0.0",
                scripts: {
                    start: "node index.js",
                    build: "echo 'Building...'",
                },
                dependencies: {
                    express: "^4.18.0",
                },
            }));
            // Create a simple Express app
            await fileSystem.createFile("index.js", `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
      `);
        });
        (0, vitest_1.it)("should detect runtime automatically", async () => {
            const result = await cli.execute(["deploy:aws", "--name", "test-app"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "test",
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "test",
                },
            });
            // Will fail with test credentials, but should detect runtime
            (0, vitest_1.expect)(result.stdout).toContain("Detected");
            (0, vitest_1.expect)(result.stdout).toContain("application");
        });
        vitest_1.it.skip("should rollback AWS deployment", async () => {
            // This requires a previous successful deployment
            const result = await cli.execute(["deploy:aws", "--rollback", "--name", "test-app"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Rolling back");
        });
    });
});
//# sourceMappingURL=deploy-real.test.js.map