"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const login_1 = require("../../src/commands/login");
const test_utils_1 = require("../test-utils");
const axios_1 = __importDefault(require("axios"));
const prompts_1 = require("@inquirer/prompts");
const authUtils = __importStar(require("../../src/utils/auth"));
const chalk_1 = __importDefault(require("chalk"));
vitest_1.vi.mock("axios");
vitest_1.vi.mock("@inquirer/prompts");
vitest_1.vi.mock("../../src/utils/auth");
(0, vitest_1.describe)("login command", () => {
    const mockAuthData = {
        token: "test-token-123",
        user: {
            id: "user-123",
            email: "test@example.com",
        },
        organizations: [
            {
                id: "org-123",
                name: "Test Org",
                slug: "test-org",
                role: "owner",
            },
        ],
    };
    (0, vitest_1.beforeEach)(() => {
        (0, test_utils_1.clearAllMocks)();
        (0, test_utils_1.setupMocks)();
        vitest_1.vi.mocked(axios_1.default.post).mockImplementation(test_utils_1.mockAxios.post);
        vitest_1.vi.mocked(axios_1.default.get).mockImplementation(test_utils_1.mockAxios.get);
        vitest_1.vi.mocked(prompts_1.input).mockImplementation(test_utils_1.mockInquirer.input);
        vitest_1.vi.mocked(prompts_1.password).mockImplementation(test_utils_1.mockInquirer.password);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("email/password login", () => {
        (0, vitest_1.it)("should successfully login with valid credentials", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockAuthData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync(["node", "login"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.input).toHaveBeenCalledWith({
                message: "Email:",
                validate: vitest_1.expect.any(Function),
            });
            (0, vitest_1.expect)(test_utils_1.mockInquirer.password).toHaveBeenCalledWith({
                message: "Password:",
                mask: "*",
            });
            (0, vitest_1.expect)(test_utils_1.mockAxios.post).toHaveBeenCalledWith("https://api.cygni.io/api/auth/login", {
                email: "test@example.com",
                password: "password123",
            });
            (0, vitest_1.expect)(authUtils.saveAuth).toHaveBeenCalledWith({
                token: "test-token-123",
                email: "test@example.com",
                organizations: mockAuthData.organizations,
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Logged in successfully!"));
        });
        (0, vitest_1.it)("should use email from command line option", async () => {
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockAuthData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync([
                "node",
                "login",
                "--email",
                "cli@example.com",
            ]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.input).not.toHaveBeenCalled();
            (0, vitest_1.expect)(test_utils_1.mockAxios.post).toHaveBeenCalledWith(vitest_1.expect.any(String), vitest_1.expect.objectContaining({
                email: "cli@example.com",
                password: "password123",
            }));
        });
        (0, vitest_1.it)("should validate email format", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            await login_1.loginCommand.parseAsync(["node", "login"]);
            const validateFn = test_utils_1.mockInquirer.input.mock.calls[0][0].validate;
            (0, vitest_1.expect)(validateFn("invalid-email")).toBe("Please enter a valid email address");
            (0, vitest_1.expect)(validateFn("valid@email.com")).toBe(true);
        });
        (0, vitest_1.it)("should handle invalid credentials error", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("wrong-password");
            test_utils_1.mockAxios.post.mockRejectedValueOnce((0, test_utils_1.createMockError)(401, "Unauthorized"));
            await (0, vitest_1.expect)(login_1.loginCommand.parseAsync(["node", "login"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Invalid email or password"));
            (0, vitest_1.expect)(test_utils_1.mockProcess.exit).toHaveBeenCalledWith(1);
        });
        (0, vitest_1.it)("should handle network errors", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockRejectedValueOnce(new Error("Network error"));
            await (0, vitest_1.expect)(login_1.loginCommand.parseAsync(["node", "login"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Error:"), "Network error");
            (0, vitest_1.expect)(test_utils_1.mockProcess.exit).toHaveBeenCalledWith(1);
        });
        (0, vitest_1.it)("should display organizations after successful login", async () => {
            const multiOrgData = {
                ...mockAuthData,
                organizations: [
                    { id: "org-1", name: "Org One", slug: "org-one", role: "owner" },
                    { id: "org-2", name: "Org Two", slug: "org-two", role: "member" },
                ],
            };
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(multiOrgData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync(["node", "login"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("Organizations:");
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("  - Org One (org-one) [owner]");
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("  - Org Two (org-two) [member]");
        });
    });
    (0, vitest_1.describe)("API token login", () => {
        (0, vitest_1.it)("should successfully login with valid API token", async () => {
            test_utils_1.mockAxios.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockAuthData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync([
                "node",
                "login",
                "--token",
                "api-token-123",
            ]);
            (0, vitest_1.expect)(test_utils_1.mockAxios.get).toHaveBeenCalledWith("https://api.cygni.io/api/auth/me", {
                headers: { Authorization: "Bearer api-token-123" },
            });
            (0, vitest_1.expect)(authUtils.saveAuth).toHaveBeenCalledWith({
                token: "api-token-123",
                email: "test@example.com",
                organizations: mockAuthData.organizations,
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Logged in successfully!"));
        });
        (0, vitest_1.it)("should handle invalid API token", async () => {
            test_utils_1.mockAxios.get.mockRejectedValueOnce((0, test_utils_1.createMockError)(401, "Invalid token"));
            await (0, vitest_1.expect)(login_1.loginCommand.parseAsync(["node", "login", "--token", "invalid-token"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Login failed:"), "Invalid token");
            (0, vitest_1.expect)(test_utils_1.mockProcess.exit).toHaveBeenCalledWith(1);
        });
    });
    (0, vitest_1.describe)("environment configuration", () => {
        (0, vitest_1.it)("should use custom API URL from environment", async () => {
            const originalEnv = process.env.CLOUDEXPRESS_API_URL;
            process.env.CLOUDEXPRESS_API_URL = "https://custom.api.com";
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockAuthData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync(["node", "login"]);
            (0, vitest_1.expect)(test_utils_1.mockAxios.post).toHaveBeenCalledWith("https://custom.api.com/api/auth/login", vitest_1.expect.any(Object));
            process.env.CLOUDEXPRESS_API_URL = originalEnv;
        });
    });
    (0, vitest_1.describe)("edge cases", () => {
        (0, vitest_1.it)("should handle empty organizations array", async () => {
            const noOrgData = {
                ...mockAuthData,
                organizations: [],
            };
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(noOrgData));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync(["node", "login"]);
            (0, vitest_1.expect)(authUtils.saveAuth).toHaveBeenCalledWith({
                token: "test-token-123",
                email: "test@example.com",
                organizations: [],
            });
        });
        (0, vitest_1.it)("should handle missing organizations in response", async () => {
            const noOrgField = {
                token: "test-token-123",
                user: { email: "test@example.com" },
            };
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(noOrgField));
            vitest_1.vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();
            await login_1.loginCommand.parseAsync(["node", "login"]);
            (0, vitest_1.expect)(authUtils.saveAuth).toHaveBeenCalledWith({
                token: "test-token-123",
                email: "test@example.com",
                organizations: [],
            });
        });
        (0, vitest_1.it)("should handle server errors with custom messages", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("test@example.com");
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("password123");
            test_utils_1.mockAxios.post.mockRejectedValueOnce((0, test_utils_1.createMockError)(500, "Internal server error", {
                error: "Database connection failed",
            }));
            await (0, vitest_1.expect)(login_1.loginCommand.parseAsync(["node", "login"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Error:"), "Database connection failed");
        });
    });
});
//# sourceMappingURL=login.test.js.map