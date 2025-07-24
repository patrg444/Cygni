import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigService, CygniConfig } from "../services/config-service";
import { RealFileSystem } from "../services/real-file-system";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

describe("config utilities - Real Implementation", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;
  let configService: ConfigService;

  beforeEach(async () => {
    fileSystem = new RealFileSystem("config-utils");
    testDir = await fileSystem.createTestDir();
    configService = new ConfigService(testDir);
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("loadConfig", () => {
    it("should load YAML config file (cygni.yml)", async () => {
      const mockConfig: CygniConfig = {
        name: "test-project",
        framework: "nextjs",
        services: {
          web: {
            start: { command: "npm start", port: 3000 },
          },
        },
      };

      await fileSystem.createFile("cygni.yml", yaml.dump(mockConfig));

      const result = await configService.loadConfig();
      expect(result).toEqual(mockConfig);
    });

    it("should load YAML config file (cygni.yaml)", async () => {
      const mockConfig: CygniConfig = {
        name: "yaml-project",
        framework: "react",
      };

      await fileSystem.createFile("cygni.yaml", yaml.dump(mockConfig));

      const result = await configService.loadConfig();
      expect(result).toEqual(mockConfig);
    });

    it("should load JSON config file", async () => {
      const mockConfig: CygniConfig = {
        name: "json-project",
        framework: "vue",
        projectId: "proj-123",
      };

      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify(mockConfig, null, 2),
      );

      const result = await configService.loadConfig();
      expect(result).toEqual(mockConfig);
    });

    it("should prefer cygni.yml over other formats", async () => {
      const ymlConfig: CygniConfig = { name: "yml-project" };
      const yamlConfig: CygniConfig = { name: "yaml-project" };
      const jsonConfig: CygniConfig = { name: "json-project" };

      await fileSystem.createFile("cygni.yml", yaml.dump(ymlConfig));
      await fileSystem.createFile("cygni.yaml", yaml.dump(yamlConfig));
      await fileSystem.createFile("cygni.json", JSON.stringify(jsonConfig));

      const result = await configService.loadConfig();
      expect(result.name).toBe("yml-project");
    });

    it("should throw error if no config file found", async () => {
      await expect(configService.loadConfig()).rejects.toThrow(
        'No cygni configuration file found. Run "cygni init" to create one.',
      );
    });

    it("should continue to next file on YAML parse errors", async () => {
      await fileSystem.createFile(
        "cygni.yml",
        "invalid:\n  - yaml\n  content: [",
      );
      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify({ name: "fallback" }),
      );

      const result = await configService.loadConfig();
      expect(result.name).toBe("fallback");
    });

    it("should handle JSON parse errors gracefully", async () => {
      await fileSystem.createFile("cygni.yml", "invalid yaml {{");
      await fileSystem.createFile("cygni.yaml", "also: invalid: yaml:");
      await fileSystem.createFile("cygni.json", "{ invalid json }");

      await expect(configService.loadConfig()).rejects.toThrow(
        "No cygni configuration file found",
      );
    });

    it("should handle empty files", async () => {
      await fileSystem.createFile("cygni.yml", "");
      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify({ name: "valid" }),
      );

      const result = await configService.loadConfig();
      expect(result.name).toBe("valid");
    });

    it("should handle files with only comments", async () => {
      await fileSystem.createFile(
        "cygni.yml",
        "# Just a comment\n# Another comment",
      );
      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify({ name: "valid" }),
      );

      const result = await configService.loadConfig();
      expect(result.name).toBe("valid");
    });

    it("should load complex nested configuration", async () => {
      const complexConfig: CygniConfig = {
        name: "complex-project",
        projectId: "proj-complex",
        framework: "nextjs",
        services: {
          web: {
            build: {
              command: "npm run build",
              env: {
                NODE_ENV: "production",
                API_URL: "https://api.example.com",
              },
            },
            start: {
              command: "npm start",
              port: 3000,
              healthCheck: {
                path: "/api/health",
                interval: 30,
              },
            },
          },
          worker: {
            start: { command: "npm run worker" },
          },
        },
        deploy: {
          strategy: "blue-green",
          healthCheck: {
            path: "/health",
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
      };

      await fileSystem.createFile("cygni.yml", yaml.dump(complexConfig));

      const result = await configService.loadConfig();
      expect(result).toEqual(complexConfig);
    });
  });

  describe("saveConfig", () => {
    it("should save config as YAML with proper formatting", async () => {
      const config: CygniConfig = {
        name: "test-project",
        projectId: "proj-123",
        framework: "nextjs",
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npm run start", port: 3000 },
          },
        },
      };

      await configService.saveConfig(config);

      const savedPath = path.join(testDir, "cygni.yml");
      const exists = await fileSystem.exists(savedPath);
      expect(exists).toBe(true);

      const content = await fs.readFile(savedPath, "utf-8");
      expect(content).toContain("name: test-project");
      expect(content).toContain("projectId: proj-123");
      expect(content).toContain("framework: nextjs");
      expect(content).toContain("command: npm run build");

      // Verify it's valid YAML
      const parsed = yaml.load(content) as CygniConfig;
      expect(parsed).toEqual(config);
    });

    it("should handle optional fields correctly", async () => {
      const config: CygniConfig = {
        name: "minimal-project",
      };

      await configService.saveConfig(config);

      const content = await fileSystem.readFile("cygni.yml");
      expect(content).toContain("name: minimal-project");
      expect(content).not.toContain("projectId:");
      expect(content).not.toContain("framework:");
      expect(content).not.toContain("services:");
    });

    it("should preserve special characters and strings", async () => {
      const config: CygniConfig = {
        name: "special-chars-project",
        environment: {
          API_KEY: "sk-1234567890!@#$%^&*()",
          DATABASE_URL: "postgres://user:pass@host:5432/db?ssl=true",
          SPECIAL_CHARS: "Line1\nLine2\tTab",
        },
      };

      await configService.saveConfig(config);

      const content = await fileSystem.readFile("cygni.yml");
      const parsed = yaml.load(content) as CygniConfig;

      expect(parsed.environment.API_KEY).toBe("sk-1234567890!@#$%^&*()");
      expect(parsed.environment.DATABASE_URL).toBe(
        "postgres://user:pass@host:5432/db?ssl=true",
      );
      expect(parsed.environment.SPECIAL_CHARS).toBe("Line1\nLine2\tTab");
    });

    it("should overwrite existing config file", async () => {
      await configService.saveConfig({ name: "old-project" });
      await configService.saveConfig({
        name: "new-project",
        framework: "react",
      });

      const content = await fileSystem.readFile("cygni.yml");
      expect(content).toContain("name: new-project");
      expect(content).toContain("framework: react");
      expect(content).not.toContain("old-project");
    });

    it("should handle write permission errors", async () => {
      // Make directory read-only
      await fs.chmod(testDir, 0o555);

      await expect(
        configService.saveConfig({ name: "test" }),
      ).rejects.toThrow();

      // Restore permissions for cleanup
      await fs.chmod(testDir, 0o755);
    });
  });

  describe("updateConfig", () => {
    it("should update existing config preserving other fields", async () => {
      const existingConfig: CygniConfig = {
        name: "old-name",
        framework: "react",
        projectId: "proj-123",
      };

      await configService.saveConfig(existingConfig);

      await configService.updateConfig({
        name: "new-name",
        environment: { NODE_ENV: "production" },
      });

      const updated = await configService.loadConfig();
      expect(updated.name).toBe("new-name");
      expect(updated.framework).toBe("react"); // Preserved
      expect(updated.projectId).toBe("proj-123"); // Preserved
      expect(updated.environment).toEqual({ NODE_ENV: "production" }); // Added
    });

    it("should handle deep nested updates", async () => {
      const existingConfig: CygniConfig = {
        name: "test-project",
        services: {
          web: {
            start: { command: "npm start", port: 3000 },
            build: { command: "npm run build" },
          },
        },
      };

      await configService.saveConfig(existingConfig);

      await configService.updateConfig({
        services: {
          web: {
            start: { port: 8080 }, // Update only port
            deploy: { strategy: "rolling" }, // Add new field
          },
          worker: {
            // Add new service
            start: { command: "npm run worker" },
          },
        },
      });

      const updated = await configService.loadConfig();
      expect(updated.services.web.start.command).toBe("npm start"); // Preserved
      expect(updated.services.web.start.port).toBe(8080); // Updated
      expect(updated.services.web.build.command).toBe("npm run build"); // Preserved
      expect(updated.services.web.deploy).toEqual({ strategy: "rolling" }); // Added
      expect(updated.services.worker).toEqual({
        start: { command: "npm run worker" },
      }); // Added
    });

    it("should handle updates when config doesn't exist", async () => {
      await expect(configService.updateConfig({ name: "new" })).rejects.toThrow(
        "No cygni configuration file found",
      );
    });
  });

  describe("createProjectConfig", () => {
    it("should create config with Next.js defaults", () => {
      const config = configService.createProjectConfig(
        "next-project",
        "nextjs",
      );

      expect(config).toEqual({
        name: "next-project",
        framework: "nextjs",
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npm start", port: 3000 },
          },
        },
        deploy: {
          strategy: "rolling",
          healthCheck: {
            path: "/health",
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
      });
    });

    it("should create config with Django defaults", () => {
      const config = configService.createProjectConfig(
        "django-project",
        "django",
      );

      expect(config).toEqual({
        name: "django-project",
        framework: "django",
        services: {
          web: {
            start: {
              command: "python manage.py runserver 0.0.0.0:8000",
              port: 8000,
            },
          },
        },
        deploy: expect.any(Object),
      });
    });

    it("should handle unknown framework", () => {
      const config = configService.createProjectConfig(
        "custom-project",
        "custom-framework",
      );

      expect(config).toEqual({
        name: "custom-project",
        framework: "custom-framework",
        services: { web: {} },
        deploy: expect.any(Object),
      });
    });

    it("should create minimal config without framework", () => {
      const config = configService.createProjectConfig("minimal-project");

      expect(config).toEqual({
        name: "minimal-project",
        framework: undefined,
        deploy: expect.any(Object),
      });
    });

    it("should handle framework name variations", () => {
      const configNext = configService.createProjectConfig("p1", "next");
      const configNextJS = configService.createProjectConfig("p2", "nextjs");

      expect(configNext.services).toEqual(configNextJS.services);
    });
  });

  describe("utility methods", () => {
    it("should check if config exists", async () => {
      expect(await configService.exists()).toBe(false);

      await configService.saveConfig({ name: "test" });

      expect(await configService.exists()).toBe(true);
    });

    it("should get config file path", async () => {
      expect(await configService.getConfigPath()).toBeNull();

      await configService.saveConfig({ name: "test" });

      const configPath = await configService.getConfigPath();
      expect(configPath).toBe(path.join(testDir, "cygni.yml"));
    });

    it("should find yaml file path", async () => {
      await fileSystem.createFile("cygni.yaml", yaml.dump({ name: "test" }));

      const configPath = await configService.getConfigPath();
      expect(configPath).toBe(path.join(testDir, "cygni.yaml"));
    });

    it("should find json file path", async () => {
      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify({ name: "test" }),
      );

      const configPath = await configService.getConfigPath();
      expect(configPath).toBe(path.join(testDir, "cygni.json"));
    });
  });

  describe("real-world scenarios", () => {
    it("should handle config migration from JSON to YAML", async () => {
      // Start with JSON
      const jsonConfig: CygniConfig = {
        name: "migrating-project",
        framework: "react",
      };
      await fileSystem.createFile(
        "cygni.json",
        JSON.stringify(jsonConfig, null, 2),
      );

      // Load, update and save (which creates YAML)
      const loaded = await configService.loadConfig();
      loaded.migrated = true;
      await configService.saveConfig(loaded);

      // Remove old JSON
      await fileSystem.remove("cygni.json");

      // Verify YAML is now used
      const final = await configService.loadConfig();
      expect(final.name).toBe("migrating-project");
      expect(final.migrated).toBe(true);

      const configPath = await configService.getConfigPath();
      expect(configPath).toContain("cygni.yml");
    });

    it("should preserve comments when possible", async () => {
      const configWithComments = `# Project configuration
name: commented-project
# Framework settings
framework: nextjs

services:
  web:
    # Build configuration
    build:
      command: npm run build
    # Start configuration  
    start:
      command: npm start
      port: 3000
`;

      await fileSystem.createFile("cygni.yml", configWithComments);

      const loaded = await configService.loadConfig();
      expect(loaded.name).toBe("commented-project");

      // Note: Comments are lost when re-saving through YAML dump
      // This is a known limitation of the yaml library
    });

    it("should handle very large configurations", async () => {
      const largeConfig: CygniConfig = {
        name: "large-project",
        framework: "nextjs",
        services: {},
        environment: {},
      };

      // Add many services
      for (let i = 0; i < 50; i++) {
        largeConfig.services![`service-${i}`] = {
          start: { command: `npm run service-${i}`, port: 3000 + i },
        };
      }

      // Add many environment variables
      for (let i = 0; i < 100; i++) {
        largeConfig.environment![`VAR_${i}`] = `value_${i}`;
      }

      await configService.saveConfig(largeConfig);
      const loaded = await configService.loadConfig();

      expect(Object.keys(loaded.services!).length).toBe(50);
      expect(Object.keys(loaded.environment!).length).toBe(100);
    });
  });
});
