"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const auth_1 = require("../../src/utils/auth");
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
vitest_1.vi.mock("fs/promises");
(0, vitest_1.describe)("auth utilities", () => {
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
        ],
    };
    const expectedAuthPath = path_1.default.join(os_1.default.homedir(), ".cygni", "auth.json");
    const expectedAuthDir = path_1.default.dirname(expectedAuthPath);
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("saveAuth", () => {
        (0, vitest_1.it)("should save auth data to the correct file", async () => {
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValueOnce(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            vitest_1.vi.mocked(promises_1.default.chmod).mockResolvedValueOnce();
            await (0, auth_1.saveAuth)(mockAuthData);
            (0, vitest_1.expect)(promises_1.default.mkdir).toHaveBeenCalledWith(expectedAuthDir, {
                recursive: true,
            });
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith(expectedAuthPath, JSON.stringify(mockAuthData, null, 2), "utf-8");
            (0, vitest_1.expect)(promises_1.default.chmod).toHaveBeenCalledWith(expectedAuthPath, 0o600);
        });
        (0, vitest_1.it)("should create directory with recursive option", async () => {
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValueOnce(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            vitest_1.vi.mocked(promises_1.default.chmod).mockResolvedValueOnce();
            await (0, auth_1.saveAuth)(mockAuthData);
            (0, vitest_1.expect)(promises_1.default.mkdir).toHaveBeenCalledWith(expectedAuthDir, {
                recursive: true,
            });
        });
        (0, vitest_1.it)("should set restrictive file permissions", async () => {
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValueOnce(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            vitest_1.vi.mocked(promises_1.default.chmod).mockResolvedValueOnce();
            await (0, auth_1.saveAuth)(mockAuthData);
            (0, vitest_1.expect)(promises_1.default.chmod).toHaveBeenCalledWith(expectedAuthPath, 0o600);
        });
        (0, vitest_1.it)("should handle write errors", async () => {
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValueOnce(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockRejectedValueOnce(new Error("Write failed"));
            await (0, vitest_1.expect)((0, auth_1.saveAuth)(mockAuthData)).rejects.toThrow("Write failed");
        });
    });
    (0, vitest_1.describe)("loadAuth", () => {
        (0, vitest_1.it)("should load auth data from file", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce(JSON.stringify(mockAuthData));
            const result = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith(expectedAuthPath, "utf-8");
            (0, vitest_1.expect)(result).toEqual(mockAuthData);
        });
        (0, vitest_1.it)("should return null if file doesn't exist", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));
            const result = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should return null if file contains invalid JSON", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce("invalid json");
            const result = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)("should handle empty file", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce("");
            const result = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)("clearAuth", () => {
        (0, vitest_1.it)("should delete auth file", async () => {
            vitest_1.vi.mocked(promises_1.default.unlink).mockResolvedValueOnce();
            await (0, auth_1.clearAuth)();
            (0, vitest_1.expect)(promises_1.default.unlink).toHaveBeenCalledWith(expectedAuthPath);
        });
        (0, vitest_1.it)("should not throw if file doesn't exist", async () => {
            vitest_1.vi.mocked(promises_1.default.unlink).mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));
            await (0, vitest_1.expect)((0, auth_1.clearAuth)()).resolves.not.toThrow();
        });
        (0, vitest_1.it)("should handle other unlink errors", async () => {
            vitest_1.vi.mocked(promises_1.default.unlink).mockRejectedValueOnce(new Error("Permission denied"));
            await (0, vitest_1.expect)((0, auth_1.clearAuth)()).resolves.not.toThrow();
        });
    });
    (0, vitest_1.describe)("integration scenarios", () => {
        (0, vitest_1.it)("should handle save and load cycle", async () => {
            let savedData;
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValue(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockImplementation(async (path, data) => {
                savedData = data;
            });
            vitest_1.vi.mocked(promises_1.default.chmod).mockResolvedValue();
            vitest_1.vi.mocked(promises_1.default.readFile).mockImplementation(async () => savedData);
            await (0, auth_1.saveAuth)(mockAuthData);
            const loaded = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(loaded).toEqual(mockAuthData);
        });
        (0, vitest_1.it)("should handle clear after save", async () => {
            vitest_1.vi.mocked(promises_1.default.mkdir).mockResolvedValue(undefined);
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValue();
            vitest_1.vi.mocked(promises_1.default.chmod).mockResolvedValue();
            vitest_1.vi.mocked(promises_1.default.unlink).mockResolvedValue();
            vitest_1.vi.mocked(promises_1.default.readFile).mockRejectedValue(new Error("ENOENT"));
            await (0, auth_1.saveAuth)(mockAuthData);
            await (0, auth_1.clearAuth)();
            const loaded = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(loaded).toBeNull();
        });
    });
});
//# sourceMappingURL=auth.test.js.map