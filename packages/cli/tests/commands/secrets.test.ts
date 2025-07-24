import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { secretsCommand } from "../../src/commands/secrets";
import {
  mockConsole,
  mockProcess,
  mockAxios,
  mockInquirer,
  createMockResponse,
  createMockError,
  clearAllMocks,
  setupMocks,
} from "../test-utils";
import { password, confirm } from "@inquirer/prompts";
import * as apiClient from "../../src/lib/api-client";
import * as configUtils from "../../src/utils/config";
import fs from "fs/promises";
import chalk from "chalk";

vi.mock("@inquirer/prompts");
vi.mock("../../src/lib/api-client");
vi.mock("../../src/utils/config");
vi.mock("fs/promises");

describe("secrets command", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
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

  beforeEach(() => {
    clearAllMocks();
    setupMocks();
    vi.mocked(password).mockImplementation(mockInquirer.password);
    vi.mocked(confirm).mockImplementation(mockInquirer.confirm);
    vi.mocked(apiClient.getApiClient).mockResolvedValue(mockApi);
    vi.mocked(configUtils.loadConfig).mockResolvedValue(mockConfig);
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.delete.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("secrets set", () => {
    it("should set a secret with provided value", async () => {
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));
      mockApi.post.mockResolvedValueOnce(createMockResponse({ success: true }));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "set",
        "DATABASE_URL",
        "postgres://localhost",
      ]);

      expect(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
        key: "DATABASE_URL",
        value: "postgres://localhost",
        environmentId: undefined,
      });
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Secret DATABASE_URL set successfully!"),
      );
    });

    it("should prompt for value if not provided", async () => {
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));
      mockApi.post.mockResolvedValueOnce(createMockResponse({ success: true }));
      mockInquirer.password.mockResolvedValueOnce("secret-value");

      await secretsCommand.parseAsync(["node", "secrets", "set", "API_KEY"]);

      expect(mockInquirer.password).toHaveBeenCalledWith({
        message: "Enter value for API_KEY:",
        mask: "*",
      });
      expect(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
        key: "API_KEY",
        value: "secret-value",
        environmentId: undefined,
      });
    });

    it("should validate secret key format", async () => {
      await expect(
        secretsCommand.parseAsync([
          "node",
          "secrets",
          "set",
          "invalid-key",
          "value",
        ]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red(
          "Secret key must be uppercase with underscores (e.g., API_KEY)",
        ),
      );
    });

    it("should set secret for specific environment", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockEnvironments));
      mockApi.post.mockResolvedValueOnce(createMockResponse({ success: true }));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "set",
        "API_KEY",
        "secret",
        "--env",
        "production",
      ]);

      expect(mockApi.post).toHaveBeenCalledWith("/projects/proj_123/secrets", {
        key: "API_KEY",
        value: "secret",
        environmentId: "env_prod",
      });
      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.yellow("\n  Changes will take effect on next deployment"),
      );
    });

    it("should handle environment not found", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockEnvironments));

      await expect(
        secretsCommand.parseAsync([
          "node",
          "secrets",
          "set",
          "API_KEY",
          "secret",
          "--env",
          "nonexistent",
        ]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Environment 'nonexistent' not found"),
      );
    });

    it("should handle duplicate secret error", async () => {
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));
      mockApi.post.mockRejectedValueOnce(createMockError(409, "Conflict"));

      await expect(
        secretsCommand.parseAsync([
          "node",
          "secrets",
          "set",
          "API_KEY",
          "value",
        ]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red(
          'Secret already exists. Use "cygni secrets update" to change it.',
        ),
      );
    });
  });

  describe("secrets list", () => {
    it("should list all secrets", async () => {
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
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockSecrets));

      await secretsCommand.parseAsync(["node", "secrets", "list"]);

      expect(mockApi.get).toHaveBeenCalledWith("/projects/proj_123/secrets", {
        params: {},
      });
      expect(mockConsole.log).toHaveBeenCalledWith(chalk.bold("\nSecrets:"));
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_URL"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("postgres://***"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("SECRET_KEY"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("[production]"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.gray("\nTotal: 3 secrets"),
      );
    });

    it("should show values when --show-values flag is used", async () => {
      const mockSecrets = [
        { key: "API_KEY", value: "sk-123456", preview: "sk-***" },
      ];

      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockSecrets));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "list",
        "--show-values",
      ]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("sk-123456"),
      );
    });

    it("should filter by environment", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockEnvironments))
        .mockResolvedValueOnce(createMockResponse([]));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "list",
        "--env",
        "staging",
      ]);

      expect(mockApi.get).toHaveBeenCalledWith("/projects/proj_123/secrets", {
        params: { environmentId: "env_staging" },
      });
    });

    it("should handle no secrets found", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse([]));

      await secretsCommand.parseAsync(["node", "secrets", "list"]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.gray("No secrets found"),
      );
    });
  });

  describe("secrets remove", () => {
    it("should remove a secret with confirmation", async () => {
      const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];

      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockSecrets));
      mockApi.delete.mockResolvedValueOnce(
        createMockResponse({ success: true }),
      );
      mockInquirer.confirm.mockResolvedValueOnce(true);

      await secretsCommand.parseAsync(["node", "secrets", "remove", "API_KEY"]);

      expect(mockInquirer.confirm).toHaveBeenCalledWith({
        message: "Are you sure you want to remove API_KEY?",
        default: false,
      });
      expect(mockApi.delete).toHaveBeenCalledWith(
        "/projects/proj_123/secrets/secret_123",
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Secret API_KEY removed successfully!"),
      );
    });

    it("should skip confirmation with --yes flag", async () => {
      const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];

      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockSecrets));
      mockApi.delete.mockResolvedValueOnce(
        createMockResponse({ success: true }),
      );

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "remove",
        "API_KEY",
        "--yes",
      ]);

      expect(mockInquirer.confirm).not.toHaveBeenCalled();
      expect(mockApi.delete).toHaveBeenCalledWith(
        "/projects/proj_123/secrets/secret_123",
      );
    });

    it("should handle cancellation", async () => {
      const mockSecrets = [{ id: "secret_123", key: "API_KEY" }];

      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockSecrets));
      mockInquirer.confirm.mockResolvedValueOnce(false);

      await secretsCommand.parseAsync(["node", "secrets", "remove", "API_KEY"]);

      expect(mockApi.delete).not.toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith("Cancelled");
    });

    it("should handle secret not found", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse([]));

      await expect(
        secretsCommand.parseAsync(["node", "secrets", "remove", "NONEXISTENT"]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Secret 'NONEXISTENT' not found"),
      );
    });
  });

  describe("secrets import", () => {
    it("should import secrets from .env file", async () => {
      const envContent = `
# Database configuration
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=sk-123456
SECRET_KEY=mysecret

# Invalid keys
invalid-key=should-be-ignored
123_INVALID=ignored
`;

      vi.mocked(fs.readFile).mockResolvedValueOnce(envContent);
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));
      mockApi.post.mockResolvedValueOnce(
        createMockResponse({
          results: [
            { key: "DATABASE_URL", success: true },
            { key: "API_KEY", success: true },
            { key: "SECRET_KEY", success: true },
          ],
        }),
      );

      await secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);

      expect(fs.readFile).toHaveBeenCalledWith(".env", "utf-8");
      expect(mockApi.post).toHaveBeenCalledWith(
        "/projects/proj_123/secrets/bulk",
        {
          secrets: {
            DATABASE_URL: "postgres://localhost:5432/mydb",
            API_KEY: "sk-123456",
            SECRET_KEY: "mysecret",
          },
          environmentId: undefined,
        },
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.blue("Found 3 secrets to import"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Import complete! 3 succeeded, 0 failed"),
      );
    });

    it("should handle import with failures", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        "API_KEY=value\nEXISTING=value",
      );
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));
      mockApi.post.mockResolvedValueOnce(
        createMockResponse({
          results: [
            { key: "API_KEY", success: true },
            { key: "EXISTING", error: "Secret already exists" },
          ],
        }),
      );

      await secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Import complete! 1 succeeded, 1 failed"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.red("\nFailed secrets:"),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        "  EXISTING: Secret already exists",
      );
    });

    it("should handle empty .env file", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce("# Only comments\n\n");
      mockApi.get.mockResolvedValueOnce(createMockResponse(mockProject));

      await secretsCommand.parseAsync(["node", "secrets", "import", ".env"]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        chalk.yellow("No valid secrets found in file"),
      );
      expect(mockApi.post).not.toHaveBeenCalled();
    });

    it("should import to specific environment", async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce("API_KEY=value");
      mockApi.get
        .mockResolvedValueOnce(createMockResponse(mockProject))
        .mockResolvedValueOnce(createMockResponse(mockEnvironments));
      mockApi.post.mockResolvedValueOnce(
        createMockResponse({
          results: [{ key: "API_KEY", success: true }],
        }),
      );

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "import",
        ".env",
        "--env",
        "production",
      ]);

      expect(mockApi.post).toHaveBeenCalledWith(
        "/projects/proj_123/secrets/bulk",
        {
          secrets: { API_KEY: "value" },
          environmentId: "env_prod",
        },
      );
    });

    it("should handle file read errors", async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("File not found"));

      await expect(
        secretsCommand.parseAsync(["node", "secrets", "import", "missing.env"]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Error:"),
        "File not found",
      );
    });
  });

  describe("project resolution", () => {
    it("should use project ID directly if provided", async () => {
      mockApi.get.mockResolvedValueOnce(createMockResponse([]));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "list",
        "--project",
        "proj_456",
      ]);

      expect(mockApi.get).toHaveBeenCalledWith("/projects/proj_456/secrets", {
        params: {},
      });
    });

    it("should resolve project by slug", async () => {
      mockApi.get
        .mockResolvedValueOnce(createMockResponse({ id: "proj_789" }))
        .mockResolvedValueOnce(createMockResponse([]));

      await secretsCommand.parseAsync([
        "node",
        "secrets",
        "list",
        "--project",
        "my-project",
      ]);

      expect(mockApi.get).toHaveBeenCalledWith("/projects/by-slug/my-project");
      expect(mockApi.get).toHaveBeenCalledWith("/projects/proj_789/secrets", {
        params: {},
      });
    });

    it("should handle project not found", async () => {
      mockApi.get.mockRejectedValueOnce(createMockError(404, "Not found"));

      await expect(
        secretsCommand.parseAsync([
          "node",
          "secrets",
          "list",
          "--project",
          "nonexistent",
        ]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Error:"),
        "Project 'nonexistent' not found",
      );
    });
  });
});
