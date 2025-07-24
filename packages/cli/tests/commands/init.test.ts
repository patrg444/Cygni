import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initCommand } from "../../src/commands/init";
import {
  mockConsole,
  mockInquirer,
  clearAllMocks,
  setupMocks,
} from "../test-utils";
import { input, select } from "@inquirer/prompts";
import * as frameworkDetector from "../../src/utils/framework-detector";
import * as config from "../../src/utils/config";
import chalk from "chalk";
import path from "path";

vi.mock("@inquirer/prompts");
vi.mock("../../src/utils/framework-detector");
vi.mock("../../src/utils/config");

describe("init command", () => {
  const mockConfig = {
    name: "test-project",
    framework: "nextjs",
    services: {
      web: {
        build: { command: "npm run build" },
        start: { command: "npm run start", port: 3000 },
      },
    },
  };

  beforeEach(() => {
    clearAllMocks();
    setupMocks();
    vi.mocked(input).mockImplementation(mockInquirer.input);
    vi.mocked(select).mockImplementation(mockInquirer.select);
    vi.mocked(config.createProjectConfig).mockReturnValue(mockConfig);
    vi.mocked(config.saveConfig).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("project name handling", () => {
    it("should use provided project name argument", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "nextjs",
      );

      await initCommand.parseAsync(["node", "init", "my-awesome-project"]);

      expect(mockInquirer.input).not.toHaveBeenCalled();
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "my-awesome-project",
        "nextjs",
      );
    });

    it("should prompt for project name if not provided", async () => {
      const cwd = process.cwd();
      mockInquirer.input.mockResolvedValueOnce("prompted-project");
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "react",
      );

      await initCommand.parseAsync(["node", "init"]);

      expect(mockInquirer.input).toHaveBeenCalledWith({
        message: "What is your project name?",
        default: path.basename(cwd),
      });
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "prompted-project",
        "react",
      );
    });
  });

  describe("framework detection", () => {
    it("should use detected framework", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("vue");

      await initCommand.parseAsync(["node", "init", "vue-project"]);

      expect(frameworkDetector.detectFramework).toHaveBeenCalled();
      expect(mockInquirer.select).not.toHaveBeenCalled();
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "vue-project",
        "vue",
      );
    });

    it("should use framework option if provided", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "react",
      );

      await initCommand.parseAsync([
        "node",
        "init",
        "my-project",
        "--framework",
        "express",
      ]);

      expect(mockInquirer.select).not.toHaveBeenCalled();
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "my-project",
        "express",
      );
    });

    it("should prompt for framework if not detected", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(null);
      mockInquirer.select.mockResolvedValueOnce("django");

      await initCommand.parseAsync(["node", "init", "django-project"]);

      expect(mockInquirer.select).toHaveBeenCalledWith({
        message: "Which framework are you using?",
        choices: expect.arrayContaining([
          { name: "Next.js", value: "nextjs" },
          { name: "React", value: "react" },
          { name: "Vue", value: "vue" },
          { name: "Express", value: "express" },
          { name: "Fastify", value: "fastify" },
          { name: "Django", value: "django" },
          { name: "FastAPI", value: "fastapi" },
          { name: "Other", value: "other" },
        ]),
      });
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "django-project",
        "django",
      );
    });
  });

  describe("configuration creation", () => {
    it("should create and save configuration successfully", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "nextjs",
      );

      await initCommand.parseAsync(["node", "init", "test-project"]);

      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "test-project",
        "nextjs",
      );
      expect(config.saveConfig).toHaveBeenCalledWith(mockConfig);
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Your project is ready!"),
      );
    });

    it("should display next steps after success", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "react",
      );

      await initCommand.parseAsync(["node", "init", "test-project"]);

      expect(mockConsole.log).toHaveBeenCalledWith("Next steps:");
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Review your cygni.yaml configuration"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("cygni login"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("cygni deploy"),
      );
    });

    it("should handle config save errors", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "nextjs",
      );
      vi.mocked(config.saveConfig).mockRejectedValueOnce(
        new Error("Permission denied"),
      );

      await expect(
        initCommand.parseAsync(["node", "init", "test-project"]),
      ).rejects.toThrow("Permission denied");

      expect(mockConsole.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Your project is ready!"),
      );
    });
  });

  describe("edge cases", () => {
    it("should handle spaces in project name", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "nextjs",
      );

      await initCommand.parseAsync(["node", "init", "my awesome project"]);

      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "my awesome project",
        "nextjs",
      );
    });

    it("should handle special characters in project name", async () => {
      mockInquirer.input.mockResolvedValueOnce("project@2024");
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "react",
      );

      await initCommand.parseAsync(["node", "init"]);

      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "project@2024",
        "react",
      );
    });

    it("should handle 'other' framework selection", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(null);
      mockInquirer.select.mockResolvedValueOnce("other");

      await initCommand.parseAsync(["node", "init", "custom-project"]);

      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "custom-project",
        "other",
      );
    });

    it("should handle framework detector errors gracefully", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockRejectedValueOnce(
        new Error("Detection failed"),
      );
      mockInquirer.select.mockResolvedValueOnce("express");

      await initCommand.parseAsync(["node", "init", "error-project"]);

      expect(mockInquirer.select).toHaveBeenCalled();
      expect(config.createProjectConfig).toHaveBeenCalledWith(
        "error-project",
        "express",
      );
    });
  });

  describe("user experience", () => {
    it("should display welcome message", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "nextjs",
      );

      await initCommand.parseAsync(["node", "init", "test-project"]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.blue("Welcome to CloudExpress!"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        "Let's set up your new project.\n",
      );
    });

    it("should show spinner during config creation", async () => {
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(
        "react",
      );

      await initCommand.parseAsync(["node", "init", "test-project"]);

      // Verify that ora spinner methods were called (mocked internally)
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Configuration created!"),
      );
    });
  });
});
