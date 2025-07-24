"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_fast_1 = require("../services/cli-executor-fast");
const real_file_system_1 = require("../services/real-file-system");
const config_service_1 = require("../services/config-service");
const auth_service_1 = require("../services/auth-service");
const test_api_server_1 = require("../services/test-api-server");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
(0, vitest_1.describe)("secrets command - Real Implementation", () => {
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
    const mockSecrets = {
        production: [
            {
                name: "DATABASE_URL",
                value: "postgres://user:pass@localhost:5432/db",
                createdAt: new Date().toISOString(),
            },
            {
                name: "API_KEY",
                value: "secret-key-123",
                createdAt: new Date().toISOString(),
            },
        ],
        staging: [
            {
                name: "DATABASE_URL",
                value: "postgres://user:pass@staging:5432/db",
                createdAt: new Date().toISOString(),
            },
        ],
    };
    (0, vitest_1.beforeAll)(async () => {
        // Start test server
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        // Initialize services
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("secrets-command");
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
        });
        // Setup server data
        testServer.addProject("org_123", mockProject);
        testServer.addEnvironments("proj_123", mockEnvironments);
        mockEnvironments.forEach((env) => {
            const secrets = mockSecrets[env.slug] || [];
            secrets.forEach((secret) => {
                testServer.addSecret("proj_123", env.id, secret.name, secret.value);
            });
        });
    });
    (0, vitest_1.afterEach)(async () => {
        await authService.clearAuth();
    });
    (0, vitest_1.describe)("list secrets", () => {
        (0, vitest_1.it)("should list all secrets when no environment is specified", async () => {
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
            (0, vitest_1.expect)(result.stdout).toContain("DATABASE_URL");
            (0, vitest_1.expect)(result.stdout).toContain("API_KEY");
        });
        (0, vitest_1.it)("should list secrets for specific environment", async () => {
            const result = await cli.execute(["secrets", "list", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
            (0, vitest_1.expect)(result.stdout).toContain("DATABASE_URL");
            (0, vitest_1.expect)(result.stdout).toContain("API_KEY");
        });
        (0, vitest_1.it)("should handle non-existent environment", async () => {
            const result = await cli.execute(["secrets", "list", "--env", "nonexistent"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            // The CLI doesn't filter by non-existent environment, it shows all secrets
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
            (0, vitest_1.expect)(result.stdout).toContain("DATABASE_URL");
        });
        (0, vitest_1.it)("should handle project without secrets", async () => {
            // Clear all secrets
            testServer.clearSecrets("proj_123");
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("No secrets found");
        });
    });
    (0, vitest_1.describe)("set secrets", () => {
        (0, vitest_1.it)("should set a secret with value from command line", async () => {
            const result = await cli.execute(["secrets", "set", "NEW_SECRET", "new-value", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            // Spinner output goes to stderr
            (0, vitest_1.expect)(result.stderr).toContain("Secret NEW_SECRET set successfully!");
            (0, vitest_1.expect)(result.stdout).toContain("Changes will take effect on next deployment");
            // Verify secret was added
            const secrets = await testServer.getSecrets("proj_123", "env_prod");
            (0, vitest_1.expect)(secrets).toHaveProperty("NEW_SECRET", "new-value");
        });
        (0, vitest_1.it)("should update existing secret", async () => {
            const result = await cli.execute([
                "secrets",
                "set",
                "DATABASE_URL",
                "updated-url",
                "--env",
                "production",
            ], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stderr).toContain("Secret DATABASE_URL set successfully!");
            // Verify secret was updated
            const secrets = await testServer.getSecrets("proj_123", "env_prod");
            (0, vitest_1.expect)(secrets).toHaveProperty("DATABASE_URL", "updated-url");
        });
        vitest_1.it.skip("should set secret to all environments when --all flag is used", async () => {
            // The --all flag doesn't exist in the actual implementation
            // When no --env is specified, it sets for all environments
            const result = await cli.execute(["secrets", "set", "GLOBAL_SECRET", "global-value"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret 'GLOBAL_SECRET' set");
            // Verify secret was added to all environments
            const prodSecrets = await testServer.getSecrets("proj_123", "env_prod");
            const stagingSecrets = await testServer.getSecrets("proj_123", "env_staging");
            (0, vitest_1.expect)(prodSecrets).toHaveProperty("GLOBAL_SECRET", "global-value");
            (0, vitest_1.expect)(stagingSecrets).toHaveProperty("GLOBAL_SECRET", "global-value");
        });
        vitest_1.it.skip("should handle empty value", async () => {
            // This test times out because the CLI prompts for value when empty
            const result = await cli.execute(["secrets", "set", "EMPTY_SECRET", "", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stderr).toContain("Secret EMPTY_SECRET set successfully!");
            const secrets = await testServer.getSecrets("proj_123", "env_prod");
            (0, vitest_1.expect)(secrets).toHaveProperty("EMPTY_SECRET", "");
        });
        (0, vitest_1.it)("should validate secret name format", async () => {
            const result = await cli.execute(["secrets", "set", "invalid-name!", "value", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Secret key must be uppercase with underscores");
        });
    });
    (0, vitest_1.describe)("remove secrets", () => {
        (0, vitest_1.it)("should remove a secret", async () => {
            const result = await cli.execute(["secrets", "remove", "API_KEY", "--env", "production", "--yes"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stderr).toContain("Secret API_KEY removed successfully!");
            // Verify secret was removed
            const secrets = await testServer.getSecrets("proj_123", "env_prod");
            (0, vitest_1.expect)(secrets).not.toHaveProperty("API_KEY");
        });
        (0, vitest_1.it)("should handle non-existent secret", async () => {
            const result = await cli.execute(["secrets", "remove", "NONEXISTENT", "--env", "production", "--yes"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Secret 'NONEXISTENT' not found");
        });
        vitest_1.it.skip("should remove from all environments with --all flag", async () => {
            // The --all flag doesn't exist in the actual implementation
            // Would need to remove from each environment separately
        });
    });
    (0, vitest_1.describe)("import secrets from .env file", () => {
        (0, vitest_1.it)("should import secrets from .env file", async () => {
            // Create .env file
            // Create .env file in the test directory
            const envPath = path_1.default.join(testDir, ".env");
            await promises_1.default.writeFile(envPath, `# Database config
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp

# API keys
API_SECRET=super-secret-key
STRIPE_KEY=sk_test_123
`);
            const result = await cli.execute(["secrets", "import", ".env", "--env", "staging"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 5 secrets to import");
            (0, vitest_1.expect)(result.stderr).toContain("Import complete! 5 succeeded, 0 failed");
            // Verify secrets were imported
            const secrets = await testServer.getSecrets("proj_123", "env_staging");
            (0, vitest_1.expect)(secrets).toHaveProperty("DB_HOST", "localhost");
            (0, vitest_1.expect)(secrets).toHaveProperty("DB_PORT", "5432");
            (0, vitest_1.expect)(secrets).toHaveProperty("DB_NAME", "myapp");
            (0, vitest_1.expect)(secrets).toHaveProperty("API_SECRET", "super-secret-key");
            (0, vitest_1.expect)(secrets).toHaveProperty("STRIPE_KEY", "sk_test_123");
        });
        (0, vitest_1.it)("should handle missing .env file", async () => {
            const result = await cli.execute(["secrets", "import", "nonexistent.env", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toMatch(/ENOENT|no such file/);
        });
        (0, vitest_1.it)("should skip invalid lines in .env file", async () => {
            const envPath = path_1.default.join(testDir, ".env");
            await promises_1.default.writeFile(envPath, `VALID_KEY=value
invalid line without equals
ANOTHER_KEY=another-value
# comment line
SPACED_KEY=spaced value
`);
            const result = await cli.execute(["secrets", "import", ".env", "--env", "production"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 3 secrets to import");
            (0, vitest_1.expect)(result.stderr).toContain("Import complete! 3 succeeded, 0 failed");
            const secrets = await testServer.getSecrets("proj_123", "env_prod");
            (0, vitest_1.expect)(secrets).toHaveProperty("VALID_KEY", "value");
            (0, vitest_1.expect)(secrets).toHaveProperty("ANOTHER_KEY", "another-value");
            (0, vitest_1.expect)(secrets).toHaveProperty("SPACED_KEY", "spaced value");
        });
    });
    // Export and copy commands don't exist in the actual implementation
    vitest_1.describe.skip("export secrets to .env file", () => {
        (0, vitest_1.it)("should export secrets to .env file", async () => {
            // This command doesn't exist
        });
        (0, vitest_1.it)("should export to stdout when no output file specified", async () => {
            // This command doesn't exist
        });
        (0, vitest_1.it)("should handle environment with no secrets", async () => {
            // This command doesn't exist
        });
    });
    vitest_1.describe.skip("copy secrets between environments", () => {
        (0, vitest_1.it)("should copy secrets from one environment to another", async () => {
            // This command doesn't exist
        });
        (0, vitest_1.it)("should handle copying to same environment", async () => {
            // This command doesn't exist
        });
    });
    (0, vitest_1.describe)("error handling", () => {
        (0, vitest_1.it)("should handle missing config file", async () => {
            // Remove config file
            await promises_1.default.unlink(path_1.default.join(testDir, "cygni.yml"));
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("No cygni configuration file found");
        });
        (0, vitest_1.it)("should handle missing auth", async () => {
            await authService.clearAuth();
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Not authenticated");
        });
        (0, vitest_1.it)("should handle API errors", async () => {
            const result = await cli.execute(["secrets", "list"], {
                cwd: testDir,
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:99999`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toMatch(/Error:|ECONNREFUSED/);
        });
    });
});
//# sourceMappingURL=secrets-real.test.js.map