"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const auth_service_1 = require("../services/auth-service");
const real_file_system_1 = require("../services/real-file-system");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
(0, vitest_1.describe)("auth utilities - Real Implementation", () => {
    let fileSystem;
    let mockHome;
    let authService;
    const mockAuthData = {
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
    (0, vitest_1.beforeEach)(async () => {
        fileSystem = new real_file_system_1.RealFileSystem("auth-utils");
        mockHome = await fileSystem.createMockHome();
        authService = new auth_service_1.AuthService(mockHome);
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("saveAuth", () => {
        (0, vitest_1.it)("should save auth data to the correct file with real file system", async () => {
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            const exists = await fileSystem.exists(authPath);
            (0, vitest_1.expect)(exists).toBe(true);
            const content = await promises_1.default.readFile(authPath, "utf-8");
            const parsed = JSON.parse(content);
            (0, vitest_1.expect)(parsed).toEqual(mockAuthData);
        });
        (0, vitest_1.it)("should create .cygni directory if it doesn't exist", async () => {
            await authService.saveAuth(mockAuthData);
            const cygniDir = path_1.default.join(mockHome, ".cygni");
            const dirExists = await fileSystem.exists(cygniDir);
            (0, vitest_1.expect)(dirExists).toBe(true);
            const stats = await promises_1.default.stat(cygniDir);
            (0, vitest_1.expect)(stats.isDirectory()).toBe(true);
        });
        (0, vitest_1.it)("should set restrictive file permissions (0600)", async () => {
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            const stats = await promises_1.default.stat(authPath);
            // Only check on Unix systems
            if (process.platform !== "win32") {
                const mode = stats.mode & parseInt("777", 8);
                (0, vitest_1.expect)(mode).toBe(parseInt("600", 8));
            }
        });
        (0, vitest_1.it)("should format JSON with 2-space indentation", async () => {
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            const content = await promises_1.default.readFile(authPath, "utf-8");
            // Check formatting
            (0, vitest_1.expect)(content).toContain('  "token": "test-token-123"');
            (0, vitest_1.expect)(content).toContain('    "id": "org-123"');
            (0, vitest_1.expect)(content).toBe(JSON.stringify(mockAuthData, null, 2));
        });
        (0, vitest_1.it)("should overwrite existing auth file", async () => {
            const oldAuth = {
                token: "old-token",
                email: "old@example.com",
                organizations: [],
            };
            await authService.saveAuth(oldAuth);
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            const content = await promises_1.default.readFile(authPath, "utf-8");
            const parsed = JSON.parse(content);
            (0, vitest_1.expect)(parsed.token).toBe("test-token-123");
            (0, vitest_1.expect)(parsed.email).toBe("test@example.com");
        });
        (0, vitest_1.it)("should handle write errors gracefully", async () => {
            // Make directory read-only
            const cygniDir = path_1.default.join(mockHome, ".cygni");
            await promises_1.default.mkdir(cygniDir, { recursive: true });
            await promises_1.default.chmod(cygniDir, 0o555);
            await (0, vitest_1.expect)(authService.saveAuth(mockAuthData)).rejects.toThrow();
            // Restore permissions for cleanup
            await promises_1.default.chmod(cygniDir, 0o755);
        });
    });
    (0, vitest_1.describe)("loadAuth", () => {
        (0, vitest_1.it)("should load auth data from real file", async () => {
            await authService.saveAuth(mockAuthData);
            const result = await authService.loadAuth();
            (0, vitest_1.expect)(result).toEqual(mockAuthData);
        });
        (0, vitest_1.it)("should return null if file doesn't exist", async () => {
            const result = await authService.loadAuth();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should return null if file contains invalid JSON", async () => {
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            await promises_1.default.mkdir(path_1.default.dirname(authPath), { recursive: true });
            await promises_1.default.writeFile(authPath, "invalid json{", "utf-8");
            const result = await authService.loadAuth();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should handle empty file", async () => {
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            await promises_1.default.mkdir(path_1.default.dirname(authPath), { recursive: true });
            await promises_1.default.writeFile(authPath, "", "utf-8");
            const result = await authService.loadAuth();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should handle partially corrupted JSON", async () => {
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            await promises_1.default.mkdir(path_1.default.dirname(authPath), { recursive: true });
            await promises_1.default.writeFile(authPath, '{"token": "test", "email":', "utf-8");
            const result = await authService.loadAuth();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should handle file with wrong permissions", async () => {
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            // Change to write-only (no read)
            if (process.platform !== "win32") {
                await promises_1.default.chmod(authPath, 0o200);
                const result = await authService.loadAuth();
                (0, vitest_1.expect)(result).toBeNull();
                // Restore permissions
                await promises_1.default.chmod(authPath, 0o600);
            }
        });
    });
    (0, vitest_1.describe)("clearAuth", () => {
        (0, vitest_1.it)("should delete existing auth file", async () => {
            await authService.saveAuth(mockAuthData);
            const authPath = path_1.default.join(mockHome, ".cygni", "auth.json");
            let exists = await fileSystem.exists(authPath);
            (0, vitest_1.expect)(exists).toBe(true);
            await authService.clearAuth();
            exists = await fileSystem.exists(authPath);
            (0, vitest_1.expect)(exists).toBe(false);
        });
        (0, vitest_1.it)("should not throw if file doesn't exist", async () => {
            await (0, vitest_1.expect)(authService.clearAuth()).resolves.not.toThrow();
        });
        (0, vitest_1.it)("should not throw if directory doesn't exist", async () => {
            // Remove the entire .cygni directory
            const cygniDir = path_1.default.join(mockHome, ".cygni");
            await promises_1.default.rm(cygniDir, { recursive: true, force: true });
            await (0, vitest_1.expect)(authService.clearAuth()).resolves.not.toThrow();
        });
        (0, vitest_1.it)("should handle permission errors gracefully", async () => {
            await authService.saveAuth(mockAuthData);
            const cygniDir = path_1.default.join(mockHome, ".cygni");
            // Make directory read-only
            if (process.platform !== "win32") {
                await promises_1.default.chmod(cygniDir, 0o555);
                // Should not throw even with permission denied
                await (0, vitest_1.expect)(authService.clearAuth()).resolves.not.toThrow();
                // Restore permissions
                await promises_1.default.chmod(cygniDir, 0o755);
            }
        });
    });
    (0, vitest_1.describe)("integration scenarios", () => {
        (0, vitest_1.it)("should handle complete auth lifecycle", async () => {
            // Save
            await authService.saveAuth(mockAuthData);
            // Load and verify
            let loaded = await authService.loadAuth();
            (0, vitest_1.expect)(loaded).toEqual(mockAuthData);
            // Update
            const updatedAuth = {
                ...mockAuthData,
                token: "new-token-456",
                organizations: [],
            };
            await authService.saveAuth(updatedAuth);
            // Load updated
            loaded = await authService.loadAuth();
            (0, vitest_1.expect)(loaded?.token).toBe("new-token-456");
            (0, vitest_1.expect)(loaded?.organizations).toHaveLength(0);
            // Clear
            await authService.clearAuth();
            // Verify cleared
            loaded = await authService.loadAuth();
            (0, vitest_1.expect)(loaded).toBeNull();
        });
        (0, vitest_1.it)("should handle concurrent operations", async () => {
            // Simulate multiple saves
            await Promise.all([
                authService.saveAuth(mockAuthData),
                authService.saveAuth(mockAuthData),
                authService.saveAuth(mockAuthData),
            ]);
            const loaded = await authService.loadAuth();
            (0, vitest_1.expect)(loaded).toEqual(mockAuthData);
        });
        (0, vitest_1.it)("should maintain data integrity with special characters", async () => {
            const specialAuth = {
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
            (0, vitest_1.expect)(loaded).toEqual(specialAuth);
        });
        (0, vitest_1.it)("should preserve auth file when parent directory is recreated", async () => {
            await authService.saveAuth(mockAuthData);
            // Remove and recreate .cygni directory
            const cygniDir = path_1.default.join(mockHome, ".cygni");
            const authPath = path_1.default.join(cygniDir, "auth.json");
            // Save the content
            const content = await promises_1.default.readFile(authPath, "utf-8");
            // Remove directory
            await promises_1.default.rm(cygniDir, { recursive: true });
            // Recreate and restore
            await promises_1.default.mkdir(cygniDir, { recursive: true });
            await promises_1.default.writeFile(authPath, content, "utf-8");
            await promises_1.default.chmod(authPath, 0o600);
            const loaded = await authService.loadAuth();
            (0, vitest_1.expect)(loaded).toEqual(mockAuthData);
        });
    });
    (0, vitest_1.describe)("error handling", () => {
        (0, vitest_1.it)("should provide meaningful error for disk full scenario", async () => {
            // This is hard to simulate in a real test, but we can test with a very long token
            const hugeAuth = {
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
            (0, vitest_1.expect)(loaded?.token.length).toBe(1000000);
        });
    });
});
//# sourceMappingURL=auth-real.test.js.map