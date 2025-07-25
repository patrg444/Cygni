import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import { doctorCommand } from "../../src/commands/doctor";

// Mock dependencies
vi.mock("child_process");
vi.mock("fs/promises");
vi.mock("../../src/utils/config");
vi.mock("../../src/utils/framework-detector");
vi.mock("../../src/lib/api-client");

const mockExec = vi.mocked(promisify(exec));
const mockLoadConfig = vi.fn();
const mockDetectFramework = vi.fn();
const mockGetApiClient = vi.fn();

// Import mocked modules
import { loadConfig } from "../../src/utils/config";
import { detectFramework } from "../../src/utils/framework-detector";
import { getApiClient } from "../../src/lib/api-client";

vi.mocked(loadConfig).mockImplementation(mockLoadConfig);
vi.mocked(detectFramework).mockImplementation(mockDetectFramework);
vi.mocked(getApiClient).mockImplementation(mockGetApiClient);

describe("doctor command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should pass all checks when environment is properly configured", async () => {
    // Mock successful environment
    mockExec.mockImplementation(async (command: string) => {
      if (command === "node --version") {
        return { stdout: "v18.17.0", stderr: "" };
      }
      if (command === "docker version --format '{{.Server.Version}}'") {
        return { stdout: "24.0.0", stderr: "" };
      }
      if (command === "aws --version") {
        return { stdout: "aws-cli/2.13.0 Python/3.11.0", stderr: "" };
      }
      if (command === "aws sts get-caller-identity") {
        return { 
          stdout: JSON.stringify({
            UserId: "AIDAI23HX727X7EXAMPLE",
            Account: "123456789012",
            Arn: "arn:aws:iam::123456789012:user/test-user"
          }), 
          stderr: "" 
        };
      }
      if (command === "aws configure get region") {
        return { stdout: "us-east-1", stderr: "" };
      }
      if (command.includes("service-quotas")) {
        return { stdout: JSON.stringify({ Quota: { Value: 100 } }), stderr: "" };
      }
      if (command === "git rev-parse --is-inside-work-tree") {
        return { stdout: "true", stderr: "" };
      }
      if (command === "git status --porcelain") {
        return { stdout: "", stderr: "" };
      }
      if (command === "nslookup cx-apps.com") {
        return { stdout: "Server: 8.8.8.8\nAddress: 8.8.8.8#53", stderr: "" };
      }
      if (command.includes("df -h")) {
        return { stdout: "Filesystem Size Used Avail Use% Mounted\n/dev/disk1 500G 200G 300G 40% /", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    mockLoadConfig.mockResolvedValue({
      projectId: "test-project",
      organizationId: "test-org",
    });

    mockDetectFramework.mockResolvedValue({
      name: "Next.js",
      language: "TypeScript",
      version: "14.0.0",
    });

    mockGetApiClient.mockResolvedValue({
      get: vi.fn().mockResolvedValue({ data: { status: "healthy" } }),
    });

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        scripts: {
          build: "next build",
          start: "next start",
        },
      })
    );

    try {
      await doctorCommand.parseAsync(["node", "doctor"]);
    } catch (error: any) {
      // Expect process.exit(0) for success
      expect(error.message).toBe("process.exit");
      expect(processExitSpy).toHaveBeenCalledWith(0);
    }

    // Check that all checks passed
    const output = consoleLogSpy.mock.calls.join("\n");
    expect(output).toContain("All checks passed!");
    expect(output).toContain("Node.js v18.17.0 (supported)");
    expect(output).toContain("Docker 24.0.0 is running");
    expect(output).toContain("AWS CLI");
    expect(output).toContain("Authenticated as");
  });

  it("should fail when critical issues are detected", async () => {
    // Mock environment with issues
    mockExec.mockImplementation(async (command: string) => {
      if (command === "node --version") {
        return { stdout: "v14.0.0", stderr: "" };
      }
      if (command === "docker version --format '{{.Server.Version}}'") {
        throw new Error("Docker not running");
      }
      if (command === "aws --version") {
        throw new Error("AWS CLI not found");
      }
      if (command === "aws sts get-caller-identity") {
        throw new Error("No credentials");
      }
      return { stdout: "", stderr: "" };
    });

    mockLoadConfig.mockRejectedValue(new Error("No config"));

    try {
      await doctorCommand.parseAsync(["node", "doctor"]);
    } catch (error: any) {
      // Expect process.exit(1) for failure
      expect(error.message).toBe("process.exit");
      expect(processExitSpy).toHaveBeenCalledWith(1);
    }

    const output = consoleLogSpy.mock.calls.join("\n");
    expect(output).toContain("Multiple issues detected");
    expect(output).toContain("Node.js v14.0.0 is too old");
    expect(output).toContain("Docker is not running");
    expect(output).toContain("AWS CLI not installed");
  });

  it("should output JSON format when requested", async () => {
    mockExec.mockImplementation(async (command: string) => {
      if (command === "node --version") {
        return { stdout: "v18.17.0", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    mockLoadConfig.mockResolvedValue({ projectId: "test" });

    try {
      await doctorCommand.parseAsync(["node", "doctor", "--json"]);
    } catch (error) {
      // Expected due to process.exit
    }

    const output = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("checks");
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toHaveProperty("total");
    expect(parsed.summary).toHaveProperty("passed");
    expect(parsed.summary).toHaveProperty("failed");
  });

  it("should filter by category when specified", async () => {
    mockExec.mockImplementation(async (command: string) => {
      if (command === "aws --version") {
        return { stdout: "aws-cli/2.13.0", stderr: "" };
      }
      if (command === "aws sts get-caller-identity") {
        return { stdout: JSON.stringify({ Arn: "test" }), stderr: "" };
      }
      if (command === "aws configure get region") {
        return { stdout: "us-east-1", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    try {
      await doctorCommand.parseAsync(["node", "doctor", "--category", "aws"]);
    } catch (error) {
      // Expected
    }

    const output = consoleLogSpy.mock.calls.join("\n");
    
    // Should only show AWS checks
    expect(output).toContain("AWS CLI");
    expect(output).toContain("AWS Credentials");
    expect(output).toContain("AWS Region");
    
    // Should not show other categories
    expect(output).not.toContain("Node.js Version");
    expect(output).not.toContain("Docker");
    expect(output).not.toContain("Git Repository");
  });
});