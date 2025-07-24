import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const execAsync = promisify(exec);

describe("init command - direct test", () => {
  it("should work with direct execution", async () => {
    // Create temp directory
    const tempDir = path.join(os.tmpdir(), `cygni-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Execute CLI directly with framework option to avoid prompts
      const cliPath = path.join(__dirname, "../../dist/index.js");
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} init my-awesome-project --framework nextjs`,
        { cwd: tempDir },
      );

      console.log("STDOUT:", stdout);
      console.log("STDERR:", stderr);

      // Check output
      expect(stdout).toContain("Welcome to CloudExpress!");
      expect(stdout).toContain("Your project is ready!");

      // Check file was created
      const configPath = path.join(tempDir, "cygni.yml");
      const configExists = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);
      expect(configExists).toBe(true);

      // Read and check config
      const configContent = await fs.readFile(configPath, "utf-8");
      expect(configContent).toContain("name: my-awesome-project");
    } finally {
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 10000);
});
