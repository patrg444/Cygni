import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import { LocalStackManager } from "../utils/localstack";
import path from "path";
import os from "os";

describe("Secrets Command - Real Integration Tests", () => {
  let testServer: TestApiServer;
  let serverPort: number;
  let cli: CliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;
  let originalApiUrl: string | undefined;
  let originalHome: string;
  let localStack: LocalStackManager | undefined;
  let useLocalStack = process.env.USE_LOCALSTACK === "true";

  beforeAll(async () => {
    // Start LocalStack if requested
    if (useLocalStack) {
      localStack = new LocalStackManager({ services: ["secretsmanager"] });
      const credentials = await localStack.start();

      // Set environment variables for AWS SDK
      process.env.LOCALSTACK_ENDPOINT = credentials.endpoint;
      process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
      process.env.AWS_REGION = credentials.region;
    }

    // Start test server with LocalStack support
    testServer = new TestApiServer(useLocalStack);
    serverPort = await testServer.start();

    // Save original settings
    originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
    originalHome = os.homedir();

    // Set test API URL
    process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;

    // Initialize services
    cli = new CliExecutor();
    fileSystem = new RealFileSystem("secrets-command");
  });

  afterAll(async () => {
    // Restore original settings
    if (originalApiUrl) {
      process.env.CLOUDEXPRESS_API_URL = originalApiUrl;
    } else {
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

  beforeEach(async () => {
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
    await fileSystem.createFile(
      "cygni.yml",
      `
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
`,
    );

    // Reset server data
    testServer.clearData();
  });

  describe("Set Secret", () => {
    it("should set a secret with provided value", async () => {
      const result = await cli.execute(
        ["secrets", "set", "DATABASE_URL", "postgres://localhost:5432/mydb"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret DATABASE_URL set successfully!");
      expect(result.stdout).toContain(
        "Changes will take effect on next deployment",
      );
    });

    it("should prompt for value when not provided", async () => {
      const result = await cli.executeInteractive(
        ["secrets", "set", "API_KEY"],
        {
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
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret API_KEY set successfully!");
    });

    it("should validate secret key format", async () => {
      const result = await cli.execute(
        ["secrets", "set", "invalid-key", "value"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "Secret key must be uppercase with underscores",
      );
    });

    it("should validate various invalid key formats", async () => {
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

        expect(result.code).toBe(1);
        expect(result.stderr).toContain("Secret key must be uppercase");
      }
    });

    it("should accept valid key formats", async () => {
      const validKeys = [
        "API_KEY",
        "DATABASE_URL",
        "SECRET_KEY_123",
        "_PRIVATE_KEY",
        "A",
        "VERY_LONG_SECRET_KEY_NAME_WITH_MANY_UNDERSCORES",
      ];

      for (const key of validKeys) {
        const result = await cli.execute(
          ["secrets", "set", key, "test-value"],
          {
            cwd: testDir,
            env: {
              HOME: fileSystem.getPath("home"),
              CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            },
          },
        );

        expect(result.code).toBe(0);
        expect(result.stdout).toContain(`Secret ${key} set successfully!`);
      }
    });
  });

  describe("List Secrets", () => {
    it("should list all secrets", async () => {
      const result = await cli.execute(["secrets", "list"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secrets:");
      expect(result.stdout).toContain("DATABASE_URL");
      expect(result.stdout).toContain("postgres://***");
      expect(result.stdout).toContain("API_KEY");
      expect(result.stdout).toContain("sk-***");
      expect(result.stdout).toContain("Total: 2 secrets");
    });

    it("should show values with --show-values flag", async () => {
      const result = await cli.execute(["secrets", "list", "--show-values"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      // In real implementation, this would show actual values
      // Our test server doesn't implement this, but the flag should be accepted
      expect(result.stderr).not.toContain("unknown option");
    });
  });

  describe("Remove Secret", () => {
    it("should remove a secret with confirmation", async () => {
      const result = await cli.executeInteractive(
        ["secrets", "remove", "API_KEY"],
        {
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
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret API_KEY removed successfully!");
    });

    it("should cancel removal when user says no", async () => {
      const result = await cli.executeInteractive(
        ["secrets", "remove", "API_KEY"],
        {
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
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Cancelled");
    });

    it("should skip confirmation with --yes flag", async () => {
      const result = await cli.execute(
        ["secrets", "remove", "API_KEY", "--yes"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret API_KEY removed successfully!");
      expect(result.stdout).not.toContain("Are you sure");
    });
  });

  describe("Import Secrets", () => {
    it("should import secrets from .env file", async () => {
      // Create .env file
      await fileSystem.createFile(
        ".env",
        `
# Database configuration
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
API_KEY=sk-1234567890abcdef
SECRET_KEY=my-secret-key-value

# Invalid keys that should be ignored
invalid-key=should-be-ignored
123_INVALID=also-ignored
`,
      );

      const result = await cli.execute(["secrets", "import", ".env"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Found 3 secrets to import");
      expect(result.stdout).toContain("Import complete!");
    });

    it("should handle empty .env file", async () => {
      await fileSystem.createFile(".env", "# Only comments\n\n");

      const result = await cli.execute(["secrets", "import", ".env"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("No valid secrets found in file");
    });

    it("should handle missing .env file", async () => {
      const result = await cli.execute(
        ["secrets", "import", "nonexistent.env"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Error:");
    });

    it("should parse complex .env file correctly", async () => {
      await fileSystem.createFile(
        ".env",
        `
# Comments should be ignored
DATABASE_URL="postgres://user:pass@localhost:5432/mydb"
API_KEY='single-quoted-value'
MULTILINE_VALUE="line1\\nline2\\nline3"
EMPTY_VALUE=
SPACES_VALUE=   trimmed   
SPECIAL_CHARS=!@#$%^&*()
URL_WITH_EQUALS=https://example.com?param=value&other=123
`,
      );

      const result = await cli.execute(["secrets", "import", ".env"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("secrets to import");
    });
  });

  describe("Authentication", () => {
    it("should fail when not authenticated", async () => {
      // Remove auth file
      await fileSystem.remove("home/.cygni/auth.json");

      const result = await cli.execute(["secrets", "list"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Not authenticated");
      expect(result.stderr).toContain("cygni login");
    });
  });

  describe("Project Resolution", () => {
    it("should use project from config file", async () => {
      const result = await cli.execute(["secrets", "list"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(0);
      // Test server expects proj_123 from our config
      expect(result.stdout).toContain("Secrets:");
    });

    it("should handle missing config file", async () => {
      // Remove config file
      await fileSystem.remove("cygni.yml");

      const result = await cli.execute(["secrets", "list"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
        },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("No project found");
    });

    it("should use --project option when provided", async () => {
      const result = await cli.execute(
        ["secrets", "list", "--project", "test-project"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          },
        },
      );

      expect(result.code).toBe(0);
    });
  });
});
