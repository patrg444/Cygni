"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("Login Command - Real Integration Tests", () => {
    let testServer;
    let serverPort;
    let originalApiUrl;
    const cliPath = path_1.default.join(__dirname, "../../dist/index.js");
    const authPath = path_1.default.join(os_1.default.homedir(), ".cygni", "auth.json");
    (0, vitest_1.beforeAll)(async () => {
        // Build the CLI
        await execAsync("npm run build", { cwd: path_1.default.join(__dirname, "../..") });
        // Start test server
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        // Save original API URL and set test URL
        originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
        process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
    });
    (0, vitest_1.afterAll)(async () => {
        // Restore original API URL
        if (originalApiUrl) {
            process.env.CLOUDEXPRESS_API_URL = originalApiUrl;
        }
        else {
            delete process.env.CLOUDEXPRESS_API_URL;
        }
        // Stop test server
        await testServer.stop();
    });
    (0, vitest_1.beforeEach)(async () => {
        // Clear any existing auth
        try {
            await promises_1.default.unlink(authPath);
        }
        catch {
            // File doesn't exist, that's ok
        }
        // Reset test server data
        testServer.clearData();
    });
    (0, vitest_1.describe)("Email/Password Login", () => {
        (0, vitest_1.it)("should successfully login with valid credentials", async () => {
            // Create a temporary script to handle the interactive prompts
            const scriptPath = path_1.default.join(os_1.default.tmpdir(), "login-test.js");
            const script = `
        const { spawn } = require('child_process');
        const cli = spawn('node', ['${cliPath}', 'login'], {
          env: { ...process.env, CLOUDEXPRESS_API_URL: 'http://localhost:${serverPort}' }
        });
        
        let output = '';
        cli.stdout.on('data', (data) => {
          output += data.toString();
          
          if (output.includes('Email:')) {
            cli.stdin.write('test@example.com\\n');
          } else if (output.includes('Password:')) {
            cli.stdin.write('password123\\n');
          }
        });
        
        cli.stderr.on('data', (data) => {
          console.error(data.toString());
        });
        
        cli.on('close', (code) => {
          console.log(output);
          process.exit(code);
        });
      `;
            await promises_1.default.writeFile(scriptPath, script);
            const { stdout, stderr } = await execAsync(`node ${scriptPath}`);
            // Check output
            (0, vitest_1.expect)(stdout).toContain("Logged in successfully!");
            (0, vitest_1.expect)(stdout).toContain("test@example.com");
            (0, vitest_1.expect)(stdout).toContain("Organizations:");
            (0, vitest_1.expect)(stdout).toContain("Test Org (test-org) [owner]");
            (0, vitest_1.expect)(stdout).toContain("Another Org (another-org) [member]");
            // Verify auth file was created
            const authExists = await promises_1.default
                .access(authPath)
                .then(() => true)
                .catch(() => false);
            (0, vitest_1.expect)(authExists).toBe(true);
            // Read and verify auth file contents
            const authData = JSON.parse(await promises_1.default.readFile(authPath, "utf-8"));
            (0, vitest_1.expect)(authData.email).toBe("test@example.com");
            (0, vitest_1.expect)(authData.token).toMatch(/^test-token-/);
            (0, vitest_1.expect)(authData.organizations).toHaveLength(2);
            // Verify file permissions (Unix only)
            if (process.platform !== "win32") {
                const stats = await promises_1.default.stat(authPath);
                const mode = stats.mode & parseInt("777", 8);
                (0, vitest_1.expect)(mode).toBe(parseInt("600", 8));
            }
            // Cleanup
            await promises_1.default.unlink(scriptPath);
        });
        (0, vitest_1.it)("should fail with invalid credentials", async () => {
            // Use direct command with email option to avoid interactive prompt
            try {
                await execAsync(`echo "wrong-password" | node ${cliPath} login --email invalid@example.com`, {
                    env: {
                        ...process.env,
                        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    },
                });
                // Should not reach here
                (0, vitest_1.expect)(true).toBe(false);
            }
            catch (error) {
                (0, vitest_1.expect)(error.stderr).toContain("Invalid email or password");
                (0, vitest_1.expect)(error.code).toBe(1);
            }
            // Verify no auth file was created
            const authExists = await promises_1.default
                .access(authPath)
                .then(() => true)
                .catch(() => false);
            (0, vitest_1.expect)(authExists).toBe(false);
        });
    });
    (0, vitest_1.describe)("Token Login", () => {
        (0, vitest_1.it)("should successfully login with valid API token", async () => {
            // First login to get a token
            testServer.addUser("token-user@example.com", "password");
            // Simulate a login to get a token
            const loginResponse = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "password123",
                }),
            });
            const { token } = await loginResponse.json();
            // Now use the token to login via CLI
            const { stdout } = await execAsync(`node ${cliPath} login --token ${token}`, {
                env: {
                    ...process.env,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            (0, vitest_1.expect)(stdout).toContain("Logged in successfully!");
            (0, vitest_1.expect)(stdout).toContain("test@example.com");
            // Verify auth file
            const authData = JSON.parse(await promises_1.default.readFile(authPath, "utf-8"));
            (0, vitest_1.expect)(authData.token).toBe(token);
        });
        (0, vitest_1.it)("should fail with invalid API token", async () => {
            try {
                await execAsync(`node ${cliPath} login --token invalid-token-123`, {
                    env: {
                        ...process.env,
                        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    },
                });
                (0, vitest_1.expect)(true).toBe(false);
            }
            catch (error) {
                (0, vitest_1.expect)(error.stderr).toContain("Invalid token");
                (0, vitest_1.expect)(error.code).toBe(1);
            }
        });
    });
    (0, vitest_1.describe)("Server Communication", () => {
        (0, vitest_1.it)("should handle network errors gracefully", async () => {
            // Stop the server to simulate network error
            await testServer.stop();
            try {
                await execAsync(`node ${cliPath} login --token test-token`, {
                    env: {
                        ...process.env,
                        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    },
                });
                (0, vitest_1.expect)(true).toBe(false);
            }
            catch (error) {
                (0, vitest_1.expect)(error.stderr).toContain("Error:");
                (0, vitest_1.expect)(error.code).toBe(1);
            }
            // Restart server for other tests
            serverPort = await testServer.start();
            process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
        });
        (0, vitest_1.it)("should use correct API endpoints", async () => {
            // This test verifies the actual HTTP requests are made
            const { stdout } = await execAsync(`node ${cliPath} login --token test-token-123`, {
                env: {
                    ...process.env,
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                },
            });
            // The test server will only respond correctly if the right endpoint is hit
            (0, vitest_1.expect)(stdout).toContain("Logged in successfully!");
        });
    });
    (0, vitest_1.describe)("Email Validation", () => {
        (0, vitest_1.it)("should validate email format properly", async () => {
            const invalidEmails = [
                "notanemail",
                "@example.com",
                "user@",
                "user @example.com",
                "user@.com",
            ];
            for (const email of invalidEmails) {
                try {
                    await execAsync(`echo "password" | node ${cliPath} login --email "${email}"`, {
                        env: {
                            ...process.env,
                            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                        },
                    });
                    (0, vitest_1.expect)(true).toBe(false);
                }
                catch (error) {
                    // Should fail with validation error before making API call
                    (0, vitest_1.expect)(error.stderr).toContain("valid email");
                }
            }
        });
    });
});
//# sourceMappingURL=login-real.test.js.map