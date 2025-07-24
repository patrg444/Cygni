import { describe, it, expect } from "vitest";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import { ConfigService } from "../services/config-service";
import fs from "fs/promises";
import path from "path";

describe("init command debug", () => {
  it("should run init and check what happens", async () => {
    const cli = new CliExecutor();
    const fileSystem = new RealFileSystem("init-debug");
    const testDir = await fileSystem.createTestDir();
    const configService = new ConfigService(testDir);

    console.log("Test directory:", testDir);

    const result = await cli.execute(
      ["init", "debug-project", "--framework", "nextjs"],
      { cwd: testDir },
    );

    console.log("Exit code:", result.code);
    console.log("STDOUT:", result.stdout);
    console.log("STDERR:", result.stderr);

    // List files created
    const files = await fs.readdir(testDir);
    console.log("Files created:", files);

    // Try to read any yml file
    for (const file of files) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        const content = await fs.readFile(path.join(testDir, file), "utf-8");
        console.log(`Content of ${file}:`, content);
      }
    }

    await fileSystem.cleanup();
  }, 30000);
});
