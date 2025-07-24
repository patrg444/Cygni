"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const real_file_system_1 = require("../services/real-file-system");
const cli_executor_1 = require("../services/cli-executor");
(0, vitest_1.describe)("Real Services Test", () => {
    (0, vitest_1.it)("Test API Server should start and respond", async () => {
        const server = new test_api_server_1.TestApiServer();
        const port = await server.start();
        (0, vitest_1.expect)(port).toBeGreaterThan(0);
        // Test login endpoint
        const response = await fetch(`http://localhost:${port}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "test@example.com",
                password: "password123",
            }),
        });
        (0, vitest_1.expect)(response.status).toBe(200);
        const data = await response.json();
        (0, vitest_1.expect)(data.token).toMatch(/^test-token-/);
        (0, vitest_1.expect)(data.user.email).toBe("test@example.com");
        await server.stop();
    });
    (0, vitest_1.it)("Real File System should create and read files", async () => {
        const fs = new real_file_system_1.RealFileSystem("test");
        const testDir = await fs.createTestDir();
        await fs.createFile("test.txt", "Hello World");
        const content = await fs.readFile("test.txt");
        (0, vitest_1.expect)(content).toBe("Hello World");
        await fs.cleanup();
    });
    (0, vitest_1.it)("CLI Executor should build and run CLI", async () => {
        const cli = new cli_executor_1.CliExecutor();
        await cli.ensureBuilt();
        const result = await cli.execute(["--version"]);
        (0, vitest_1.expect)(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
});
//# sourceMappingURL=test-real-services.test.js.map