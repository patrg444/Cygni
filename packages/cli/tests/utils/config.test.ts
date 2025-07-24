import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadConfig,
  saveConfig,
  updateConfig,
  createProjectConfig,
  CygniConfig,
} from "../../src/utils/config";
import fs from "fs/promises";
import path from "path";
import * as yaml from "js-yaml";

vi.mock("fs/promises");

describe("config utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadConfig", () => {
    it("should load YAML config file", async () => {
      const mockConfig: CygniConfig = {
        name: "test-project",
        framework: "nextjs",
        services: {
          web: {
            start: { command: "npm start", port: 3000 },
          },
        },
      };

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yml not found
        .mockResolvedValueOnce(yaml.dump(mockConfig)); // cygni.yaml found

      const result = await loadConfig();

      expect(fs.readFile).toHaveBeenCalledWith("cygni.yml", "utf-8");
      expect(fs.readFile).toHaveBeenCalledWith("cygni.yaml", "utf-8");
      expect(result).toEqual(mockConfig);
    });

    it("should load JSON config file", async () => {
      const mockConfig: CygniConfig = {
        name: "test-project",
        framework: "react",
      };

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yml not found
        .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yaml not found
        .mockResolvedValueOnce(JSON.stringify(mockConfig)); // cygni.json found

      const result = await loadConfig();

      expect(fs.readFile).toHaveBeenCalledWith("cygni.json", "utf-8");
      expect(result).toEqual(mockConfig);
    });

    it("should load config from custom directory", async () => {
      const mockConfig: CygniConfig = { name: "custom-project" };

      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml.dump(mockConfig));

      const result = await loadConfig("./custom-dir");

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join("./custom-dir", "cygni.yml"),
        "utf-8",
      );
      expect(result).toEqual(mockConfig);
    });

    it("should throw error if no config file found", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      await expect(loadConfig()).rejects.toThrow(
        'No cygni configuration file found. Run "cygni init" to create one.',
      );

      expect(fs.readFile).toHaveBeenCalledTimes(3); // All config files attempted
    });

    it("should continue to next file on YAML parse errors", async () => {
      // First file has invalid YAML, second file not found, third file not found
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce("invalid:\n  - yaml\n  content: [") // cygni.yml - invalid
        .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yaml
        .mockRejectedValueOnce(new Error("ENOENT")); // cygni.json

      await expect(loadConfig()).rejects.toThrow(
        "No cygni configuration file found",
      );
    });

    it("should handle JSON parse errors", async () => {
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce("{ invalid json }");

      await expect(loadConfig()).rejects.toThrow(
        "No cygni configuration file found",
      );
    });
  });

  describe("saveConfig", () => {
    it("should save config as YAML", async () => {
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

      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await saveConfig(config);

      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("name: test-project"),
        "utf-8",
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("projectId: proj-123"),
        "utf-8",
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("framework: nextjs"),
        "utf-8",
      );
    });

    it("should save config to custom directory", async () => {
      const config: CygniConfig = { name: "test-project" };

      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await saveConfig(config, "./custom-dir");

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join("./custom-dir", "cygni.yml"),
        expect.any(String),
        "utf-8",
      );
    });

    it("should handle optional fields correctly", async () => {
      const config: CygniConfig = {
        name: "minimal-project",
      };

      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await saveConfig(config);

      const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(savedContent).toContain("name: minimal-project");
      expect(savedContent).not.toContain("projectId:");
      expect(savedContent).not.toContain("framework:");
    });

    it("should format services correctly", async () => {
      const config: CygniConfig = {
        name: "service-project",
        services: {
          web: {
            start: { command: "node index.js", port: 8080 },
          },
        },
      };

      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await saveConfig(config);

      const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(savedContent).toContain("start:");
      expect(savedContent).toContain("command: node index.js");
      expect(savedContent).toContain("port: 8080");
    });

    it("should handle write errors", async () => {
      const config: CygniConfig = { name: "test-project" };

      vi.mocked(fs.writeFile).mockRejectedValueOnce(
        new Error("Permission denied"),
      );

      await expect(saveConfig(config)).rejects.toThrow("Permission denied");
    });
  });

  describe("updateConfig", () => {
    it("should update existing config", async () => {
      const existingConfig: CygniConfig = {
        name: "old-name",
        framework: "react",
      };

      const updates: Partial<CygniConfig> = {
        name: "new-name",
        projectId: "proj-456",
      };

      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml.dump(existingConfig));
      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await updateConfig(updates);

      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("name: new-name"),
        "utf-8",
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("projectId: proj-456"),
        "utf-8",
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        "cygni.yml",
        expect.stringContaining("framework: react"),
        "utf-8",
      );
    });

    it("should handle nested updates", async () => {
      const existingConfig: CygniConfig = {
        name: "test-project",
        services: {
          web: {
            start: { command: "npm start", port: 3000 },
          },
        },
      };

      const updates: Partial<CygniConfig> = {
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npm run prod", port: 8080 },
          },
        },
      };

      vi.mocked(fs.readFile).mockResolvedValueOnce(yaml.dump(existingConfig));
      vi.mocked(fs.writeFile).mockResolvedValueOnce();

      await updateConfig(updates);

      const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(savedContent).toContain("build:");
      expect(savedContent).toContain("command: npm run build");
      expect(savedContent).toContain("command: npm run prod");
      expect(savedContent).toContain("port: 8080");
    });
  });

  describe("createProjectConfig", () => {
    it("should create config with framework defaults", async () => {
      const config = createProjectConfig("next-project", "next");

      expect(config).toEqual({
        name: "next-project",
        framework: "next",
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npm run start", port: 3000 },
          },
        },
      });
    });

    it("should create config for React framework", async () => {
      const config = createProjectConfig("react-project", "react");

      expect(config).toEqual({
        name: "react-project",
        framework: "react",
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npx serve -s build", port: 3000 },
          },
        },
      });
    });

    it("should create config for Node framework", async () => {
      const config = createProjectConfig("node-project", "node");

      expect(config).toEqual({
        name: "node-project",
        framework: "node",
        services: {
          web: {
            start: { command: "npm start", port: 3000 },
          },
        },
      });
    });

    it("should create minimal config for unknown framework", async () => {
      const config = createProjectConfig("custom-project", "custom-framework");

      expect(config).toEqual({
        name: "custom-project",
        framework: "custom-framework",
        services: {
          web: {},
        },
      });
    });

    it("should create minimal config without framework", async () => {
      const config = createProjectConfig("minimal-project");

      expect(config).toEqual({
        name: "minimal-project",
        framework: undefined,
        services: {
          web: undefined,
        },
      });
    });
  });
});
