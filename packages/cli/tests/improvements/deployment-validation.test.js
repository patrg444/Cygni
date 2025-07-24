"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const deploy_helpers_1 = require("../../src/lib/deploy-helpers");
(0, vitest_1.describe)("Deployment Validation Improvements", () => {
    (0, vitest_1.describe)("Memory and CPU validation", () => {
        (0, vitest_1.it)("should reject memory values that aren't powers of 2", async () => {
            // This test drives the need for memory validation
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ memory: 300 })).rejects.toThrow("Memory must be a power of 2 between 128 and 30720");
        });
        (0, vitest_1.it)("should accept valid memory values", async () => {
            const validMemoryValues = [128, 256, 512, 1024, 2048, 4096, 8192];
            for (const memory of validMemoryValues) {
                await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ memory })).resolves.not.toThrow();
            }
        });
        (0, vitest_1.it)("should validate CPU values match memory constraints", async () => {
            // AWS Fargate has specific CPU/memory combinations
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ memory: 512, cpu: 2048 })).rejects.toThrow("CPU value 2048 is not valid for memory 512");
        });
        (0, vitest_1.it)("should suggest valid CPU values for given memory", async () => {
            try {
                await (0, deploy_helpers_1.validateDeploymentOptions)({ memory: 1024, cpu: 2048 });
            }
            catch (error) {
                (0, vitest_1.expect)(error.message).toContain("Valid CPU values for 1024 MB: 256, 512");
            }
        });
    });
    (0, vitest_1.describe)("Port validation", () => {
        (0, vitest_1.it)("should reject reserved ports", async () => {
            const reservedPorts = [22, 25, 111, 137, 139, 445];
            for (const port of reservedPorts) {
                await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ port })).rejects.toThrow(`Port ${port} is reserved`);
            }
        });
        (0, vitest_1.it)("should reject ports outside valid range", async () => {
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ port: 0 })).rejects.toThrow("Port must be between 1 and 65535");
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ port: 70000 })).rejects.toThrow("Port must be between 1 and 65535");
        });
    });
    (0, vitest_1.describe)("Environment variable validation", () => {
        (0, vitest_1.it)("should reject environment variables with invalid names", async () => {
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({
                env: {
                    "invalid-name": "value",
                    "123_START": "value",
                },
            })).rejects.toThrow("Environment variable names must match /^[A-Za-z_][A-Za-z0-9_]*$/");
        });
        (0, vitest_1.it)("should warn about common secret patterns in env values", async () => {
            const consoleSpy = vi.spyOn(console, "warn");
            await (0, deploy_helpers_1.validateDeploymentOptions)({
                env: {
                    API_KEY: "sk-1234567890abcdef",
                    DATABASE_URL: "postgres://user:password@host/db",
                },
            });
            (0, vitest_1.expect)(consoleSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining("API_KEY appears to contain a secret"));
            (0, vitest_1.expect)(consoleSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining("DATABASE_URL contains credentials"));
        });
    });
    (0, vitest_1.describe)("Deployment strategy validation", () => {
        (0, vitest_1.it)("should provide helpful error messages for typos", async () => {
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ strategy: "roling" })).rejects.toThrow('Did you mean "rolling"?');
            await (0, vitest_1.expect)((0, deploy_helpers_1.validateDeploymentOptions)({ strategy: "blue_green" })).rejects.toThrow('Did you mean "blue-green"?');
        });
    });
});
//# sourceMappingURL=deployment-validation.test.js.map