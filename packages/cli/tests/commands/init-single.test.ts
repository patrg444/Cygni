import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastCliExecutor } from "../services/cli-executor-fast";
import { RealFileSystem } from "../services/real-file-system";
import { ConfigService } from "../services/config-service";

describe("init command - single test", () => {
  let cli: FastCliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;
  let configService: ConfigService;

  beforeEach(async () => {
    cli = new FastCliExecutor();
    fileSystem = new RealFileSystem("init-single");
    testDir = await fileSystem.createTestDir();
    configService = new ConfigService(testDir);
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  it("should use provided project name argument", async () => {
    console.log("Starting test...");
    console.log("Test dir:", testDir);

    const result = await cli.execute(["init", "my-awesome-project"], {
      cwd: testDir,
    });

    console.log("Exit code:", result.code);
    console.log("STDOUT:", result.stdout);
    console.log("STDERR:", result.stderr);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Welcome to CloudExpress!");
    expect(result.stderr).toContain("Configuration created!");
    expect(result.stdout).toContain("Your project is ready!");

    const config = await configService.loadConfig();
    expect(config.name).toBe("my-awesome-project");
  }, 10000);
});
