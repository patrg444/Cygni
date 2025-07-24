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
const config_1 = require("../../src/utils/config");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const yaml = __importStar(require("js-yaml"));
vitest_1.vi.mock("fs/promises");
(0, vitest_1.describe)("config utilities", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("loadConfig", () => {
        (0, vitest_1.it)("should load YAML config file", async () => {
            const mockConfig = {
                name: "test-project",
                framework: "nextjs",
                services: {
                    web: {
                        start: { command: "npm start", port: 3000 },
                    },
                },
            };
            vitest_1.vi.mocked(promises_1.default.readFile)
                .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yml not found
                .mockResolvedValueOnce(yaml.dump(mockConfig)); // cygni.yaml found
            const result = await (0, config_1.loadConfig)();
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith("cygni.yml", "utf-8");
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith("cygni.yaml", "utf-8");
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should load JSON config file", async () => {
            const mockConfig = {
                name: "test-project",
                framework: "react",
            };
            vitest_1.vi.mocked(promises_1.default.readFile)
                .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yml not found
                .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yaml not found
                .mockResolvedValueOnce(JSON.stringify(mockConfig)); // cygni.json found
            const result = await (0, config_1.loadConfig)();
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith("cygni.json", "utf-8");
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should load config from custom directory", async () => {
            const mockConfig = { name: "custom-project" };
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce(yaml.dump(mockConfig));
            const result = await (0, config_1.loadConfig)("./custom-dir");
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledWith(path_1.default.join("./custom-dir", "cygni.yml"), "utf-8");
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should throw error if no config file found", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile).mockRejectedValue(new Error("ENOENT"));
            await (0, vitest_1.expect)((0, config_1.loadConfig)()).rejects.toThrow('No cygni configuration file found. Run "cygni init" to create one.');
            (0, vitest_1.expect)(promises_1.default.readFile).toHaveBeenCalledTimes(3); // All config files attempted
        });
        (0, vitest_1.it)("should continue to next file on YAML parse errors", async () => {
            // First file has invalid YAML, second file not found, third file not found
            vitest_1.vi.mocked(promises_1.default.readFile)
                .mockResolvedValueOnce("invalid:\n  - yaml\n  content: [") // cygni.yml - invalid
                .mockRejectedValueOnce(new Error("ENOENT")) // cygni.yaml
                .mockRejectedValueOnce(new Error("ENOENT")); // cygni.json
            await (0, vitest_1.expect)((0, config_1.loadConfig)()).rejects.toThrow("No cygni configuration file found");
        });
        (0, vitest_1.it)("should handle JSON parse errors", async () => {
            vitest_1.vi.mocked(promises_1.default.readFile)
                .mockRejectedValueOnce(new Error("ENOENT"))
                .mockRejectedValueOnce(new Error("ENOENT"))
                .mockResolvedValueOnce("{ invalid json }");
            await (0, vitest_1.expect)((0, config_1.loadConfig)()).rejects.toThrow("No cygni configuration file found");
        });
    });
    (0, vitest_1.describe)("saveConfig", () => {
        (0, vitest_1.it)("should save config as YAML", async () => {
            const config = {
                name: "test-project",
                projectId: "proj-123",
                framework: "nextjs",
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npm run start", port: 3000 },
                    },
                },
            };
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.saveConfig)(config);
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("name: test-project"), "utf-8");
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("projectId: proj-123"), "utf-8");
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("framework: nextjs"), "utf-8");
        });
        (0, vitest_1.it)("should save config to custom directory", async () => {
            const config = { name: "test-project" };
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.saveConfig)(config, "./custom-dir");
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith(path_1.default.join("./custom-dir", "cygni.yml"), vitest_1.expect.any(String), "utf-8");
        });
        (0, vitest_1.it)("should handle optional fields correctly", async () => {
            const config = {
                name: "minimal-project",
            };
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.saveConfig)(config);
            const savedContent = vitest_1.vi.mocked(promises_1.default.writeFile).mock.calls[0][1];
            (0, vitest_1.expect)(savedContent).toContain("name: minimal-project");
            (0, vitest_1.expect)(savedContent).not.toContain("projectId:");
            (0, vitest_1.expect)(savedContent).not.toContain("framework:");
        });
        (0, vitest_1.it)("should format services correctly", async () => {
            const config = {
                name: "service-project",
                services: {
                    web: {
                        start: { command: "node index.js", port: 8080 },
                    },
                },
            };
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.saveConfig)(config);
            const savedContent = vitest_1.vi.mocked(promises_1.default.writeFile).mock.calls[0][1];
            (0, vitest_1.expect)(savedContent).toContain("start:");
            (0, vitest_1.expect)(savedContent).toContain("command: node index.js");
            (0, vitest_1.expect)(savedContent).toContain("port: 8080");
        });
        (0, vitest_1.it)("should handle write errors", async () => {
            const config = { name: "test-project" };
            vitest_1.vi.mocked(promises_1.default.writeFile).mockRejectedValueOnce(new Error("Permission denied"));
            await (0, vitest_1.expect)((0, config_1.saveConfig)(config)).rejects.toThrow("Permission denied");
        });
    });
    (0, vitest_1.describe)("updateConfig", () => {
        (0, vitest_1.it)("should update existing config", async () => {
            const existingConfig = {
                name: "old-name",
                framework: "react",
            };
            const updates = {
                name: "new-name",
                projectId: "proj-456",
            };
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce(yaml.dump(existingConfig));
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.updateConfig)(updates);
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("name: new-name"), "utf-8");
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("projectId: proj-456"), "utf-8");
            (0, vitest_1.expect)(promises_1.default.writeFile).toHaveBeenCalledWith("cygni.yml", vitest_1.expect.stringContaining("framework: react"), "utf-8");
        });
        (0, vitest_1.it)("should handle nested updates", async () => {
            const existingConfig = {
                name: "test-project",
                services: {
                    web: {
                        start: { command: "npm start", port: 3000 },
                    },
                },
            };
            const updates = {
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npm run prod", port: 8080 },
                    },
                },
            };
            vitest_1.vi.mocked(promises_1.default.readFile).mockResolvedValueOnce(yaml.dump(existingConfig));
            vitest_1.vi.mocked(promises_1.default.writeFile).mockResolvedValueOnce();
            await (0, config_1.updateConfig)(updates);
            const savedContent = vitest_1.vi.mocked(promises_1.default.writeFile).mock.calls[0][1];
            (0, vitest_1.expect)(savedContent).toContain("build:");
            (0, vitest_1.expect)(savedContent).toContain("command: npm run build");
            (0, vitest_1.expect)(savedContent).toContain("command: npm run prod");
            (0, vitest_1.expect)(savedContent).toContain("port: 8080");
        });
    });
    (0, vitest_1.describe)("createProjectConfig", () => {
        (0, vitest_1.it)("should create config with framework defaults", async () => {
            const config = (0, config_1.createProjectConfig)("next-project", "next");
            (0, vitest_1.expect)(config).toEqual({
                name: "next-project",
                framework: "next",
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npm run start", port: 3000 },
                    },
                },
            });
        });
        (0, vitest_1.it)("should create config for React framework", async () => {
            const config = (0, config_1.createProjectConfig)("react-project", "react");
            (0, vitest_1.expect)(config).toEqual({
                name: "react-project",
                framework: "react",
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npx serve -s build", port: 3000 },
                    },
                },
            });
        });
        (0, vitest_1.it)("should create config for Node framework", async () => {
            const config = (0, config_1.createProjectConfig)("node-project", "node");
            (0, vitest_1.expect)(config).toEqual({
                name: "node-project",
                framework: "node",
                services: {
                    web: {
                        start: { command: "npm start", port: 3000 },
                    },
                },
            });
        });
        (0, vitest_1.it)("should create minimal config for unknown framework", async () => {
            const config = (0, config_1.createProjectConfig)("custom-project", "custom-framework");
            (0, vitest_1.expect)(config).toEqual({
                name: "custom-project",
                framework: "custom-framework",
                services: {
                    web: {},
                },
            });
        });
        (0, vitest_1.it)("should create minimal config without framework", async () => {
            const config = (0, config_1.createProjectConfig)("minimal-project");
            (0, vitest_1.expect)(config).toEqual({
                name: "minimal-project",
                framework: undefined,
                services: {
                    web: undefined,
                },
            });
        });
    });
});
//# sourceMappingURL=config.test.js.map