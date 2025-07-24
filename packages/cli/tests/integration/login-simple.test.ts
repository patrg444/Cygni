import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";
import fs from "fs/promises";
import os from "os";

describe("Login Command - Simple Real Tests", () => {
  let testServer: TestApiServer;
  let serverPort: number;
  let cli: CliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeAll(async () => {
    // Start test server
    testServer = new TestApiServer();
    serverPort = await testServer.start();

    // Initialize services
    cli = new CliExecutor();
    fileSystem = new RealFileSystem("login-simple");
  });

  afterAll(async () => {
    await testServer.stop();
    await fileSystem.cleanup();
  });

  beforeEach(async () => {
    testDir = await fileSystem.createTestDir();
    testServer.clearData();
  });

  it("should login with API token", async () => {
    // First get a token from the test server
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
    expect(token).toMatch(/^test-token-/);

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
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Logged in successfully!");

    // Verify auth file was created
    const authPath = path.join(testHome, ".cygni", "auth.json");
    const authExists = await fileSystem.exists(authPath);
    expect(authExists).toBe(true);

    // Read and verify auth data
    const authContent = await fs.readFile(authPath, "utf-8");
    const authData = JSON.parse(authContent);
    expect(authData.token).toBe(token);
    expect(authData.email).toBe("test@example.com");
  });

  it("should fail with invalid token", async () => {
    const testHome = await fileSystem.createTestDir("home2");

    const result = await cli.execute(["login", "--token", "invalid-token"], {
      env: {
        HOME: testHome,
        CLOUDEXPRESS_API_URL: `http://localhost:${serverPort}`,
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid token");
  });

  it("should handle server errors", async () => {
    const testHome = await fileSystem.createTestDir("home3");

    // Use wrong port to simulate network error
    const result = await cli.execute(["login", "--token", "test-token"], {
      env: {
        HOME: testHome,
        CLOUDEXPRESS_API_URL: `http://localhost:99999`,
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Login failed:");
  });
});
