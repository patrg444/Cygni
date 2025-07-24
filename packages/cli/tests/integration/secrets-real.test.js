"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const cli_executor_1 = require("../services/cli-executor");
const real_file_system_1 = require("../services/real-file-system");
const localstack_1 = require("../utils/localstack");
const os_1 = __importDefault(require("os"));
(0, vitest_1.describe)("Secrets Command - Real Integration Tests", () => {
    let testServer;
    let serverPort;
    let cli;
    let fileSystem;
    let testDir;
    let originalApiUrl;
    let originalHome;
    let localStack;
    let useLocalStack = process.env.USE_LOCALSTACK === "true";
    (0, vitest_1.beforeAll)(async () => {
        // Start LocalStack if requested
        if (useLocalStack) {
            localStack = new localstack_1.LocalStackManager({ services: ["secretsmanager"] });
            const credentials = await localStack.start();
            // Set environment variables for AWS SDK
            process.env.LOCALSTACK_ENDPOINT = credentials.endpoint;
            process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
            process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
            process.env.AWS_REGION = credentials.region;
        }
        // Start test server with LocalStack support
        testServer = new test_api_server_1.TestApiServer(useLocalStack);
        serverPort = await testServer.start();
        // Save original settings
        originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
        originalHome = os_1.default.homedir();
        // Set test API URL
        process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
        // Initialize services
        cli = new cli_executor_1.CliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("secrets-command");
    });
    (0, vitest_1.afterAll)(async () => {
        // Restore original settings
        if (originalApiUrl) {
            process.env.CLOUDEXPRESS_API_URL = originalApiUrl;
        }
        else {
            delete process.env.CLOUDEXPRESS_API_URL;
        }
        // Stop test server
        await testServer.stop();
        // Stop LocalStack if running
        if (localStack) {
            await localStack.stop();
            delete process.env.LOCALSTACK_ENDPOINT;
            delete process.env.AWS_ACCESS_KEY_ID;
            delete process.env.AWS_SECRET_ACCESS_KEY;
            delete process.env.AWS_REGION;
        }
        // Cleanup
        await fileSystem.cleanup();
    });
    (0, vitest_1.beforeEach)(async () => {
        // Create test directory with mock home
        testDir = await fileSystem.createTestDir();
        const mockHome = await fileSystem.createMockHome();
        // Create auth file in mock home
        await fileSystem.createStructure({
            home: {
                ".cygni": {
                    "auth.json": JSON.stringify({
                        token: "test-token-123",
                        email: "test@example.com",
                        organizations: [],
                    }),
                },
            },
        });
        // Create cygni.yml config
        await fileSystem.createFile("cygni.yml", `
name: test-project
projectId: proj_123
framework: nextjs
services:
  web:
    build:
      command: npm run build
    start:
      command: npm start
      port: 3000
`);
        // Reset server data
        testServer.clearData();
    });
    (0, vitest_1.describe)("Set Secret", () => {
        (0, vitest_1.it)("should set a secret with provided value", async () => {
            const result = await cli.execute(["secrets", "set", "DATABASE_URL", "postgres://localhost:5432/mydb"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret DATABASE_URL set successfully!");
            (0, vitest_1.expect)(result.stdout).toContain("Changes will take effect on next deployment");
        });
        (0, vitest_1.it)("should prompt for value when not provided", async () => {
            const result = await cli.executeInteractive(["secrets", "set", "API_KEY"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Enter value for API_KEY:",
                        response: "my-secret-api-key",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret API_KEY set successfully!");
        });
        (0, vitest_1.it)("should validate secret key format", async () => {
            const result = await cli.execute(["secrets", "set", "invalid-key", "value"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Secret key must be uppercase with underscores");
        });
        (0, vitest_1.it)("should validate various invalid key formats", async () => {
            const invalidKeys = [
                "lowercase",
                "123_START",
                "KEY-WITH-DASH",
                "KEY WITH SPACE",
                "key.with.dots",
            ];
            for (const key of invalidKeys) {
                const result = await cli.execute(["secrets", "set", key, "value"], {
                    cwd: testDir,
                    env: {
                        HOME: fileSystem.getPath("home"),
                        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    },
                });
                (0, vitest_1.expect)(result.code).toBe(1);
                (0, vitest_1.expect)(result.stderr).toContain("Secret key must be uppercase");
            }
        });
        (0, vitest_1.it)("should accept valid key formats", async () => {
            const validKeys = [
                "API_KEY",
                "DATABASE_URL",
                "SECRET_KEY_123",
                "_PRIVATE_KEY",
                "A",
                "VERY_LONG_SECRET_KEY_NAME_WITH_MANY_UNDERSCORES",
            ];
            for (const key of validKeys) {
                const result = await cli.execute(["secrets", "set", key, "test-value"], {
                    cwd: testDir,
                    env: {
                        HOME: fileSystem.getPath("home"),
                        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    },
                });
                (0, vitest_1.expect)(result.code).toBe(0);
                (0, vitest_1.expect)(result.stdout).toContain(`Secret ${key} set successfully!`);
            }
        });
    });
    (0, vitest_1.describe)("List Secrets", () => {
        (0, vitest_1.it)("should list all secrets", async () => {
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
            (0, vitest_1.expect)(result.stdout).toContain("DATABASE_URL");
            (0, vitest_1.expect)(result.stdout).toContain("postgres://***");
            (0, vitest_1.expect)(result.stdout).toContain("API_KEY");
            (0, vitest_1.expect)(result.stdout).toContain("sk-***");
            (0, vitest_1.expect)(result.stdout).toContain("Total: 2 secrets");
        });
        (0, vitest_1.it)("should show values with --show-values flag", async () => {
            const result = await cli.execute(["secrets", "list", "--show-values"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            // In real implementation, this would show actual values
            // Our test server doesn't implement this, but the flag should be accepted
            (0, vitest_1.expect)(result.stderr).not.toContain("unknown option");
        });
    });
    (0, vitest_1.describe)("Remove Secret", () => {
        (0, vitest_1.it)("should remove a secret with confirmation", async () => {
            const result = await cli.executeInteractive(["secrets", "remove", "API_KEY"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Are you sure you want to remove API_KEY?",
                        response: "y",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret API_KEY removed successfully!");
        });
        (0, vitest_1.it)("should cancel removal when user says no", async () => {
            const result = await cli.executeInteractive(["secrets", "remove", "API_KEY"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Are you sure you want to remove API_KEY?",
                        response: "n",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Cancelled");
        });
        (0, vitest_1.it)("should skip confirmation with --yes flag", async () => {
            const result = await cli.execute(["secrets", "remove", "API_KEY", "--yes"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret API_KEY removed successfully!");
            (0, vitest_1.expect)(result.stdout).not.toContain("Are you sure");
        });
    });
    (0, vitest_1.describe)("Import Secrets", () => {
        (0, vitest_1.it)("should import secrets from .env file", async () => {
            // Create .env file
            await fileSystem.createFile(".env", `
# Database configuration
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
API_KEY=sk-1234567890abcdef
SECRET_KEY=my-secret-key-value

# Invalid keys that should be ignored
invalid-key=should-be-ignored
123_INVALID=also-ignored
`);
            const result = await cli.execute(["secrets", "import", ".env"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 3 secrets to import");
            (0, vitest_1.expect)(result.stdout).toContain("Import complete!");
        });
        (0, vitest_1.it)("should handle empty .env file", async () => {
            await fileSystem.createFile(".env", "# Only comments\n\n");
            const result = await cli.execute(["secrets", "import", ".env"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("No valid secrets found in file");
        });
        (0, vitest_1.it)("should handle missing .env file", async () => {
            const result = await cli.execute(["secrets", "import", "nonexistent.env"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Error:");
        });
        (0, vitest_1.it)("should parse complex .env file correctly", async () => {
            await fileSystem.createFile(".env", `
# Comments should be ignored
DATABASE_URL="postgres://user:pass@localhost:5432/mydb"
API_KEY='single-quoted-value'
MULTILINE_VALUE="line1\\nline2\\nline3"
EMPTY_VALUE=
SPACES_VALUE=   trimmed   
SPECIAL_CHARS=!@#$%^&*()
URL_WITH_EQUALS=https://example.com?param=value&other=123
`);
            const result = await cli.execute(["secrets", "import", ".env"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("secrets to import");
        });
    });
    (0, vitest_1.describe)("Authentication", () => {
        (0, vitest_1.it)("should fail when not authenticated", async () => {
            // Remove auth file
            await fileSystem.remove("home/.cygni/auth.json");
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Not authenticated");
            (0, vitest_1.expect)(result.stderr).toContain("cygni login");
        });
    });
    (0, vitest_1.describe)("Project Resolution", () => {
        (0, vitest_1.it)("should use project from config file", async () => {
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            // Test server expects proj_123 from our config
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
        });
        (0, vitest_1.it)("should handle missing config file", async () => {
            // Remove config file
            await fileSystem.remove("cygni.yml");
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("No project found");
        });
        (0, vitest_1.it)("should use --project option when provided", async () => {
            const result = await cli.execute(["secrets", "list", "--project", "test-project"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
        });
    });
});
//# sourceMappingURL=secrets-real.test.js.map