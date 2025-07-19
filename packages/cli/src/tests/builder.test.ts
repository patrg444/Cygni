import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildProject, BuildConfig } from "../lib/builder";
import fs from "fs/promises";
import * as frameworkDetector from "../utils/framework-detector";

vi.mock("fs/promises");
vi.mock("../utils/framework-detector");

// Mock child_process
vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, callback: any) => {
    // Default behavior - can be overridden in individual tests
    if (cmd === "git rev-parse HEAD") {
      callback(null, { stdout: "abc123def456\n" }, "");
    } else if (cmd === "git rev-parse --abbrev-ref HEAD") {
      callback(null, { stdout: "main\n" }, "");
    } else {
      callback(new Error("Command not found"));
    }
  }),
}));

describe("Builder", () => {
  const mockConfig: BuildConfig = {
    name: "test-app",
    framework: "nextjs",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildProject", () => {
    it("should get git info successfully", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("No Dockerfile"));

      const result = await buildProject(mockConfig);

      expect(result.commitSha).toBe("abc123def456");
      expect(result.branch).toBe("main");
      expect(result.hasDockerfile).toBe(false);
    });

    it("should handle non-git repository gracefully", async () => {
      // Mock exec to return error for git commands
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((_cmd, _options, callback) => {
        const cb = typeof _options === 'function' ? _options : callback;
        cb?.(new Error("Not a git repository"), '', '');
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error("No Dockerfile"));

      const result = await buildProject(mockConfig);

      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.branch).toBe("main");
    });

    it("should detect Dockerfile when present", async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined); // Dockerfile exists

      const result = await buildProject(mockConfig);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe("Dockerfile");
    });

    it("should auto-detect framework when not specified", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("No Dockerfile"));
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValue("react");

      const configWithoutFramework = { ...mockConfig, framework: undefined };
      const result = await buildProject(configWithoutFramework);

      expect(result.detectedFramework).toBe("react");
      expect(frameworkDetector.detectFramework).toHaveBeenCalled();
    });

    it("should run pre-build commands when specified", async () => {
      let prebuildCommandRun = false;

      // Mock exec to track prebuild command
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((_cmd, _options, callback) => {
        const cb = typeof _options === 'function' ? _options : callback;
        const cmdStr = typeof _cmd === 'string' ? _cmd : '';
        if (cmdStr === "git rev-parse HEAD") {
          cb?.(null, "abc123def456\n", "");
        } else if (cmdStr === "git rev-parse --abbrev-ref HEAD") {
          cb?.(null, "main\n", "");
        } else if (cmdStr === "npm run prebuild") {
          prebuildCommandRun = true;
          cb?.(null, "Prebuild complete\n", "");
        } else {
          cb?.(new Error("Command not found"), '', '');
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error("No Dockerfile"));

      const configWithPrebuild: BuildConfig = {
        ...mockConfig,
        services: {
          web: {
            build: {
              command: "npm run prebuild",
            },
          },
        },
      };

      await buildProject(configWithPrebuild);

      expect(prebuildCommandRun).toBe(true);
    });

    it("should set correct buildpack args for Next.js", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("No Dockerfile"));

      const result = await buildProject(mockConfig);

      expect(result.buildArgs).toEqual({
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      });
    });

    it("should check lowercase dockerfile variant", async () => {
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error("No Dockerfile")) // Dockerfile
        .mockResolvedValueOnce(undefined); // dockerfile exists

      const result = await buildProject(mockConfig);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe("dockerfile");
    });
  });
});
