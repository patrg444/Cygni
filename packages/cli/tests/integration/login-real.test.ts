import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const execAsync = promisify(exec);

describe("Login Command - Real Integration Tests", () => {
  let testServer: TestApiServer;
  let serverPort: number;
  let originalApiUrl: string | undefined;
  const cliPath = path.join(__dirname, "../../dist/index.js");
  const authPath = path.join(os.homedir(), ".cygni", "auth.json");

  beforeAll(async () => {
    // Build the CLI
    await execAsync("npm run build", { cwd: path.join(__dirname, "../..") });

    // Start test server
    testServer = new TestApiServer();
    serverPort = await testServer.start();

    // Save original API URL and set test URL
    originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
    process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
  });

  afterAll(async () => {
    // Restore original API URL
    if (originalApiUrl) {
      process.env.CLOUDEXPRESS_API_URL = originalApiUrl;
    } else {
      delete process.env.CLOUDEXPRESS_API_URL;
    }

    // Stop test server
    await testServer.stop();
  });

  beforeEach(async () => {
    // Clear any existing auth
    try {
      await fs.unlink(authPath);
    } catch {
      // File doesn't exist, that's ok
    }

    // Reset test server data
    testServer.clearData();
  });

  describe("Email/Password Login", () => {
    it("should successfully login with valid credentials", async () => {
      // Create a temporary script to handle the interactive prompts
      const scriptPath = path.join(os.tmpdir(), "login-test.js");
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

      await fs.writeFile(scriptPath, script);

      const { stdout, stderr } = await execAsync(`node ${scriptPath}`);

      // Check output
      expect(stdout).toContain("Logged in successfully!");
      expect(stdout).toContain("test@example.com");
      expect(stdout).toContain("Organizations:");
      expect(stdout).toContain("Test Org (test-org) [owner]");
      expect(stdout).toContain("Another Org (another-org) [member]");

      // Verify auth file was created
      const authExists = await fs
        .access(authPath)
        .then(() => true)
        .catch(() => false);
      expect(authExists).toBe(true);

      // Read and verify auth file contents
      const authData = JSON.parse(await fs.readFile(authPath, "utf-8"));
      expect(authData.email).toBe("test@example.com");
      expect(authData.token).toMatch(/^test-token-/);
      expect(authData.organizations).toHaveLength(2);

      // Verify file permissions (Unix only)
      if (process.platform !== "win32") {
        const stats = await fs.stat(authPath);
        const mode = stats.mode & parseInt("777", 8);
        expect(mode).toBe(parseInt("600", 8));
      }

      // Cleanup
      await fs.unlink(scriptPath);
    });

    it("should fail with invalid credentials", async () => {
      // Use direct command with email option to avoid interactive prompt
      try {
        await execAsync(
          `echo "wrong-password" | node ${cliPath} login --email invalid@example.com`,
          {
            env: {
              ...process.env,
              CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            },
          },
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.stderr).toContain("Invalid email or password");
        expect(error.code).toBe(1);
      }

      // Verify no auth file was created
      const authExists = await fs
        .access(authPath)
        .then(() => true)
        .catch(() => false);
      expect(authExists).toBe(false);
    });
  });

  describe("Token Login", () => {
    it("should successfully login with valid API token", async () => {
      // First login to get a token
      testServer.addUser("token-user@example.com", "password");

      // Simulate a login to get a token
      const loginResponse = await fetch(
        `http://localhost:${serverPort}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
          }),
        },
      );

      const { token } = await loginResponse.json();

      // Now use the token to login via CLI
      const { stdout } = await execAsync(
        `node ${cliPath} login --token ${token}`,
        {
          env: {
            ...process.env,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(stdout).toContain("Logged in successfully!");
      expect(stdout).toContain("test@example.com");

      // Verify auth file
      const authData = JSON.parse(await fs.readFile(authPath, "utf-8"));
      expect(authData.token).toBe(token);
    });

    it("should fail with invalid API token", async () => {
      try {
        await execAsync(`node ${cliPath} login --token invalid-token-123`, {
          env: {
            ...process.env,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.stderr).toContain("Invalid token");
        expect(error.code).toBe(1);
      }
    });
  });

  describe("Server Communication", () => {
    it("should handle network errors gracefully", async () => {
      // Stop the server to simulate network error
      await testServer.stop();

      try {
        await execAsync(`node ${cliPath} login --token test-token`, {
          env: {
            ...process.env,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        });
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.stderr).toContain("Error:");
        expect(error.code).toBe(1);
      }

      // Restart server for other tests
      serverPort = await testServer.start();
      process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
    });

    it("should use correct API endpoints", async () => {
      // This test verifies the actual HTTP requests are made
      const { stdout } = await execAsync(
        `node ${cliPath} login --token test-token-123`,
        {
          env: {
            ...process.env,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      // The test server will only respond correctly if the right endpoint is hit
      expect(stdout).toContain("Logged in successfully!");
    });
  });

  describe("Email Validation", () => {
    it("should validate email format properly", async () => {
      const invalidEmails = [
        "notanemail",
        "@example.com",
        "user@",
        "user @example.com",
        "user@.com",
      ];

      for (const email of invalidEmails) {
        try {
          await execAsync(
            `echo "password" | node ${cliPath} login --email "${email}"`,
            {
              env: {
                ...process.env,
                CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
              },
            },
          );
          expect(true).toBe(false);
        } catch (error: any) {
          // Should fail with validation error before making API call
          expect(error.stderr).toContain("valid email");
        }
      }
    });
  });
});
