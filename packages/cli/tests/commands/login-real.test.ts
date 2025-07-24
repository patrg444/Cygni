import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import { AuthService } from "../services/auth-service";
import path from "path";
import os from "os";

describe("login command - Real Implementation", () => {
  let testServer: TestApiServer;
  let serverPort: number;
  let cli: CliExecutor;
  let fileSystem: RealFileSystem;
  let testHome: string;
  let authService: AuthService;

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

  beforeAll(async () => {
    // Start real test server
    testServer = new TestApiServer();
    serverPort = await testServer.start();

    // Initialize services
    cli = new CliExecutor();
    fileSystem = new RealFileSystem("login-command");
  });

  afterAll(async () => {
    await testServer.stop();
    await fileSystem.cleanup();
  });

  beforeEach(async () => {
    // Create test home directory
    testHome = await fileSystem.createTestDir("home");
    authService = new AuthService(testHome);

    // Clear any existing auth
    await authService.clearAuth();

    // Reset server data
    testServer.clearData();
  });

  describe("email/password login", () => {
    it("should successfully login with valid credentials", async () => {
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

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Logged in successfully!");
      expect(result.stdout).toContain("test@example.com");
      expect(result.stdout).toContain("Organizations:");
      expect(result.stdout).toContain("Test Org (test-org) [owner]");
      expect(result.stdout).toContain("Another Org (another-org) [member]");

      // Verify auth was saved
      const auth = await authService.loadAuth();
      expect(auth).toBeTruthy();
      expect(auth?.email).toBe("test@example.com");
      expect(auth?.token).toMatch(/^test-token-/);
      expect(auth?.organizations).toHaveLength(2);
    });

    it("should use email from command line option", async () => {
      const result = await cli.executeInteractive(
        ["login", "--email", "cli@example.com"],
        {
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
        },
      );

      // Should fail because cli@example.com is not in test data
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Invalid email or password");
    });

    it("should validate email format", async () => {
      // Try to pass invalid email with password to avoid interactive prompt
      const result = await cli.executeWithInput(
        ["login", "--email", "invalid-email"],
        "password123",
        {
          env: {
            HOME: testHome,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("valid email");
    });

    it("should handle invalid credentials error", async () => {
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

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Invalid email or password");

      // Verify no auth was saved
      const auth = await authService.loadAuth();
      expect(auth).toBeNull();
    });

    it("should handle network errors", async () => {
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

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Error:");
    });

    it("should display organizations after successful login", async () => {
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

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Organizations:");
      expect(result.stdout).toContain("Test Org (test-org) [owner]");
      expect(result.stdout).toContain("Another Org (another-org) [member]");
      expect(result.stdout).toContain("Third Org (third-org) [viewer]");
    });
  });

  describe("API token login", () => {
    it("should successfully login with valid API token", async () => {
      // First create a token via the API
      const response = await fetch(
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
      const { token } = await response.json();

      const result = await cli.execute(["login", "--token", token], {
        env: {
          HOME: testHome,
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Logged in successfully!");

      // Verify auth was saved
      const auth = await authService.loadAuth();
      expect(auth?.token).toBe(token);
    });

    it("should handle invalid API token", async () => {
      const result = await cli.execute(
        ["login", "--token", "invalid-token-123"],
        {
          env: {
            HOME: testHome,
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Invalid token");

      // Verify no auth was saved
      const auth = await authService.loadAuth();
      expect(auth).toBeNull();
    });
  });

  describe("environment configuration", () => {
    it("should use custom API URL from environment", async () => {
      // Test server is already running on custom port
      const result = await cli.execute(["login", "--token", "test-token"], {
        env: {
          HOME: testHome,
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      // Should fail with our test server's response
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Invalid token");
    });

    it("should handle missing HOME directory", async () => {
      const result = await cli.execute(["login", "--token", "test-token"], {
        env: {
          HOME: "/nonexistent/path",
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(1);
      // Will fail trying to save auth
    });
  });

  describe("edge cases", () => {
    it("should handle empty organizations array", async () => {
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

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Logged in successfully!");

      const auth = await authService.loadAuth();
      expect(auth?.organizations).toEqual([]);
    });

    it("should handle special characters in password", async () => {
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

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Logged in successfully!");
    });

    it("should handle server errors with custom messages", async () => {
      // Use wrong port to simulate connection error
      const result = await cli.execute(["login", "--token", "any-token"], {
        env: {
          HOME: testHome,
          CLOUDEXPRESS_API_URL: `http://localhost:99999`,
        },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Error:|ECONNREFUSED|Login failed/);
    });
  });

  describe("auth persistence", () => {
    it("should persist auth across command invocations", async () => {
      // Create a real token first
      const response = await fetch(
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
      const { token } = await response.json();

      // Login with the token
      const result = await cli.execute(["login", "--token", token], {
        env: {
          HOME: testHome,
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);

      // Verify auth persists
      const auth1 = await authService.loadAuth();

      // Simulate new session
      const authService2 = new AuthService(testHome);
      const auth2 = await authService2.loadAuth();

      expect(auth1).toEqual(auth2);
      expect(auth2?.token).toBe(token);
    });

    it("should have correct file permissions on auth file", async () => {
      const response = await fetch(
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
      const { token } = await response.json();

      await cli.execute(["login", "--token", token], {
        env: {
          HOME: testHome,
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      // Check permissions
      if (process.platform !== "win32") {
        const authPath = path.join(testHome, ".cygni", "auth.json");
        const stats = await fileSystem.stat(authPath);
        const mode = stats.mode & parseInt("777", 8);
        expect(mode).toBe(parseInt("600", 8));
      }
    });
  });
});
