import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CliExecutor } from "../services/cli-executor";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";
import yaml from "js-yaml";

describe("Init Command - Real Integration Tests", () => {
  let cli: CliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    cli = new CliExecutor();
    fileSystem = new RealFileSystem("init-command");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("Project Initialization", () => {
    it("should create cygni.yml with provided project name", async () => {
      const result = await cli.execute(["init", "my-awesome-project"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Welcome to CloudExpress!");
      expect(result.stdout).toContain("Configuration created!");
      expect(result.stdout).toContain("Your project is ready!");

      // Verify file was created
      const configExists = await fileSystem.exists("cygni.yml");
      expect(configExists).toBe(true);

      // Read and parse the config
      const configContent = await fileSystem.readFile("cygni.yml");
      const config = yaml.load(configContent) as any;

      expect(config.name).toBe("my-awesome-project");
      expect(config.services).toBeDefined();
      expect(config.services.web).toBeDefined();
    });

    it("should use current directory name when no project name provided", async () => {
      // Create a named test directory
      const namedDir = await fileSystem.createTestDir("test-project-dir");

      const result = await cli.executeInteractive(["init"], {
        cwd: namedDir,
        inputs: [
          {
            waitFor: "What is your project name?",
            response: "", // Just press enter to use default
          },
        ],
      });

      expect(result.code).toBe(0);

      const configContent = await fileSystem.readFile(
        path.join(namedDir, "cygni.yml"),
      );
      const config = yaml.load(configContent) as any;

      expect(config.name).toBe("test-project-dir");
    });
  });

  describe("Framework Detection", () => {
    it("should auto-detect Next.js project", async () => {
      // Create Next.js project structure
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "nextjs-app",
          dependencies: {
            next: "^13.0.0",
            react: "^18.0.0",
            "react-dom": "^18.0.0",
          },
        }),
        "next.config.js": "module.exports = {};",
      });

      const result = await cli.execute(["init", "nextjs-test"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Detected framework: Next.js");

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.framework).toBe("nextjs");
      expect(config.services.web.build.command).toBe("npm run build");
      expect(config.services.web.start.command).toBe("npm start");
      expect(config.services.web.start.port).toBe(3000);
    });

    it("should auto-detect Django project", async () => {
      await fileSystem.createStructure({
        "manage.py": "#!/usr/bin/env python\n# Django manage.py",
        "requirements.txt": "django>=4.0\npsycopg2-binary\n",
      });

      const result = await cli.execute(["init", "django-test"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Detected framework: Django");

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.framework).toBe("django");
      expect(config.services.web.start.command).toBe(
        "python manage.py runserver 0.0.0.0:8000",
      );
      expect(config.services.web.start.port).toBe(8000);
    });

    it("should prompt for framework when not detected", async () => {
      // Create ambiguous project structure
      await fileSystem.createFile("index.js", 'console.log("Hello");');

      const result = await cli.executeInteractive(["init", "unknown-project"], {
        cwd: testDir,
        inputs: [
          {
            waitFor: "Which framework are you using?",
            response: "express", // Select Express from the list
          },
        ],
      });

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.framework).toBe("express");
    });

    it("should use framework option when provided", async () => {
      // Even if we have Next.js files, the option should take precedence
      await fileSystem.createFile("next.config.js", "module.exports = {};");

      const result = await cli.execute(
        ["init", "forced-framework", "--framework", "vue"],
        { cwd: testDir },
      );

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.framework).toBe("vue");
    });
  });

  describe("Configuration Content", () => {
    it("should create valid YAML configuration", async () => {
      const result = await cli.execute(["init", "yaml-test"], { cwd: testDir });

      expect(result.code).toBe(0);

      const configContent = await fileSystem.readFile("cygni.yml");

      // Should be valid YAML
      expect(() => yaml.load(configContent)).not.toThrow();

      // Check structure
      const config = yaml.load(configContent) as any;
      expect(config).toHaveProperty("name");
      expect(config).toHaveProperty("services");
      expect(config.services).toHaveProperty("web");
      expect(config.services.web).toHaveProperty("build");
      expect(config.services.web).toHaveProperty("start");
    });

    it("should include deployment configuration", async () => {
      const result = await cli.execute(["init", "deploy-test"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;

      expect(config).toHaveProperty("deploy");
      expect(config.deploy).toHaveProperty("strategy");
      expect(config.deploy).toHaveProperty("healthCheck");
    });
  });

  describe("Error Handling", () => {
    it("should fail gracefully in read-only directory", async () => {
      // Make directory read-only
      await fileSystem.chmod(".", 0o555);

      const result = await cli.execute(["init", "readonly-test"], {
        cwd: testDir,
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Permission denied");

      // Restore permissions for cleanup
      await fileSystem.chmod(".", 0o755);
    });

    it("should handle existing cygni.yml file", async () => {
      // Create existing config
      await fileSystem.createFile("cygni.yml", "name: existing-project\n");

      const result = await cli.execute(["init", "new-project"], {
        cwd: testDir,
      });

      // Should either fail or prompt for overwrite
      expect(result.stdout + result.stderr).toMatch(
        /already exists|overwrite/i,
      );
    });
  });

  describe("Special Cases", () => {
    it("should handle project names with spaces", async () => {
      const result = await cli.execute(["init", "My Awesome Project"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.name).toBe("My Awesome Project");
    });

    it("should handle special characters in project name", async () => {
      const result = await cli.execute(["init", "project-2024@v1"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.name).toBe("project-2024@v1");
    });

    it("should handle 'other' framework selection", async () => {
      const result = await cli.executeInteractive(
        ["init", "custom-framework"],
        {
          cwd: testDir,
          inputs: [
            {
              waitFor: "Which framework are you using?",
              response: "other",
            },
          ],
        },
      );

      expect(result.code).toBe(0);

      const config = yaml.load(await fileSystem.readFile("cygni.yml")) as any;
      expect(config.framework).toBe("other");
    });
  });

  describe("Next Steps Output", () => {
    it("should display helpful next steps after initialization", async () => {
      const result = await cli.execute(["init", "helpful-test"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Next steps:");
      expect(result.stdout).toContain("Review your cygni.yml configuration");
      expect(result.stdout).toContain("cygni login");
      expect(result.stdout).toContain("cygni deploy");
    });
  });
});
