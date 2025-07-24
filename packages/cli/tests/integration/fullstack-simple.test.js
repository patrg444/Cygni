"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_fast_1 = require("../services/cli-executor-fast");
const real_file_system_1 = require("../services/real-file-system");
(0, vitest_1.describe)("Fullstack Commands", () => {
    let cli;
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("fullstack-simple-test");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.it)("should analyze a simple fullstack project", async () => {
        // Create minimal monorepo
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "test-app",
            workspaces: ["frontend", "backend"],
        }));
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "frontend",
            dependencies: { react: "^18.0.0" },
        }));
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "backend",
            dependencies: { express: "^4.0.0" },
        }));
        const result = await cli.execute(["analyze", "--fullstack"], {
            cwd: testDir,
        });
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Found 2 services");
        (0, vitest_1.expect)(result.stdout).toContain("frontend");
        (0, vitest_1.expect)(result.stdout).toContain("backend");
    });
    (0, vitest_1.it)("should handle build command gracefully without node_modules", async () => {
        // Create project structure
        await fileSystem.createFile("cloudexpress.yaml", `
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
`);
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "backend",
            scripts: {
            // No build script - should handle gracefully
            },
            dependencies: { express: "^4.0.0" },
        }));
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "frontend",
            scripts: {
            // No build script - should handle gracefully
            },
            dependencies: { react: "^18.0.0" },
        }));
        const result = await cli.execute(["build"], { cwd: testDir });
        // Should complete even without build scripts
        (0, vitest_1.expect)(result.stderr).not.toContain("Cannot find module");
    });
    (0, vitest_1.it)("should deploy with dry-run flag", async () => {
        // Create minimal structure
        await fileSystem.createFile("cloudexpress.yaml", `
version: "1.0"
services:
  - name: api
    type: backend
    path: "."
`);
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "api",
            dependencies: { express: "^4.0.0" },
        }));
        const result = await cli.execute(["deploy:fullstack", "--dry-run"], {
            cwd: testDir,
        });
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Deployment Plan");
        (0, vitest_1.expect)(result.stdout).toContain("This is a dry run");
    });
    (0, vitest_1.it)("should show help for deploy:git command", async () => {
        const result = await cli.execute(["deploy:git", "--help"]);
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Deploy application directly from a Git repository");
        (0, vitest_1.expect)(result.stdout).toContain("Available Templates:");
    });
});
//# sourceMappingURL=fullstack-simple.test.js.map