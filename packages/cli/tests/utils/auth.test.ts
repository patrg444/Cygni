import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveAuth, loadAuth, clearAuth, AuthData } from "../../src/utils/auth";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("fs/promises");

describe("auth utilities", () => {
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
    ],
  };

  const expectedAuthPath = path.join(os.homedir(), ".cygni", "auth.json");
  const expectedAuthDir = path.dirname(expectedAuthPath);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveAuth", () => {
    it("should save auth data to the correct file", async () => {
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValueOnce();
      vi.mocked(fs.chmod).mockResolvedValueOnce();

      await saveAuth(mockAuthData);

      expect(fs.mkdir).toHaveBeenCalledWith(expectedAuthDir, {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedAuthPath,
        JSON.stringify(mockAuthData, null, 2),
        "utf-8",
      );
      expect(fs.chmod).toHaveBeenCalledWith(expectedAuthPath, 0o600);
    });

    it("should create directory with recursive option", async () => {
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValueOnce();
      vi.mocked(fs.chmod).mockResolvedValueOnce();

      await saveAuth(mockAuthData);

      expect(fs.mkdir).toHaveBeenCalledWith(expectedAuthDir, {
        recursive: true,
      });
    });

    it("should set restrictive file permissions", async () => {
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValueOnce();
      vi.mocked(fs.chmod).mockResolvedValueOnce();

      await saveAuth(mockAuthData);

      expect(fs.chmod).toHaveBeenCalledWith(expectedAuthPath, 0o600);
    });

    it("should handle write errors", async () => {
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("Write failed"));

      await expect(saveAuth(mockAuthData)).rejects.toThrow("Write failed");
    });
  });

  describe("loadAuth", () => {
    it("should load auth data from file", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify(mockAuthData),
      );

      const result = await loadAuth();

      expect(fs.readFile).toHaveBeenCalledWith(expectedAuthPath, "utf-8");
      expect(result).toEqual(mockAuthData);
    });

    it("should return null if file doesn't exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(
        new Error("ENOENT: no such file or directory"),
      );

      const result = await loadAuth();

      expect(result).toBeNull();
    });

    it("should return null if file contains invalid JSON", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce("invalid json");

      const result = await loadAuth();

      expect(result).toBeNull();
    });

    it("should handle empty file", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce("");

      const result = await loadAuth();

      expect(result).toBeNull();
    });
  });

  describe("clearAuth", () => {
    it("should delete auth file", async () => {
      vi.mocked(fs.unlink).mockResolvedValueOnce();

      await clearAuth();

      expect(fs.unlink).toHaveBeenCalledWith(expectedAuthPath);
    });

    it("should not throw if file doesn't exist", async () => {
      vi.mocked(fs.unlink).mockRejectedValueOnce(
        new Error("ENOENT: no such file or directory"),
      );

      await expect(clearAuth()).resolves.not.toThrow();
    });

    it("should handle other unlink errors", async () => {
      vi.mocked(fs.unlink).mockRejectedValueOnce(
        new Error("Permission denied"),
      );

      await expect(clearAuth()).resolves.not.toThrow();
    });
  });

  describe("integration scenarios", () => {
    it("should handle save and load cycle", async () => {
      let savedData: string;

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockImplementation(async (path, data) => {
        savedData = data as string;
      });
      vi.mocked(fs.chmod).mockResolvedValue();
      vi.mocked(fs.readFile).mockImplementation(async () => savedData);

      await saveAuth(mockAuthData);
      const loaded = await loadAuth();

      expect(loaded).toEqual(mockAuthData);
    });

    it("should handle clear after save", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.chmod).mockResolvedValue();
      vi.mocked(fs.unlink).mockResolvedValue();
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      await saveAuth(mockAuthData);
      await clearAuth();
      const loaded = await loadAuth();

      expect(loaded).toBeNull();
    });
  });
});
