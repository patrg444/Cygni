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
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const os_1 = __importDefault(require("os"));
(0, vitest_1.describe)("Secrets Command - AWS Secrets Manager Integration", () => {
    let testServer;
    let serverPort;
    let cli;
    let fileSystem;
    let testDir;
    let originalApiUrl;
    let originalHome;
    let localStack;
    let awsClient;
    (0, vitest_1.beforeAll)(async () => {
        // Start LocalStack
        localStack = new localstack_1.LocalStackManager({ services: ["secretsmanager"] });
        const credentials = await localStack.start();
        // Set environment variables for AWS SDK
        process.env.LOCALSTACK_ENDPOINT = credentials.endpoint;
        process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
        process.env.AWS_REGION = credentials.region;
        // Create AWS client for verification
        awsClient = new client_secrets_manager_1.SecretsManagerClient({
            endpoint: credentials.endpoint,
            region: credentials.region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
            },
        });
        // Start test server with LocalStack support
        testServer = new test_api_server_1.TestApiServer(true);
        serverPort = await testServer.start();
        // Save original settings
        originalApiUrl = process.env.CLOUDEXPRESS_API_URL;
        originalHome = os_1.default.homedir();
        // Set test API URL
        process.env.CLOUDEXPRESS_API_URL = `http://localhost:${serverPort}`;
        // Initialize services
        cli = new cli_executor_1.CliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("secrets-aws");
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
        // Stop LocalStack
        await localStack.stop();
        delete process.env.LOCALSTACK_ENDPOINT;
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_REGION;
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
    (0, vitest_1.describe)("AWS Secrets Manager Backend", () => {
        (0, vitest_1.it)("should create secret in AWS Secrets Manager", async () => {
            const result = await cli.execute(["secrets", "set", "DATABASE_URL", "postgres://localhost:5432/mydb"], {
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
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret DATABASE_URL set successfully!");
            // Verify secret exists in AWS
            const secretName = "cygni/proj_123/global/DATABASE_URL";
            const getResult = await awsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
                SecretId: secretName,
            }));
            (0, vitest_1.expect)(getResult.SecretString).toBeDefined();
            const secretData = JSON.parse(getResult.SecretString);
            (0, vitest_1.expect)(secretData.value).toBe("postgres://localhost:5432/mydb");
        });
        (0, vitest_1.it)("should list secrets from AWS Secrets Manager", async () => {
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
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secrets:");
            (0, vitest_1.expect)(result.stdout).toContain("API_KEY");
            (0, vitest_1.expect)(result.stdout).toContain("SECRET_KEY");
            // Should show preview (first 4 chars + ****)
            (0, vitest_1.expect)(result.stdout).toContain("test****");
        });
        (0, vitest_1.it)("should delete secret from AWS Secrets Manager", async () => {
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
            const result = await cli.execute(["secrets", "remove", "TO_DELETE", "--yes"], {
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
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret TO_DELETE removed successfully!");
            // Verify secret is deleted in AWS
            const secretName = "cygni/proj_123/global/TO_DELETE";
            await (0, vitest_1.expect)(awsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName }))).rejects.toThrow();
        });
        (0, vitest_1.it)("should import secrets from .env file to AWS", async () => {
            // Create .env file
            await fileSystem.createFile(".env", `
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
API_KEY=sk-1234567890abcdef
SECRET_KEY=my-secret-key-value
`);
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
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 3 secrets to import");
            (0, vitest_1.expect)(result.stdout).toContain("Import complete!");
            // Verify secrets exist in AWS
            for (const key of ["DATABASE_URL", "API_KEY", "SECRET_KEY"]) {
                const secretName = `cygni/proj_123/global/${key}`;
                const getResult = await awsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
                    SecretId: secretName,
                }));
                (0, vitest_1.expect)(getResult.SecretString).toBeDefined();
            }
        });
    });
    (0, vitest_1.describe)("Backward Compatibility", () => {
        (0, vitest_1.it)("should fallback to test server when LocalStack is not available", async () => {
            // Run without LocalStack environment variables
            const result = await cli.execute(["secrets", "set", "FALLBACK_TEST", "value"], {
                cwd: testDir,
                env: {
                    HOME: fileSystem.getPath("home"),
                    CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
                    // Intentionally omitting AWS/LocalStack env vars
                },
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Secret FALLBACK_TEST set successfully!");
        });
    });
});
//# sourceMappingURL=secrets-aws.test.js.map