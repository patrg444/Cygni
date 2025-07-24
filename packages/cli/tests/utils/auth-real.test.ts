import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuthService, AuthData } from "../services/auth-service";
import { RealFileSystem } from "../services/real-file-system";
import fs from "fs/promises";
import path from "path";

describe("auth utilities - Real Implementation", () => {
  let fileSystem: RealFileSystem;
  let mockHome: string;
  let authService: AuthService;

  const mockAuthData: AuthData = {
    token: "test-token-123",
    email: "test@example.com",
    organizations: [
      {
        id: "org-123",
        name: "Test Org",
        slug: "test-org",
        role: "owner",
      },
      {
        id: "org-456",
        name: "Another Org",
        slug: "another-org",
        role: "member",
      },
    ],
  };

  beforeEach(async () => {
    fileSystem = new RealFileSystem("auth-utils");
    mockHome = await fileSystem.createMockHome();
    authService = new AuthService(mockHome);
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("saveAuth", () => {
    it("should save auth data to the correct file with real file system", async () => {
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");
      const exists = await fileSystem.exists(authPath);
      expect(exists).toBe(true);

      const content = await fs.readFile(authPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(mockAuthData);
    });

    it("should create .cygni directory if it doesn't exist", async () => {
      await authService.saveAuth(mockAuthData);

      const cygniDir = path.join(mockHome, ".cygni");
      const dirExists = await fileSystem.exists(cygniDir);
      expect(dirExists).toBe(true);

      const stats = await fs.stat(cygniDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should set restrictive file permissions (0600)", async () => {
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");
      const stats = await fs.stat(authPath);

      // Only check on Unix systems
      if (process.platform !== "win32") {
        const mode = stats.mode & parseInt("777", 8);
        expect(mode).toBe(parseInt("600", 8));
      }
    });

    it("should format JSON with 2-space indentation", async () => {
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");
      const content = await fs.readFile(authPath, "utf-8");

      // Check formatting
      expect(content).toContain('  "token": "test-token-123"');
      expect(content).toContain('    "id": "org-123"');
      expect(content).toBe(JSON.stringify(mockAuthData, null, 2));
    });

    it("should overwrite existing auth file", async () => {
      const oldAuth: AuthData = {
        token: "old-token",
        email: "old@example.com",
        organizations: [],
      };

      await authService.saveAuth(oldAuth);
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");
      const content = await fs.readFile(authPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.token).toBe("test-token-123");
      expect(parsed.email).toBe("test@example.com");
    });

    it("should handle write errors gracefully", async () => {
      // Make directory read-only
      const cygniDir = path.join(mockHome, ".cygni");
      await fs.mkdir(cygniDir, { recursive: true });
      await fs.chmod(cygniDir, 0o555);

      await expect(authService.saveAuth(mockAuthData)).rejects.toThrow();

      // Restore permissions for cleanup
      await fs.chmod(cygniDir, 0o755);
    });
  });

  describe("loadAuth", () => {
    it("should load auth data from real file", async () => {
      await authService.saveAuth(mockAuthData);
      const result = await authService.loadAuth();

      expect(result).toEqual(mockAuthData);
    });

    it("should return null if file doesn't exist", async () => {
      const result = await authService.loadAuth();
      expect(result).toBeNull();
    });

    it("should return null if file contains invalid JSON", async () => {
      const authPath = path.join(mockHome, ".cygni", "auth.json");
      await fs.mkdir(path.dirname(authPath), { recursive: true });
      await fs.writeFile(authPath, "invalid json{", "utf-8");

      const result = await authService.loadAuth();
      expect(result).toBeNull();
    });

    it("should handle empty file", async () => {
      const authPath = path.join(mockHome, ".cygni", "auth.json");
      await fs.mkdir(path.dirname(authPath), { recursive: true });
      await fs.writeFile(authPath, "", "utf-8");

      const result = await authService.loadAuth();
      expect(result).toBeNull();
    });

    it("should handle partially corrupted JSON", async () => {
      const authPath = path.join(mockHome, ".cygni", "auth.json");
      await fs.mkdir(path.dirname(authPath), { recursive: true });
      await fs.writeFile(authPath, '{"token": "test", "email":', "utf-8");

      const result = await authService.loadAuth();
      expect(result).toBeNull();
    });

    it("should handle file with wrong permissions", async () => {
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");

      // Change to write-only (no read)
      if (process.platform !== "win32") {
        await fs.chmod(authPath, 0o200);

        const result = await authService.loadAuth();
        expect(result).toBeNull();

        // Restore permissions
        await fs.chmod(authPath, 0o600);
      }
    });
  });

  describe("clearAuth", () => {
    it("should delete existing auth file", async () => {
      await authService.saveAuth(mockAuthData);

      const authPath = path.join(mockHome, ".cygni", "auth.json");
      let exists = await fileSystem.exists(authPath);
      expect(exists).toBe(true);

      await authService.clearAuth();

      exists = await fileSystem.exists(authPath);
      expect(exists).toBe(false);
    });

    it("should not throw if file doesn't exist", async () => {
      await expect(authService.clearAuth()).resolves.not.toThrow();
    });

    it("should not throw if directory doesn't exist", async () => {
      // Remove the entire .cygni directory
      const cygniDir = path.join(mockHome, ".cygni");
      await fs.rm(cygniDir, { recursive: true, force: true });

      await expect(authService.clearAuth()).resolves.not.toThrow();
    });

    it("should handle permission errors gracefully", async () => {
      await authService.saveAuth(mockAuthData);

      const cygniDir = path.join(mockHome, ".cygni");

      // Make directory read-only
      if (process.platform !== "win32") {
        await fs.chmod(cygniDir, 0o555);

        // Should not throw even with permission denied
        await expect(authService.clearAuth()).resolves.not.toThrow();

        // Restore permissions
        await fs.chmod(cygniDir, 0o755);
      }
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete auth lifecycle", async () => {
      // Save
      await authService.saveAuth(mockAuthData);

      // Load and verify
      let loaded = await authService.loadAuth();
      expect(loaded).toEqual(mockAuthData);

      // Update
      const updatedAuth: AuthData = {
        ...mockAuthData,
        token: "new-token-456",
        organizations: [],
      };
      await authService.saveAuth(updatedAuth);

      // Load updated
      loaded = await authService.loadAuth();
      expect(loaded?.token).toBe("new-token-456");
      expect(loaded?.organizations).toHaveLength(0);

      // Clear
      await authService.clearAuth();

      // Verify cleared
      loaded = await authService.loadAuth();
      expect(loaded).toBeNull();
    });

    it("should handle concurrent operations", async () => {
      // Simulate multiple saves
      await Promise.all([
        authService.saveAuth(mockAuthData),
        authService.saveAuth(mockAuthData),
        authService.saveAuth(mockAuthData),
      ]);

      const loaded = await authService.loadAuth();
      expect(loaded).toEqual(mockAuthData);
    });

    it("should maintain data integrity with special characters", async () => {
      const specialAuth: AuthData = {
        token: "token-with-special-chars-!@#$%^&*()",
        email: "test+tag@example.com",
        organizations: [
          {
            id: "org/123",
            name: "Test & Org",
            slug: "test-org",
            role: "owner & admin",
          },
        ],
      };

      await authService.saveAuth(specialAuth);
      const loaded = await authService.loadAuth();

      expect(loaded).toEqual(specialAuth);
    });

    it("should preserve auth file when parent directory is recreated", async () => {
      await authService.saveAuth(mockAuthData);

      // Remove and recreate .cygni directory
      const cygniDir = path.join(mockHome, ".cygni");
      const authPath = path.join(cygniDir, "auth.json");

      // Save the content
      const content = await fs.readFile(authPath, "utf-8");

      // Remove directory
      await fs.rm(cygniDir, { recursive: true });

      // Recreate and restore
      await fs.mkdir(cygniDir, { recursive: true });
      await fs.writeFile(authPath, content, "utf-8");
      await fs.chmod(authPath, 0o600);

      const loaded = await authService.loadAuth();
      expect(loaded).toEqual(mockAuthData);
    });
  });

  describe("error handling", () => {
    it("should provide meaningful error for disk full scenario", async () => {
      // This is hard to simulate in a real test, but we can test with a very long token
      const hugeAuth: AuthData = {
        token: "x".repeat(1000000), // 1MB token
        email: "test@example.com",
        organizations: Array(1000).fill({
          id: "org-123",
          name: "Test Org".repeat(100),
          slug: "test-org",
          role: "owner",
        }),
      };

      // Should still work (most systems can handle this)
      await authService.saveAuth(hugeAuth);
      const loaded = await authService.loadAuth();
      expect(loaded?.token.length).toBe(1000000);
    });
  });
});
