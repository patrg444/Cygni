"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const cli_executor_1 = require("../services/cli-executor");
const real_file_system_1 = require("../services/real-file-system");
const auth_service_1 = require("../services/auth-service");
const path_1 = __importDefault(require("path"));
(0, vitest_1.describe)("login command - Real Implementation", () => {
    let testServer;
    let serverPort;
    let cli;
    let fileSystem;
    let testHome;
    let authService;
    const mockAuthData = {
        token: "test-token-123",
        user: {
            id: "user-123",
            email: "test@example.com",
        },
        organizations: [
            {
                id: "org-123",
                name: "Test Org",
                slug: "test-org",
                role: "owner",
            },
            {
                id: "org-456",
                name: "Another Org",
                slug: "another-org",
                role: "member",
            },
        ],
    };
    (0, vitest_1.beforeAll)(async () => {
        // Start real test server
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        // Initialize services
        cli = new cli_executor_1.CliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("login-command");
    });
    (0, vitest_1.afterAll)(async () => {
        await testServer.stop();
        await fileSystem.cleanup();
    });
    (0, vitest_1.beforeEach)(async () => {
        // Create test home directory
        testHome = await fileSystem.createTestDir("home");
        authService = new auth_service_1.AuthService(testHome);
        // Clear any existing auth
        await authService.clearAuth();
        // Reset server data
        testServer.clearData();
    });
    (0, vitest_1.describe)("email/password login", () => {
        (0, vitest_1.it)("should successfully login with valid credentials", async () => {
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "test@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "password123",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Logged in successfully!");
            (0, vitest_1.expect)(result.stdout).toContain("test@example.com");
            (0, vitest_1.expect)(result.stdout).toContain("Organizations:");
            (0, vitest_1.expect)(result.stdout).toContain("Test Org (test-org) [owner]");
            (0, vitest_1.expect)(result.stdout).toContain("Another Org (another-org) [member]");
            // Verify auth was saved
            const auth = await authService.loadAuth();
            (0, vitest_1.expect)(auth).toBeTruthy();
            (0, vitest_1.expect)(auth?.email).toBe("test@example.com");
            (0, vitest_1.expect)(auth?.token).toMatch(/^test-token-/);
            (0, vitest_1.expect)(auth?.organizations).toHaveLength(2);
        });
        (0, vitest_1.it)("should use email from command line option", async () => {
            const result = await cli.executeInteractive(["login", "--email", "cli@example.com"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Password:",
                        response: "password123",
                    },
                ],
            });
            // Should fail because cli@example.com is not in test data
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Invalid email or password");
        });
        (0, vitest_1.it)("should validate email format", async () => {
            // Try to pass invalid email with password to avoid interactive prompt
            const result = await cli.executeWithInput(["login", "--email", "invalid-email"], "password123", {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("valid email");
        });
        (0, vitest_1.it)("should handle invalid credentials error", async () => {
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "test@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "wrong-password",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Invalid email or password");
            // Verify no auth was saved
            const auth = await authService.loadAuth();
            (0, vitest_1.expect)(auth).toBeNull();
        });
        (0, vitest_1.it)("should handle network errors", async () => {
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:99999`, // Wrong port
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "test@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "password123",
                    },
                ],
                timeout: 5000,
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Error:");
        });
        (0, vitest_1.it)("should display organizations after successful login", async () => {
            // Add more organizations to test user
            testServer.addOrganization("user-123", {
                id: "org-789",
                name: "Third Org",
                slug: "third-org",
                role: "viewer",
            });
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "test@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "password123",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Organizations:");
            (0, vitest_1.expect)(result.stdout).toContain("Test Org (test-org) [owner]");
            (0, vitest_1.expect)(result.stdout).toContain("Another Org (another-org) [member]");
            (0, vitest_1.expect)(result.stdout).toContain("Third Org (third-org) [viewer]");
        });
    });
    (0, vitest_1.describe)("API token login", () => {
        (0, vitest_1.it)("should successfully login with valid API token", async () => {
            // First create a token via the API
            const response = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "password123",
                }),
            });
            const { token } = await response.json();
            const result = await cli.execute(["login", "--token", token], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Logged in successfully!");
            // Verify auth was saved
            const auth = await authService.loadAuth();
            (0, vitest_1.expect)(auth?.token).toBe(token);
        });
        (0, vitest_1.it)("should handle invalid API token", async () => {
            const result = await cli.execute(["login", "--token", "invalid-token-123"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Invalid token");
            // Verify no auth was saved
            const auth = await authService.loadAuth();
            (0, vitest_1.expect)(auth).toBeNull();
        });
    });
    (0, vitest_1.describe)("environment configuration", () => {
        (0, vitest_1.it)("should use custom API URL from environment", async () => {
            // Test server is already running on custom port
            const result = await cli.execute(["login", "--token", "test-token"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            // Should fail with our test server's response
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Invalid token");
        });
        (0, vitest_1.it)("should handle missing HOME directory", async () => {
            const result = await cli.execute(["login", "--token", "test-token"], {
                env: {
                    HOME: "/nonexistent/path",
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            // Will fail trying to save auth
        });
    });
    (0, vitest_1.describe)("edge cases", () => {
        (0, vitest_1.it)("should handle empty organizations array", async () => {
            // Create user without organizations
            testServer.addUser("noorg@example.com", "password123");
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "noorg@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "password123",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Logged in successfully!");
            const auth = await authService.loadAuth();
            (0, vitest_1.expect)(auth?.organizations).toEqual([]);
        });
        (0, vitest_1.it)("should handle special characters in password", async () => {
            testServer.addUser("special@example.com", "p@$$w0rd!#%");
            const result = await cli.executeInteractive(["login"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
                inputs: [
                    {
                        waitFor: "Email:",
                        response: "special@example.com",
                    },
                    {
                        waitFor: "Password:",
                        response: "p@$$w0rd!#%",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Logged in successfully!");
        });
        (0, vitest_1.it)("should handle server errors with custom messages", async () => {
            // Use wrong port to simulate connection error
            const result = await cli.execute(["login", "--token", "any-token"], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:99999`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toMatch(/Error:|ECONNREFUSED|Login failed/);
        });
    });
    (0, vitest_1.describe)("auth persistence", () => {
        (0, vitest_1.it)("should persist auth across command invocations", async () => {
            // Create a real token first
            const response = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "password123",
                }),
            });
            const { token } = await response.json();
            // Login with the token
            const result = await cli.execute(["login", "--token", token], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            // Verify auth persists
            const auth1 = await authService.loadAuth();
            // Simulate new session
            const authService2 = new auth_service_1.AuthService(testHome);
            const auth2 = await authService2.loadAuth();
            (0, vitest_1.expect)(auth1).toEqual(auth2);
            (0, vitest_1.expect)(auth2?.token).toBe(token);
        });
        (0, vitest_1.it)("should have correct file permissions on auth file", async () => {
            const response = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "password123",
                }),
            });
            const { token } = await response.json();
            await cli.execute(["login", "--token", token], {
                env: {
                    HOME: testHome,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            // Check permissions
            if (process.platform !== "win32") {
                const authPath = path_1.default.join(testHome, ".cygni", "auth.json");
                const stats = await fileSystem.stat(authPath);
                const mode = stats.mode & parseInt("777", 8);
                (0, vitest_1.expect)(mode).toBe(parseInt("600", 8));
            }
        });
    });
});
//# sourceMappingURL=login-real.test.js.map