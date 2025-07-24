import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastCliExecutor } from "../services/cli-executor-fast";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";

describe("Fullstack Commands", () => {
  let cli: FastCliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    cli = new FastCliExecutor();
    fileSystem = new RealFileSystem("fullstack-simple-test");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  it("should analyze a simple fullstack project", async () => {
    // Create minimal monorepo
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "test-app",
        workspaces: ["frontend", "backend"],
      }),
    );

    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        dependencies: { react: "^18.0.0" },
      }),
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        dependencies: { express: "^4.0.0" },
      }),
    );

    const result = await cli.execute(["analyze", "--fullstack"], {
      cwd: testDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Found 2 services");
    expect(result.stdout).toContain("frontend");
    expect(result.stdout).toContain("backend");
  });

  it("should handle build command gracefully without node_modules", async () => {
    // Create project structure
    await fileSystem.createFile(
      "cloudexpress.yaml",
      `
version: "1.0"
services:
  - name: backend
    type: backend
    path: backend
  - name: frontend
    type: frontend
    path: frontend
    dependencies:
      - backend
`,
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        scripts: {
          // No build script - should handle gracefully
        },
        dependencies: { express: "^4.0.0" },
      }),
    );

    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        scripts: {
          // No build script - should handle gracefully
        },
        dependencies: { react: "^18.0.0" },
      }),
    );

    const result = await cli.execute(["build"], { cwd: testDir });

    // Should complete even without build scripts
    expect(result.stderr).not.toContain("Cannot find module");
  });

  it("should deploy with dry-run flag", async () => {
    // Create minimal structure
    await fileSystem.createFile(
      "cloudexpress.yaml",
      `
version: "1.0"
services:
  - name: api
    type: backend
    path: "."
`,
    );

    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "api",
        dependencies: { express: "^4.0.0" },
      }),
    );

    const result = await cli.execute(["deploy:fullstack", "--dry-run"], {
      cwd: testDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Deployment Plan");
    expect(result.stdout).toContain("This is a dry run");
  });

  it("should show help for deploy:git command", async () => {
    const result = await cli.execute(["deploy:git", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Deploy application directly from a Git repository",
    );
    expect(result.stdout).toContain("Available Templates:");
  });
});
