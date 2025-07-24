import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import { LocalStackManager } from "../utils/localstack";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import os from "os";

describe("Secrets Command - AWS Secrets Manager Integration", () => {
  let testServer: TestApiServer;
  let serverPort: number;
  let cli: CliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;
  let originalApiUrl: string | undefined;
  let originalHome: string;
  let localStack: LocalStackManager;
  let awsClient: SecretsManagerClient;

  beforeAll(async () => {
    // Start LocalStack
    localStack = new LocalStackManager({ services: ["secretsmanager"] });
    const credentials = await localStack.start();

    // Set environment variables for AWS SDK
    process.env.LOCALSTACK_ENDPOINT = credentials.endpoint;
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    process.env.AWS_REGION = credentials.region;

    // Create AWS client for verification
    awsClient = new SecretsManagerClient({
      endpoint: credentials.endpoint,
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    // Start test server with LocalStack support
    testServer = new TestApiServer(true);
    serverPort = await testServer.start();

    // Save original settings
    originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
    originalHome = os.homedir();

    // Set test API URL
    process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;

    // Initialize services
    cli = new CliExecutor();
    fileSystem = new RealFileSystem("secrets-aws");
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

    // Stop LocalStack
    await localStack.stop();
    delete process.env.LOCALSTACK_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;

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

  describe("AWS Secrets Manager Backend", () => {
    it("should create secret in AWS Secrets Manager", async () => {
      const result = await cli.execute(
        ["secrets", "set", "DATABASE_URL", "postgres://localhost:5432/mydb"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
            AWS_REGION: process.env.AWS_REGION,
          },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret DATABASE_URL set successfully!");

      // Verify secret exists in AWS
      const secretName = "cygni/proj_123/global/DATABASE_URL";
      const getResult = await awsClient.send(
        new GetSecretValueCommand({
          SecretId: secretName,
        }),
      );

      expect(getResult.SecretString).toBeDefined();
      const secretData = JSON.parse(getResult.SecretString!);
      expect(secretData.value).toBe("postgres://localhost:5432/mydb");
    });

    it("should list secrets from AWS Secrets Manager", async () => {
      // First, set a few secrets
      await cli.execute(["secrets", "set", "API_KEY", "test-api-key"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION,
        },
      });

      await cli.execute(["secrets", "set", "SECRET_KEY", "test-secret-key"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION,
        },
      });

      // Now list secrets
      const result = await cli.execute(["secrets", "list"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secrets:");
      expect(result.stdout).toContain("API_KEY");
      expect(result.stdout).toContain("SECRET_KEY");
      // Should show preview (first 4 chars + ****)
      expect(result.stdout).toContain("test****");
    });

    it("should delete secret from AWS Secrets Manager", async () => {
      // First, set a secret
      await cli.execute(["secrets", "set", "TO_DELETE", "delete-me"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION,
        },
      });

      // Delete it
      const result = await cli.execute(
        ["secrets", "remove", "TO_DELETE", "--yes"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
            AWS_REGION: process.env.AWS_REGION,
          },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret TO_DELETE removed successfully!");

      // Verify secret is deleted in AWS
      const secretName = "cygni/proj_123/global/TO_DELETE";
      await expect(
        awsClient.send(new GetSecretValueCommand({ SecretId: secretName })),
      ).rejects.toThrow();
    });

    it("should import secrets from .env file to AWS", async () => {
      // Create .env file
      await fileSystem.createFile(
        ".env",
        `
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
API_KEY=sk-1234567890abcdef
SECRET_KEY=my-secret-key-value
`,
      );

      const result = await cli.execute(["secrets", "import", ".env"], {
        cwd: testDir,
        env: {
          HOME: fileSystem.getPath("home"),
          CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION,
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Found 3 secrets to import");
      expect(result.stdout).toContain("Import complete!");

      // Verify secrets exist in AWS
      for (const key of ["DATABASE_URL", "API_KEY", "SECRET_KEY"]) {
        const secretName = `cygni/proj_123/global/${key}`;
        const getResult = await awsClient.send(
          new GetSecretValueCommand({
            SecretId: secretName,
          }),
        );
        expect(getResult.SecretString).toBeDefined();
      }
    });
  });

  describe("Backward Compatibility", () => {
    it("should fallback to test server when LocalStack is not available", async () => {
      // Run without LocalStack environment variables
      const result = await cli.execute(
        ["secrets", "set", "FALLBACK_TEST", "value"],
        {
          cwd: testDir,
          env: {
            HOME: fileSystem.getPath("home"),
            CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
            // Intentionally omitting AWS/LocalStack env vars
          },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Secret FALLBACK_TEST set successfully!");
    });
  });
});
