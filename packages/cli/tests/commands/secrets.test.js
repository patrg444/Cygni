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
const secrets_1 = require("../../src/commands/secrets");
const test_utils_1 = require("../test-utils");
const prompts_1 = require("@inquirer/prompts");
const apiClient = __importStar(require("../../src/lib/api-client"));
const configUtils = __importStar(require("../../src/utils/config"));
const promises_1 = __importDefault(require("fs/promises"));
const chalk_1 = __importDefault(require("chalk"));
vitest_1.vi.mock("@inquirer/prompts");
vitest_1.vi.mock("../../src/lib/api-client");
vitest_1.vi.mock("../../src/utils/config");
vitest_1.vi.mock("fs/promises");
(0, vitest_1.describe)("secrets command", () => {
    const mockApi = {
        get: vitest_1.vi.fn(),
        post: vitest_1.vi.fn(),
        delete: vitest_1.vi.fn(),
    };
    const mockConfig = {
        name: "test-project",
        projectId: "proj_123",
    };
    const mockProject = {
        id: "proj_123",
        name: "test-project",
        slug: "test-project",
    };
    const mockEnvironments = [
        { id: "env_prod", name: "production", slug: "production" },
        { id: "env_staging", name: "staging", slug: "staging" },
    ];
    (0, vitest_1.beforeEach)(() => {
        (0, test_utils_1.clearAllMocks)();
        (0, test_utils_1.setupMocks)();
        vitest_1.vi.mocked(prompts_1.password).mockImplementation(test_utils_1.mockInquirer.password);
        vitest_1.vi.mocked(prompts_1.confirm).mockImplementation(test_utils_1.mockInquirer.confirm);
        vitest_1.vi.mocked(apiClient.getApiClient).mockResolvedValue(mockApi);
        vitest_1.vi.mocked(configUtils.loadConfig).mockResolvedValue(mockConfig);
        mockApi.get.mockReset();
        mockApi.post.mockReset();
        mockApi.delete.mockReset();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("secrets set", () => {
        (0, vitest_1.it)("should set a secret with provided value", async () => {
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ success: true }));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "set",
                "DATABASE_URL",
                "postgres://localhost",
            ]);
            (0, vitest_1.expect)(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
                key: "DATABASE_URL",
                value: "postgres://localhost",
                environmentId: undefined,
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Secret DATABASE_URL set successfully!"));
        });
        (0, vitest_1.it)("should prompt for value if not provided", async () => {
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ success: true }));
            test_utils_1.mockInquirer.password.mockResolvedValueOnce("secret-value");
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "set", "API_KEY"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.password).toHaveBeenCalledWith({
                message: "Enter value for API_KEY:",
                mask: "*",
            });
            (0, vitest_1.expect)(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
                key: "API_KEY",
                value: "secret-value",
                environmentId: undefined,
            });
        });
        (0, vitest_1.it)("should validate secret key format", async () => {
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "set",
                "invalid-key",
                "value",
            ])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Secret key must be uppercase with underscores (e.g., API_KEY)"));
        });
        (0, vitest_1.it)("should set secret for specific environment", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockEnvironments));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ success: true }));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "set",
                "API_KEY",
                "secret",
                "--env",
                "production",
            ]);
            (0, vitest_1.expect)(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
                key: "API_KEY",
                value: "secret",
                environmentId: "env_prod",
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.yellow("\n  Changes will take effect on next deployment"));
        });
        (0, vitest_1.it)("should handle environment not found", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockEnvironments));
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "set",
                "API_KEY",
                "secret",
                "--env",
                "nonexistent",
            ])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Environment 'nonexistent' not found"));
        });
        (0, vitest_1.it)("should handle duplicate secret error", async () => {
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            mockApi.post.mockRejectedValueOnce((0, test_utils_1.createMockError)(409, "Conflict"));
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "set",
                "API_KEY",
                "value",
            ])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red('Secret already exists. Use "cygni secrets update" to change it.'));
        });
    });
    (0, vitest_1.describe)("secrets list", () => {
        (0, vitest_1.it)("should list all secrets", async () => {
            const mockSecrets = [
                { key: "DATABASE_URL", preview: "postgres://***" },
                { key: "API_KEY", preview: "sk-***" },
                {
                    key: "SECRET_KEY",
                    environmentId: "env_prod",
                    environment: { name: "production" },
                },
            ];
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockSecrets));
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "list"]);
            (0, vitest_1.expect)(mockApi.get).toHaveBeenCalledWith("/projects/proj_123/secrets", {
                params: {},
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.bold("\nSecrets:"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("DATABASE_URL"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("postgres://***"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("SECRET_KEY"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("[production]"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.gray("\nTotal: 3 secrets"));
        });
        (0, vitest_1.it)("should show values when --show-values flag is used", async () => {
            const mockSecrets = [
                { key: "API_KEY", value: "sk-123456", preview: "sk-***" },
            ];
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockSecrets));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "list",
                "--show-values",
            ]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("sk-123456"));
        });
        (0, vitest_1.it)("should filter by environment", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockEnvironments))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)([]));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "list",
                "--env",
                "staging",
            ]);
            (0, vitest_1.expect)(mockApi.get).toHaveBeenCalledWith("/projects/proj_123/secrets", {
                params: { environmentId: "env_staging" },
            });
        });
        (0, vitest_1.it)("should handle no secrets found", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)([]));
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "list"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.gray("No secrets found"));
        });
    });
    (0, vitest_1.describe)("secrets remove", () => {
        (0, vitest_1.it)("should remove a secret with confirmation", async () => {
            const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockSecrets));
            mockApi.delete.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ success: true }));
            test_utils_1.mockInquirer.confirm.mockResolvedValueOnce(true);
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "remove", "API_KEY"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.confirm).toHaveBeenCalledWith({
                message: "Are you sure you want to remove API_KEY?",
                default: false,
            });
            (0, vitest_1.expect)(mockApi.delete).toHaveBeenCalledWith("/projects/proj_123/secrets/secret_123");
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Secret API_KEY removed successfully!"));
        });
        (0, vitest_1.it)("should skip confirmation with --yes flag", async () => {
            const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockSecrets));
            mockApi.delete.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ success: true }));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "remove",
                "API_KEY",
                "--yes",
            ]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.confirm).not.toHaveBeenCalled();
            (0, vitest_1.expect)(mockApi.delete).toHaveBeenCalledWith("/projects/proj_123/secrets/secret_123");
        });
        (0, vitest_1.it)("should handle cancellation", async () => {
            const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockSecrets));
            test_utils_1.mockInquirer.confirm.mockResolvedValueOnce(false);
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "remove", "API_KEY"]);
            (0, vitest_1.expect)(mockApi.delete).not.toHaveBeenCalled();
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("Cancelled");
        });
        (0, vitest_1.it)("should handle secret not found", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)([]));
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync(["node", "secrets", "remove", "NONEXISTENT"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Secret 'NONEXISTENT' not found"));
        });
    });
    (0, vitest_1.describe)("secrets import", () => {
        (0, vitest_1.it)("should import secrets from .env file", async () => {
            const envContent = `
# Database configuration
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=sk-123456
SECRET_KEY=mysecret

# Invalid keys
invalid-key=should-be-ignored
123_INVALID=ignored
`;
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce(envContent);
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({
                results: [
                    { key: "DATABASE_URL", success: true },
                    { key: "API_KEY", success: true },
                    { key: "SECRET_KEY", success: true },
                ],
            }));
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith(".env", "utf-8");
            (0, vitest_1.expect)(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets/bulk", {
                secrets: {
                    DATABASE_URL: "postgres://localhost:5432/mydb",
                    API_KEY: "sk-123456",
                    SECRET_KEY: "mysecret",
                },
                environmentId: undefined,
            });
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.blue("Found 3 secrets to import"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Import complete! 3 succeeded, 0 failed"));
        });
        (0, vitest_1.it)("should handle import with failures", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce("API_KEY=value\nEXISTING=value");
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({
                results: [
                    { key: "API_KEY", success: true },
                    { key: "EXISTING", error: "Secret already exists" },
                ],
            }));
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Import complete! 1 succeeded, 1 failed"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.red("\nFailed secrets:"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("  EXISTING: Secret already exists");
        });
        (0, vitest_1.it)("should handle empty .env file", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce("# Only comments\n\n");
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject));
            await secrets_1.secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.yellow("No valid secrets found in file"));
            (0, vitest_1.expect)(mockApi.post).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("should import to specific environment", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce("API_KEY=value");
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockProject))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)(mockEnvironments));
            mockApi.post.mockResolvedValueOnce((0, test_utils_1.createMockResponse)({
                results: [{ key: "API_KEY", success: true }],
            }));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "import",
                ".env",
                "--env",
                "production",
            ]);
            (0, vitest_1.expect)(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets/bulk", {
                secrets: { API_KEY: "value" },
                environmentId: "env_prod",
            });
        });
        (0, vitest_1.it)("should handle file read errors", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockRejectedValueOnce(new Error("File not found"));
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync(["node", "secrets", "import", "missing.env"])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Error:"), "File not found");
        });
    });
    (0, vitest_1.describe)("project resolution", () => {
        (0, vitest_1.it)("should use project ID directly if provided", async () => {
            mockApi.get.mockResolvedValueOnce((0, test_utils_1.createMockResponse)([]));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "list",
                "--project",
                "proj_456",
            ]);
            (0, vitest_1.expect)(mockApi.get).toHaveBeenCalledWith("/projects/proj_456/secrets", {
                params: {},
            });
        });
        (0, vitest_1.it)("should resolve project by slug", async () => {
            mockApi.get
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)({ id: "proj_789" }))
                .mockResolvedValueOnce((0, test_utils_1.createMockResponse)([]));
            await secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "list",
                "--project",
                "my-project",
            ]);
            (0, vitest_1.expect)(mockApi.get).toHaveBeenCalledWith("/projects/by-slug/my-project");
            (0, vitest_1.expect)(mockApi.get).toHaveBeenCalledWith("/projects/proj_789/secrets", {
                params: {},
            });
        });
        (0, vitest_1.it)("should handle project not found", async () => {
            mockApi.get.mockRejectedValueOnce((0, test_utils_1.createMockError)(404, "Not found"));
            await (0, vitest_1.expect)(secrets_1.secretsCommand.parseAsync([
                "node",
                "secrets",
                "list",
                "--project",
                "nonexistent",
            ])).rejects.toThrow('process.exit called with "1"');
            (0, vitest_1.expect)(test_utils_1.mockConsole.error).toHaveBeenCalledWith(chalk_1.default.red("Error:"), "Project 'nonexistent' not found");
        });
    });
});
//# sourceMappingURL=secrets.test.js.map