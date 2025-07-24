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
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const config_1 = require("../src/utils/config");
const auth_1 = require("../src/utils/auth");
const framework_detector_1 = require("../src/utils/framework-detector");
(0, vitest_1.describe)("Real User Actions - No Mocks", () => {
    const testDir = path_1.default.join(os_1.default.tmpdir(), `cygni-real-test-${Date.now()}`);
    (0, vitest_1.beforeEach)(async () => {
        await promises_1.default.mkdir(testDir, { recursive: true });
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(testDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)("User creates and manages project configuration", () => {
        (0, vitest_1.it)("should create a config file that can be loaded back", async () => {
            const configPath = path_1.default.join(testDir, "cygni.yml");
            // User creates a new project config
            const config = {
                name: "my-real-app",
                framework: "nextjs",
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npm start", port: 3000 },
                    },
                },
            };
            // Save config to actual file
            await (0, config_1.saveConfig)(config, testDir);
            // Verify file exists
            const fileExists = await promises_1.default
                .access(configPath)
                .then(() => true)
                .catch(() => false);
            (0, vitest_1.expect)(fileExists).toBe(true);
            // Load it back
            const loaded = await (0, config_1.loadConfig)(testDir);
            (0, vitest_1.expect)(loaded.name).toBe("my-real-app");
            (0, vitest_1.expect)(loaded.framework).toBe("nextjs");
        });
        (0, vitest_1.it)("should update existing config", async () => {
            // Create initial config
            await (0, config_1.saveConfig)({ name: "test-app", framework: "react" }, testDir);
            // Update it
            await (0, config_1.updateConfig)({ framework: "nextjs", projectId: "proj_123" }, testDir);
            // Verify updates
            const updated = await (0, config_1.loadConfig)(testDir);
            (0, vitest_1.expect)(updated.name).toBe("test-app"); // Original preserved
            (0, vitest_1.expect)(updated.framework).toBe("nextjs"); // Updated
            (0, vitest_1.expect)(updated.projectId).toBe("proj_123"); // Added
        });
    });
    (0, vitest_1.describe)("User manages authentication", () => {
        (0, vitest_1.it)("should save and load auth credentials securely", async () => {
            const authData = {
                token: "real-token-123",
                email: "user@example.com",
                organizations: [
                    {
                        id: "org-1",
                        name: "My Org",
                        slug: "my-org",
                        role: "owner",
                    },
                ],
            };
            // Save auth
            await (0, auth_1.saveAuth)(authData);
            // Load it back
            const loaded = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(loaded).toEqual(authData);
            // Clear auth
            await (0, auth_1.clearAuth)();
            // Verify it's gone
            const cleared = await (0, auth_1.loadAuth)();
            (0, vitest_1.expect)(cleared).toBeNull();
        });
        (0, vitest_1.it)("should set correct file permissions on auth file", async () => {
            await (0, auth_1.saveAuth)({
                token: "secure-token",
                email: "test@example.com",
                organizations: [],
            });
            const authPath = path_1.default.join(os_1.default.homedir(), ".cygni", "auth.json");
            const stats = await promises_1.default.stat(authPath);
            // Check permissions (on Unix systems)
            if (process.platform !== "win32") {
                const mode = stats.mode & parseInt("777", 8);
                (0, vitest_1.expect)(mode).toBe(parseInt("600", 8)); // Owner read/write only
            }
            await (0, auth_1.clearAuth)();
        });
    });
    (0, vitest_1.describe)("User detects project framework", () => {
        (0, vitest_1.it)("should detect Next.js project", async () => {
            // Create Next.js project structure
            await promises_1.default.writeFile(path_1.default.join(testDir, "package.json"), JSON.stringify({
                name: "nextjs-app",
                dependencies: { next: "13.0.0", react: "18.0.0" },
            }));
            await promises_1.default.writeFile(path_1.default.join(testDir, "next.config.js"), "module.exports = {}");
            const framework = await (0, framework_detector_1.detectFramework)(testDir);
            (0, vitest_1.expect)(framework).toBe("nextjs");
        });
        (0, vitest_1.it)("should detect Django project", async () => {
            await promises_1.default.writeFile(path_1.default.join(testDir, "manage.py"), "#!/usr/bin/env python");
            await promises_1.default.writeFile(path_1.default.join(testDir, "requirements.txt"), "django==4.2.0\npsycopg2==2.9.0");
            const framework = await (0, framework_detector_1.detectFramework)(testDir);
            (0, vitest_1.expect)(framework).toBe("django");
        });
        (0, vitest_1.it)("should return undefined for unknown project", async () => {
            await promises_1.default.writeFile(path_1.default.join(testDir, "random.txt"), "some content");
            const framework = await (0, framework_detector_1.detectFramework)(testDir);
            (0, vitest_1.expect)(framework).toBeUndefined();
        });
    });
    (0, vitest_1.describe)("User validates deployment configuration", () => {
        (0, vitest_1.it)("should validate deployment options", async () => {
            const { validateDeploymentOptions } = await Promise.resolve().then(() => __importStar(require("../src/lib/deploy-helpers")));
            // Valid options should not throw
            (0, vitest_1.expect)(() => {
                validateDeploymentOptions({
                    strategy: "rolling",
                    healthGate: "normal",
                });
            }).not.toThrow();
            // Invalid strategy should throw
            (0, vitest_1.expect)(() => {
                validateDeploymentOptions({
                    strategy: "invalid-strategy",
                });
            }).toThrow("Invalid deployment strategy");
            // Invalid health gate should throw
            (0, vitest_1.expect)(() => {
                validateDeploymentOptions({
                    healthGate: "super-strict",
                });
            }).toThrow("Invalid health gate level");
        });
    });
    (0, vitest_1.describe)("User creates project with framework defaults", () => {
        (0, vitest_1.it)("should create proper config for different frameworks", async () => {
            const { createProjectConfig } = await Promise.resolve().then(() => __importStar(require("../src/utils/config")));
            // Next.js project
            const nextConfig = createProjectConfig("next-app", "next");
            (0, vitest_1.expect)(nextConfig.services?.web?.build?.command).toBe("npm run build");
            (0, vitest_1.expect)(nextConfig.services?.web?.start?.port).toBe(3000);
            // React project
            const reactConfig = createProjectConfig("react-app", "react");
            (0, vitest_1.expect)(reactConfig.services?.web?.start?.command).toBe("npx serve -s build");
            // Node.js project
            const nodeConfig = createProjectConfig("node-app", "node");
            (0, vitest_1.expect)(nodeConfig.services?.web?.start?.command).toBe("npm start");
            (0, vitest_1.expect)(nodeConfig.services?.web?.build).toBeUndefined(); // No build step
        });
    });
});
//# sourceMappingURL=real-user-actions.test.js.map