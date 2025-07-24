import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loginCommand } from "../../src/commands/login";
import {
  mockConsole,
  mockProcess,
  mockAxios,
  mockFileSystem,
  mockInquirer,
  createMockResponse,
  createMockError,
  clearAllMocks,
  setupMocks,
} from "../test-utils";
import axios from "axios";
import { input, password } from "@inquirer/prompts";
import * as authUtils from "../../src/utils/auth";
import chalk from "chalk";
import os from "os";
import path from "path";

vi.mock("axios");
vi.mock("@inquirer/prompts");
vi.mock("../../src/utils/auth");

describe("login command", () => {
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

  beforeEach(() => {
    clearAllMocks();
    setupMocks();
    vi.mocked(axios.post).mockImplementation(mockAxios.post);
    vi.mocked(axios.get).mockImplementation(mockAxios.get);
    vi.mocked(input).mockImplementation(mockInquirer.input);
    vi.mocked(password).mockImplementation(mockInquirer.password);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("email/password login", () => {
    it("should successfully login with valid credentials", async () => {
      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(mockAuthData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync(["node", "login"]);

      expect(mockInquirer.input).toHaveBeenCalledWith({
        message: "Email:",
        validate: expect.any(Function),
      });
      expect(mockInquirer.password).toHaveBeenCalledWith({
        message: "Password:",
        mask: "*",
      });
      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://api.cygni.io/api/auth/login",
        {
          email: "test@example.com",
          password: "password123",
        },
      );
      expect(authUtils.saveAuth).toHaveBeenCalledWith({
        token: "test-token-123",
        email: "test@example.com",
        organizations: mockAuthData.organizations,
      });
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Logged in successfully!"),
      );
    });

    it("should use email from command line option", async () => {
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(mockAuthData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync([
        "node",
        "login",
        "--email",
        "cli@example.com",
      ]);

      expect(mockInquirer.input).not.toHaveBeenCalled();
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          email: "cli@example.com",
          password: "password123",
        }),
      );
    });

    it("should validate email format", async () => {
      mockInquirer.input.mockResolvedValueOnce("test@example.com");

      await loginCommand.parseAsync(["node", "login"]);

      const validateFn = mockInquirer.input.mock.calls[0][0].validate;
      expect(validateFn("invalid-email")).toBe(
        "Please enter a valid email address",
      );
      expect(validateFn("valid@email.com")).toBe(true);
    });

    it("should handle invalid credentials error", async () => {
      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("wrong-password");
      mockAxios.post.mockRejectedValueOnce(
        createMockError(401, "Unauthorized"),
      );

      await expect(loginCommand.parseAsync(["node", "login"])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Invalid email or password"),
      );
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it("should handle network errors", async () => {
      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockRejectedValueOnce(new Error("Network error"));

      await expect(loginCommand.parseAsync(["node", "login"])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Error:"),
        "Network error",
      );
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it("should display organizations after successful login", async () => {
      const multiOrgData = {
        ...mockAuthData,
        organizations: [
          { id: "org-1", name: "Org One", slug: "org-one", role: "owner" },
          { id: "org-2", name: "Org Two", slug: "org-two", role: "member" },
        ],
      };

      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(multiOrgData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync(["node", "login"]);

      expect(mockConsole.log).toHaveBeenCalledWith("Organizations:");
      expect(mockConsole.log).toHaveBeenCalledWith(
        "  - Org One (org-one) [owner]",
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        "  - Org Two (org-two) [member]",
      );
    });
  });

  describe("API token login", () => {
    it("should successfully login with valid API token", async () => {
      mockAxios.get.mockResolvedValueOnce(createMockResponse(mockAuthData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync([
        "node",
        "login",
        "--token",
        "api-token-123",
      ]);

      expect(mockAxios.get).toHaveBeenCalledWith(
        "https://api.cygni.io/api/auth/me",
        {
          headers: { Authorization: "Bearer api-token-123" },
        },
      );
      expect(authUtils.saveAuth).toHaveBeenCalledWith({
        token: "api-token-123",
        email: "test@example.com",
        organizations: mockAuthData.organizations,
      });
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining("Logged in successfully!"),
      );
    });

    it("should handle invalid API token", async () => {
      mockAxios.get.mockRejectedValueOnce(
        createMockError(401, "Invalid token"),
      );

      await expect(
        loginCommand.parseAsync(["node", "login", "--token", "invalid-token"]),
      ).rejects.toThrow('process.exit called with "1"');

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Login failed:"),
        "Invalid token",
      );
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });
  });

  describe("environment configuration", () => {
    it("should use custom API URL from environment", async () => {
      const originalEnv = process.env.CLOUDEXPRESS_API_URL;
      process.env.CLOUDEXPRESS_API_URL = "https://custom.api.com";

      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(mockAuthData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync(["node", "login"]);

      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://custom.api.com/api/auth/login",
        expect.any(Object),
      );

      process.env.CLOUDEXPRESS_API_URL = originalEnv;
    });
  });

  describe("edge cases", () => {
    it("should handle empty organizations array", async () => {
      const noOrgData = {
        ...mockAuthData,
        organizations: [],
      };

      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(noOrgData));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync(["node", "login"]);

      expect(authUtils.saveAuth).toHaveBeenCalledWith({
        token: "test-token-123",
        email: "test@example.com",
        organizations: [],
      });
    });

    it("should handle missing organizations in response", async () => {
      const noOrgField = {
        token: "test-token-123",
        user: { email: "test@example.com" },
      };

      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockResolvedValueOnce(createMockResponse(noOrgField));
      vi.mocked(authUtils.saveAuth).mockResolvedValueOnce();

      await loginCommand.parseAsync(["node", "login"]);

      expect(authUtils.saveAuth).toHaveBeenCalledWith({
        token: "test-token-123",
        email: "test@example.com",
        organizations: [],
      });
    });

    it("should handle server errors with custom messages", async () => {
      mockInquirer.input.mockResolvedValueOnce("test@example.com");
      mockInquirer.password.mockResolvedValueOnce("password123");
      mockAxios.post.mockRejectedValueOnce(
        createMockError(500, "Internal server error", {
          error: "Database connection failed",
        }),
      );

      await expect(loginCommand.parseAsync(["node", "login"])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(mockConsole.error).toHaveBeenCalledWith(
        chalk.red("Error:"),
        "Database connection failed",
      );
    });
  });
});
