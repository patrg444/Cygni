"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const cli_executor_1 = require("../services/cli-executor");
const real_file_system_1 = require("../services/real-file-system");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
(0, vitest_1.describe)("Login Command - Simple Real Tests", () => {
    let testServer;
    let serverPort;
    let cli;
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeAll)(async () => {
        // Start test server
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        // Initialize services
        cli = new cli_executor_1.CliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("login-simple");
    });
    (0, vitest_1.afterAll)(async () => {
        await testServer.stop();
        await fileSystem.cleanup();
    });
    (0, vitest_1.beforeEach)(async () => {
        testDir = await fileSystem.createTestDir();
        testServer.clearData();
    });
    (0, vitest_1.it)("should login with API token", async () => {
        // First get a token from the test server
        const response = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "test@example.com",
                password: "password123",
            }),
        });
        const { token } = await response.json();
        (0, vitest_1.expect)(token).toMatch(/^test-token-/);
        // Create a test home directory
        const testHome = await fileSystem.createTestDir("home");
        // Now use the CLI with the token
        const result = await cli.execute(["login", "--token", token], {
            env: {
                HOME: testHome,
                CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            },
        });
        console.log("CLI Result:", result);
        // Check the result
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Logged in successfully!");
        // Verify auth file was created
        const authPath = path_1.default.join(testHome, ".cygni", "auth.json");
        const authExists = await fileSystem.exists(authPath);
        (0, vitest_1.expect)(authExists).toBe(true);
        // Read and verify auth data
        const authContent = await promises_1.default.readFile(authPath, "utf-8");
        const authData = JSON.parse(authContent);
        (0, vitest_1.expect)(authData.token).toBe(token);
        (0, vitest_1.expect)(authData.email).toBe("test@example.com");
    });
    (0, vitest_1.it)("should fail with invalid token", async () => {
        const testHome = await fileSystem.createTestDir("home2");
        const result = await cli.execute(["login", "--token", "invalid-token"], {
            env: {
                HOME: testHome,
                CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            },
        });
        (0, vitest_1.expect)(result.code).toBe(1);
        (0, vitest_1.expect)(result.stderr).toContain("Invalid token");
    });
    (0, vitest_1.it)("should handle server errors", async () => {
        const testHome = await fileSystem.createTestDir("home3");
        // Use wrong port to simulate network error
        const result = await cli.execute(["login", "--token", "test-token"], {
            env: {
                HOME: testHome,
                CLOUDEXPRESS_API_URL: `http://localhost:99999`,
            },
        });
        (0, vitest_1.expect)(result.code).toBe(1);
        (0, vitest_1.expect)(result.stderr).toContain("Login failed:");
    });
});
//# sourceMappingURL=login-simple.test.js.map