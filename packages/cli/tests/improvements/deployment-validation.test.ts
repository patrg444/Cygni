import { describe, it, expect } from "vitest";
import { validateDeploymentOptions } from "../../src/lib/deploy-helpers";

describe("Deployment Validation Improvements", () => {
  describe("Memory and CPU validation", () => {
    it("should reject memory values that aren't powers of 2", async () => {
      // This test drives the need for memory validation
      await expect(validateDeploymentOptions({ memory: 300 })).rejects.toThrow(
        "Memory must be a power of 2 between 128 and 30720",
      );
    });

    it("should accept valid memory values", async () => {
      const validMemoryValues = [128, 256, 512, 1024, 2048, 4096, 8192];

      for (const memory of validMemoryValues) {
        await expect(
          validateDeploymentOptions({ memory }),
        ).resolves.not.toThrow();
      }
    });

    it("should validate CPU values match memory constraints", async () => {
      // AWS Fargate has specific CPU/memory combinations
      await expect(
        validateDeploymentOptions({ memory: 512, cpu: 2048 }),
      ).rejects.toThrow("CPU value 2048 is not valid for memory 512");
    });

    it("should suggest valid CPU values for given memory", async () => {
      try {
        await validateDeploymentOptions({ memory: 1024, cpu: 2048 });
      } catch (error: any) {
        expect(error.message).toContain(
          "Valid CPU values for 1024 MB: 256, 512",
        );
      }
    });
  });

  describe("Port validation", () => {
    it("should reject reserved ports", async () => {
      const reservedPorts = [22, 25, 111, 137, 139, 445];

      for (const port of reservedPorts) {
        await expect(validateDeploymentOptions({ port })).rejects.toThrow(
          `Port ${port} is reserved`,
        );
      }
    });

    it("should reject ports outside valid range", async () => {
      await expect(validateDeploymentOptions({ port: 0 })).rejects.toThrow(
        "Port must be between 1 and 65535",
      );

      await expect(validateDeploymentOptions({ port: 70000 })).rejects.toThrow(
        "Port must be between 1 and 65535",
      );
    });
  });

  describe("Environment variable validation", () => {
    it("should reject environment variables with invalid names", async () => {
      await expect(
        validateDeploymentOptions({
          env: {
            "invalid-name": "value",
            "123_START": "value",
          },
        }),
      ).rejects.toThrow(
        "Environment variable names must match /^[A-Za-z_][A-Za-z0-9_]*$/",
      );
    });

    it("should warn about common secret patterns in env values", async () => {
      const consoleSpy = vi.spyOn(console, "warn");

      await validateDeploymentOptions({
        env: {
          API_KEY: "sk-1234567890abcdef",
          DATABASE_URL: "postgres://user:password@host/db",
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("API_KEY appears to contain a secret"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_URL contains credentials"),
      );
    });
  });

  describe("Deployment strategy validation", () => {
    it("should provide helpful error messages for typos", async () => {
      await expect(
        validateDeploymentOptions({ strategy: "roling" as any }),
      ).rejects.toThrow('Did you mean "rolling"?');

      await expect(
        validateDeploymentOptions({ strategy: "blue_green" as any }),
      ).rejects.toThrow('Did you mean "blue-green"?');
    });
  });
});
