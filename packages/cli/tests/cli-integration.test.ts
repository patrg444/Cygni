import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const execAsync = promisify(exec);

describe("CLI Integration - Real Command Execution", () => {
  const testDir = path.join(os.tmpdir(), `cygni-cli-test-${Date.now()}`);
  const cliPath = path.join(__dirname, "../dist/index.js");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("User initializes a new project", () => {
    it("should create cygni.yml config file with init command", async () => {
      // Build the CLI first
      await execAsync("npm run build", { cwd: path.join(__dirname, "..") });

      // Run init command
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} init my-test-project --framework nextjs`,
        {
          cwd: testDir,
          env: { ...process.env, CI: "true" }, // Prevent interactive prompts
        },
      );

      // Check output - the command outputs with special characters
      const fullOutput = stdout + stderr;
      expect(fullOutput.toLowerCase()).toContain("configuration created");
      expect(fullOutput).toContain("Your project is ready!");

      // Verify file was created
      const configPath = path.join(testDir, "cygni.yml");
      const exists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Read and verify content
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain("name: my-test-project");
      expect(content).toContain("framework: nextjs");
    });
  });

  describe("User validates runtime configuration", () => {
    it("should validate runtime.yaml file", async () => {
      // Create a runtime.yaml file
      const runtime = `
runtime: node
version: "20"
memory: 512
cpu: 256
`;
      await fs.writeFile(path.join(testDir, "runtime.yaml"), runtime);

      // Run validate command
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} validate runtime.yaml`,
        { cwd: testDir },
      );

      // Should validate successfully
      expect(stdout + stderr).toContain("valid");
    });
  });

  describe("User checks CLI version", () => {
    it("should display version information", async () => {
      try {
        const { stdout } = await execAsync(`node ${cliPath} --version`);
        // Should show version from package.json
        expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Semantic version
      } catch (error: any) {
        // CLI might exit with code 1 but still output version
        expect(error.stdout).toMatch(/\d+\.\d+\.\d+/);
      }
    });
  });

  describe("User gets help", () => {
    it("should display available commands", async () => {
      try {
        const { stdout } = await execAsync(`node ${cliPath} --help`);

        // Should show available commands
        expect(stdout).toContain("init");
        expect(stdout).toContain("login");
        expect(stdout).toContain("deploy");
        expect(stdout).toContain("secrets");
      } catch (error: any) {
        // CLI might exit with code 1 but still output help
        const output = error.stdout || "";
        expect(output).toContain("init");
        expect(output).toContain("login");
        expect(output).toContain("deploy");
        expect(output).toContain("secrets");
      }
    });
  });
});
