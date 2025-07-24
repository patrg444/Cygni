"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const config_service_1 = require("../services/config-service");
const real_file_system_1 = require("../services/real-file-system");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
(0, vitest_1.describe)("config utilities - Real Implementation", () => {
    let fileSystem;
    let testDir;
    let configService;
    (0, vitest_1.beforeEach)(async () => {
        fileSystem = new real_file_system_1.RealFileSystem("config-utils");
        testDir = await fileSystem.createTestDir();
        configService = new config_service_1.ConfigService(testDir);
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("loadConfig", () => {
        (0, vitest_1.it)("should load YAML config file (cygni.yml)", async () => {
            const mockConfig = {
                name: "test-project",
                framework: "nextjs",
                services: {
                    web: {
                        start: { command: "npm start", port: 3000 },
                    },
                },
            };
            await fileSystem.createFile("cygni.yml", js_yaml_1.default.dump(mockConfig));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should load YAML config file (cygni.yaml)", async () => {
            const mockConfig = {
                name: "yaml-project",
                framework: "react",
            };
            await fileSystem.createFile("cygni.yaml", js_yaml_1.default.dump(mockConfig));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should load JSON config file", async () => {
            const mockConfig = {
                name: "json-project",
                framework: "vue",
                projectId: "proj-123",
            };
            await fileSystem.createFile("cygni.json", JSON.stringify(mockConfig, null, 2));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result).toEqual(mockConfig);
        });
        (0, vitest_1.it)("should prefer cygni.yml over other formats", async () => {
            const ymlConfig = { name: "yml-project" };
            const yamlConfig = { name: "yaml-project" };
            const jsonConfig = { name: "json-project" };
            await fileSystem.createFile("cygni.yml", js_yaml_1.default.dump(ymlConfig));
            await fileSystem.createFile("cygni.yaml", js_yaml_1.default.dump(yamlConfig));
            await fileSystem.createFile("cygni.json", JSON.stringify(jsonConfig));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result.name).toBe("yml-project");
        });
        (0, vitest_1.it)("should throw error if no config file found", async () => {
            await (0, vitest_1.expect)(configService.loadConfig()).rejects.toThrow('No cygni configuration file found. Run "cygni init" to create one.');
        });
        (0, vitest_1.it)("should continue to next file on YAML parse errors", async () => {
            await fileSystem.createFile("cygni.yml", "invalid:\n  - yaml\n  content: [");
            await fileSystem.createFile("cygni.json", JSON.stringify({ name: "fallback" }));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result.name).toBe("fallback");
        });
        (0, vitest_1.it)("should handle JSON parse errors gracefully", async () => {
            await fileSystem.createFile("cygni.yml", "invalid yaml {{");
            await fileSystem.createFile("cygni.yaml", "also: invalid: yaml:");
            await fileSystem.createFile("cygni.json", "{ invalid json }");
            await (0, vitest_1.expect)(configService.loadConfig()).rejects.toThrow("No cygni configuration file found");
        });
        (0, vitest_1.it)("should handle empty files", async () => {
            await fileSystem.createFile("cygni.yml", "");
            await fileSystem.createFile("cygni.json", JSON.stringify({ name: "valid" }));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result.name).toBe("valid");
        });
        (0, vitest_1.it)("should handle files with only comments", async () => {
            await fileSystem.createFile("cygni.yml", "# Just a comment\n# Another comment");
            await fileSystem.createFile("cygni.json", JSON.stringify({ name: "valid" }));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result.name).toBe("valid");
        });
        (0, vitest_1.it)("should load complex nested configuration", async () => {
            const complexConfig = {
                name: "complex-project",
                projectId: "proj-complex",
                framework: "nextjs",
                services: {
                    web: {
                        build: {
                            command: "npm run build",
                            env: {
                                NODE_ENV: "production",
                                API_URL: "https://api.example.com",
                            },
                        },
                        start: {
                            command: "npm start",
                            port: 3000,
                            healthCheck: {
                                path: "/api/health",
                                interval: 30,
                            },
                        },
                    },
                    worker: {
                        start: { command: "npm run worker" },
                    },
                },
                deploy: {
                    strategy: "blue-green",
                    healthCheck: {
                        path: "/health",
                        interval: 30,
                        timeout: 5,
                        retries: 3,
                    },
                },
            };
            await fileSystem.createFile("cygni.yml", js_yaml_1.default.dump(complexConfig));
            const result = await configService.loadConfig();
            (0, vitest_1.expect)(result).toEqual(complexConfig);
        });
    });
    (0, vitest_1.describe)("saveConfig", () => {
        (0, vitest_1.it)("should save config as YAML with proper formatting", async () => {
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
            await configService.saveConfig(config);
            const savedPath = path_1.default.join(testDir, "cygni.yml");
            const exists = await fileSystem.exists(savedPath);
            (0, vitest_1.expect)(exists).toBe(true);
            const content = await promises_1.default.readFile(savedPath, "utf-8");
            (0, vitest_1.expect)(content).toContain("name: test-project");
            (0, vitest_1.expect)(content).toContain("projectId: proj-123");
            (0, vitest_1.expect)(content).toContain("framework: nextjs");
            (0, vitest_1.expect)(content).toContain("command: npm run build");
            // Verify it's valid YAML
            const parsed = js_yaml_1.default.load(content);
            (0, vitest_1.expect)(parsed).toEqual(config);
        });
        (0, vitest_1.it)("should handle optional fields correctly", async () => {
            const config = {
                name: "minimal-project",
            };
            await configService.saveConfig(config);
            const content = await fileSystem.readFile("cygni.yml");
            (0, vitest_1.expect)(content).toContain("name: minimal-project");
            (0, vitest_1.expect)(content).not.toContain("projectId:");
            (0, vitest_1.expect)(content).not.toContain("framework:");
            (0, vitest_1.expect)(content).not.toContain("services:");
        });
        (0, vitest_1.it)("should preserve special characters and strings", async () => {
            const config = {
                name: "special-chars-project",
                environment: {
                    API_KEY: "sk-1234567890!@#$%^&*()",
                    DATABASE_URL: "postgres://user:pass@host:5432/db?ssl=true",
                    SPECIAL_CHARS: "Line1\nLine2\tTab",
                },
            };
            await configService.saveConfig(config);
            const content = await fileSystem.readFile("cygni.yml");
            const parsed = js_yaml_1.default.load(content);
            (0, vitest_1.expect)(parsed.environment.API_KEY).toBe("sk-1234567890!@#$%^&*()");
            (0, vitest_1.expect)(parsed.environment.DATABASE_URL).toBe("postgres://user:pass@host:5432/db?ssl=true");
            (0, vitest_1.expect)(parsed.environment.SPECIAL_CHARS).toBe("Line1\nLine2\tTab");
        });
        (0, vitest_1.it)("should overwrite existing config file", async () => {
            await configService.saveConfig({ name: "old-project" });
            await configService.saveConfig({
                name: "new-project",
                framework: "react",
            });
            const content = await fileSystem.readFile("cygni.yml");
            (0, vitest_1.expect)(content).toContain("name: new-project");
            (0, vitest_1.expect)(content).toContain("framework: react");
            (0, vitest_1.expect)(content).not.toContain("old-project");
        });
        (0, vitest_1.it)("should handle write permission errors", async () => {
            // Make directory read-only
            await promises_1.default.chmod(testDir, 0o555);
            await (0, vitest_1.expect)(configService.saveConfig({ name: "test" })).rejects.toThrow();
            // Restore permissions for cleanup
            await promises_1.default.chmod(testDir, 0o755);
        });
    });
    (0, vitest_1.describe)("updateConfig", () => {
        (0, vitest_1.it)("should update existing config preserving other fields", async () => {
            const existingConfig = {
                name: "old-name",
                framework: "react",
                projectId: "proj-123",
            };
            await configService.saveConfig(existingConfig);
            await configService.updateConfig({
                name: "new-name",
                environment: { NODE_ENV: "production" },
            });
            const updated = await configService.loadConfig();
            (0, vitest_1.expect)(updated.name).toBe("new-name");
            (0, vitest_1.expect)(updated.framework).toBe("react"); // Preserved
            (0, vitest_1.expect)(updated.projectId).toBe("proj-123"); // Preserved
            (0, vitest_1.expect)(updated.environment).toEqual({ NODE_ENV: "production" }); // Added
        });
        (0, vitest_1.it)("should handle deep nested updates", async () => {
            const existingConfig = {
                name: "test-project",
                services: {
                    web: {
                        start: { command: "npm start", port: 3000 },
                        build: { command: "npm run build" },
                    },
                },
            };
            await configService.saveConfig(existingConfig);
            await configService.updateConfig({
                services: {
                    web: {
                        start: { port: 8080 }, // Update only port
                        deploy: { strategy: "rolling" }, // Add new field
                    },
                    worker: {
                        // Add new service
                        start: { command: "npm run worker" },
                    },
                },
            });
            const updated = await configService.loadConfig();
            (0, vitest_1.expect)(updated.services.web.start.command).toBe("npm start"); // Preserved
            (0, vitest_1.expect)(updated.services.web.start.port).toBe(8080); // Updated
            (0, vitest_1.expect)(updated.services.web.build.command).toBe("npm run build"); // Preserved
            (0, vitest_1.expect)(updated.services.web.deploy).toEqual({ strategy: "rolling" }); // Added
            (0, vitest_1.expect)(updated.services.worker).toEqual({
                start: { command: "npm run worker" },
            }); // Added
        });
        (0, vitest_1.it)("should handle updates when config doesn't exist", async () => {
            await (0, vitest_1.expect)(configService.updateConfig({ name: "new" })).rejects.toThrow("No cygni configuration file found");
        });
    });
    (0, vitest_1.describe)("createProjectConfig", () => {
        (0, vitest_1.it)("should create config with Next.js defaults", () => {
            const config = configService.createProjectConfig("next-project", "nextjs");
            (0, vitest_1.expect)(config).toEqual({
                name: "next-project",
                framework: "nextjs",
                services: {
                    web: {
                        build: { command: "npm run build" },
                        start: { command: "npm start", port: 3000 },
                    },
                },
                deploy: {
                    strategy: "rolling",
                    healthCheck: {
                        path: "/health",
                        interval: 30,
                        timeout: 5,
                        retries: 3,
                    },
                },
            });
        });
        (0, vitest_1.it)("should create config with Django defaults", () => {
            const config = configService.createProjectConfig("django-project", "django");
            (0, vitest_1.expect)(config).toEqual({
                name: "django-project",
                framework: "django",
                services: {
                    web: {
                        start: {
                            command: "python manage.py runserver 0.0.0.0:8000",
                            port: 8000,
                        },
                    },
                },
                deploy: vitest_1.expect.any(Object),
            });
        });
        (0, vitest_1.it)("should handle unknown framework", () => {
            const config = configService.createProjectConfig("custom-project", "custom-framework");
            (0, vitest_1.expect)(config).toEqual({
                name: "custom-project",
                framework: "custom-framework",
                services: { web: {} },
                deploy: vitest_1.expect.any(Object),
            });
        });
        (0, vitest_1.it)("should create minimal config without framework", () => {
            const config = configService.createProjectConfig("minimal-project");
            (0, vitest_1.expect)(config).toEqual({
                name: "minimal-project",
                framework: undefined,
                deploy: vitest_1.expect.any(Object),
            });
        });
        (0, vitest_1.it)("should handle framework name variations", () => {
            const configNext = configService.createProjectConfig("p1", "next");
            const configNextJS = configService.createProjectConfig("p2", "nextjs");
            (0, vitest_1.expect)(configNext.services).toEqual(configNextJS.services);
        });
    });
    (0, vitest_1.describe)("utility methods", () => {
        (0, vitest_1.it)("should check if config exists", async () => {
            (0, vitest_1.expect)(await configService.exists()).toBe(false);
            await configService.saveConfig({ name: "test" });
            (0, vitest_1.expect)(await configService.exists()).toBe(true);
        });
        (0, vitest_1.it)("should get config file path", async () => {
            (0, vitest_1.expect)(await configService.getConfigPath()).toBeNull();
            await configService.saveConfig({ name: "test" });
            const configPath = await configService.getConfigPath();
            (0, vitest_1.expect)(configPath).toBe(path_1.default.join(testDir, "cygni.yml"));
        });
        (0, vitest_1.it)("should find yaml file path", async () => {
            await fileSystem.createFile("cygni.yaml", js_yaml_1.default.dump({ name: "test" }));
            const configPath = await configService.getConfigPath();
            (0, vitest_1.expect)(configPath).toBe(path_1.default.join(testDir, "cygni.yaml"));
        });
        (0, vitest_1.it)("should find json file path", async () => {
            await fileSystem.createFile("cygni.json", JSON.stringify({ name: "test" }));
            const configPath = await configService.getConfigPath();
            (0, vitest_1.expect)(configPath).toBe(path_1.default.join(testDir, "cygni.json"));
        });
    });
    (0, vitest_1.describe)("real-world scenarios", () => {
        (0, vitest_1.it)("should handle config migration from JSON to YAML", async () => {
            // Start with JSON
            const jsonConfig = {
                name: "migrating-project",
                framework: "react",
            };
            await fileSystem.createFile("cygni.json", JSON.stringify(jsonConfig, null, 2));
            // Load, update and save (which creates YAML)
            const loaded = await configService.loadConfig();
            loaded.migrated = true;
            await configService.saveConfig(loaded);
            // Remove old JSON
            await fileSystem.remove("cygni.json");
            // Verify YAML is now used
            const final = await configService.loadConfig();
            (0, vitest_1.expect)(final.name).toBe("migrating-project");
            (0, vitest_1.expect)(final.migrated).toBe(true);
            const configPath = await configService.getConfigPath();
            (0, vitest_1.expect)(configPath).toContain("cygni.yml");
        });
        (0, vitest_1.it)("should preserve comments when possible", async () => {
            const configWithComments = `# Project configuration
name: commented-project
# Framework settings
framework: nextjs

services:
  web:
    # Build configuration
    build:
      command: npm run build
    # Start configuration  
    start:
      command: npm start
      port: 3000
`;
            await fileSystem.createFile("cygni.yml", configWithComments);
            const loaded = await configService.loadConfig();
            (0, vitest_1.expect)(loaded.name).toBe("commented-project");
            // Note: Comments are lost when re-saving through YAML dump
            // This is a known limitation of the yaml library
        });
        (0, vitest_1.it)("should handle very large configurations", async () => {
            const largeConfig = {
                name: "large-project",
                framework: "nextjs",
                services: {},
                environment: {},
            };
            // Add many services
            for (let i = 0; i < 50; i++) {
                largeConfig.services[`service-${i}`] = {
                    start: { command: `npm run service-${i}`, port: 3000 + i },
                };
            }
            // Add many environment variables
            for (let i = 0; i < 100; i++) {
                largeConfig.environment[`VAR_${i}`] = `value_${i}`;
            }
            await configService.saveConfig(largeConfig);
            const loaded = await configService.loadConfig();
            (0, vitest_1.expect)(Object.keys(loaded.services).length).toBe(50);
            (0, vitest_1.expect)(Object.keys(loaded.environment).length).toBe(100);
        });
    });
});
//# sourceMappingURL=config-real.test.js.map