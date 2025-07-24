import { describe, it, expect } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import { RealFileSystem } from "../services/real-file-system";
import { CliExecutor } from "../services/cli-executor";

describe("Real Services Test", () => {
  it("Test API Server should start and respond", async () => {
    const server = new TestApiServer();
    const port = await server.start();

    expect(port).toBeGreaterThan(0);

    // Test login endpoint
    const response = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toMatch(/^test-token-/);
    expect(data.user.email).toBe("test@example.com");

    await server.stop();
  });

  it("Real File System should create and read files", async () => {
    const fs = new RealFileSystem("test");
    const testDir = await fs.createTestDir();

    await fs.createFile("test.txt", "Hello World");
    const content = await fs.readFile("test.txt");
    expect(content).toBe("Hello World");

    await fs.cleanup();
  });

  it("CLI Executor should build and run CLI", async () => {
    const cli = new CliExecutor();
    await cli.ensureBuilt();

    const result = await cli.execute(["--version"]);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
