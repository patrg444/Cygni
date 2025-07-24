import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { saveConfig, loadConfig, updateConfig } from "../src/utils/config";
import { saveAuth, loadAuth, clearAuth } from "../src/utils/auth";
import { detectFramework } from "../src/utils/framework-detector";

describe("Real User Actions - No Mocks", () => {
  const testDir = path.join(os.tmpdir(), `cygni-real-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("User creates and manages project configuration", () => {
    it("should create a config file that can be loaded back", async () => {
      const configPath = path.join(testDir, "cygni.yml");

      // User creates a new project config
      const config = {
        name: "my-real-app",
        framework: "nextjs",
        services: {
          web: {
            build: { command: "npm run build" },
            start: { command: "npm start", port: 3000 },
          },
        },
      };

      // Save config to actual file
      await saveConfig(config, testDir);

      // Verify file exists
      const fileExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Load it back
      const loaded = await loadConfig(testDir);
      expect(loaded.name).toBe("my-real-app");
      expect(loaded.framework).toBe("nextjs");
    });

    it("should update existing config", async () => {
      // Create initial config
      await saveConfig({ name: "test-app", framework: "react" }, testDir);

      // Update it
      await updateConfig(
        { framework: "nextjs", projectId: "proj_123" },
        testDir,
      );

      // Verify updates
      const updated = await loadConfig(testDir);
      expect(updated.name).toBe("test-app"); // Original preserved
      expect(updated.framework).toBe("nextjs"); // Updated
      expect(updated.projectId).toBe("proj_123"); // Added
    });
  });

  describe("User manages authentication", () => {
    it("should save and load auth credentials securely", async () => {
      const authData = {
        token: "real-token-123",
        email: "user@example.com",
        organizations: [
          {
            id: "org-1",
            name: "My Org",
            slug: "my-org",
            role: "owner",
          },
        ],
      };

      // Save auth
      await saveAuth(authData);

      // Load it back
      const loaded = await loadAuth();
      expect(loaded).toEqual(authData);

      // Clear auth
      await clearAuth();

      // Verify it's gone
      const cleared = await loadAuth();
      expect(cleared).toBeNull();
    });

    it("should set correct file permissions on auth file", async () => {
      await saveAuth({
        token: "secure-token",
        email: "test@example.com",
        organizations: [],
      });

      const authPath = path.join(os.homedir(), ".cygni", "auth.json");
      const stats = await fs.stat(authPath);

      // Check permissions (on Unix systems)
      if (process.platform !== "win32") {
        const mode = stats.mode & parseInt("777", 8);
        expect(mode).toBe(parseInt("600", 8)); // Owner read/write only
      }

      await clearAuth();
    });
  });

  describe("User detects project framework", () => {
    it("should detect Next.js project", async () => {
      // Create Next.js project structure
      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "nextjs-app",
          dependencies: { next: "13.0.0", react: "18.0.0" },
        }),
      );
      await fs.writeFile(
        path.join(testDir, "next.config.js"),
        "module.exports = {}",
      );

      const framework = await detectFramework(testDir);
      expect(framework).toBe("nextjs");
    });

    it("should detect Django project", async () => {
      await fs.writeFile(
        path.join(testDir, "manage.py"),
        "#!/usr/bin/env python",
      );
      await fs.writeFile(
        path.join(testDir, "requirements.txt"),
        "django==4.2.0\npsycopg2==2.9.0",
      );

      const framework = await detectFramework(testDir);
      expect(framework).toBe("django");
    });

    it("should return undefined for unknown project", async () => {
      await fs.writeFile(path.join(testDir, "random.txt"), "some content");

      const framework = await detectFramework(testDir);
      expect(framework).toBeUndefined();
    });
  });

  describe("User validates deployment configuration", () => {
    it("should validate deployment options", async () => {
      const { validateDeploymentOptions } = await import(
        "../src/lib/deploy-helpers"
      );

      // Valid options should not throw
      expect(() => {
        validateDeploymentOptions({
          strategy: "rolling",
          healthGate: "normal",
        });
      }).not.toThrow();

      // Invalid strategy should throw
      expect(() => {
        validateDeploymentOptions({
          strategy: "invalid-strategy",
        });
      }).toThrow("Invalid deployment strategy");

      // Invalid health gate should throw
      expect(() => {
        validateDeploymentOptions({
          healthGate: "super-strict",
        });
      }).toThrow("Invalid health gate level");
    });
  });

  describe("User creates project with framework defaults", () => {
    it("should create proper config for different frameworks", async () => {
      const { createProjectConfig } = await import("../src/utils/config");

      // Next.js project
      const nextConfig = createProjectConfig("next-app", "next");
      expect(nextConfig.services?.web?.build?.command).toBe("npm run build");
      expect(nextConfig.services?.web?.start?.port).toBe(3000);

      // React project
      const reactConfig = createProjectConfig("react-app", "react");
      expect(reactConfig.services?.web?.start?.command).toBe(
        "npx serve -s build",
      );

      // Node.js project
      const nodeConfig = createProjectConfig("node-app", "node");
      expect(nodeConfig.services?.web?.start?.command).toBe("npm start");
      expect(nodeConfig.services?.web?.build).toBeUndefined(); // No build step
    });
  });
});
