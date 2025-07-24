"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_1 = require("../services/cli-executor");
const real_file_system_1 = require("../services/real-file-system");
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
(0, vitest_1.describe)("Init Command - Real Integration Tests", () => {
    let cli;
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        cli = new cli_executor_1.CliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("init-command");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("Project Initialization", () => {
        (0, vitest_1.it)("should create cygni.yml with provided project name", async () => {
            const result = await cli.execute(["init", "my-awesome-project"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Welcome to CloudExpress!");
            (0, vitest_1.expect)(result.stdout).toContain("Configuration created!");
            (0, vitest_1.expect)(result.stdout).toContain("Your project is ready!");
            // Verify file was created
            const configExists = await fileSystem.exists("cygni.yml");
            (0, vitest_1.expect)(configExists).toBe(true);
            // Read and parse the config
            const configContent = await fileSystem.readFile("cygni.yml");
            const config = js_yaml_1.default.load(configContent);
            (0, vitest_1.expect)(config.name).toBe("my-awesome-project");
            (0, vitest_1.expect)(config.services).toBeDefined();
            (0, vitest_1.expect)(config.services.web).toBeDefined();
        });
        (0, vitest_1.it)("should use current directory name when no project name provided", async () => {
            // Create a named test directory
            const namedDir = await fileSystem.createTestDir("test-project-dir");
            const result = await cli.executeInteractive(["init"], {
                cwd: namedDir,
                inputs: [
                    {
                        waitFor: "What is your project name?",
                        response: "", // Just press enter to use default
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const configContent = await fileSystem.readFile(path_1.default.join(namedDir, "cygni.yml"));
            const config = js_yaml_1.default.load(configContent);
            (0, vitest_1.expect)(config.name).toBe("test-project-dir");
        });
    });
    (0, vitest_1.describe)("Framework Detection", () => {
        (0, vitest_1.it)("should auto-detect Next.js project", async () => {
            // Create Next.js project structure
            await fileSystem.createStructure({
                "package.json": JSON.stringify({
                    name: "nextjs-app",
                    dependencies: {
                        next: "^13.0.0",
                        react: "^18.0.0",
                        "react-dom": "^18.0.0",
                    },
                }),
                "next.config.js": "module.exports = {};",
            });
            const result = await cli.execute(["init", "nextjs-test"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Detected framework: Next.js");
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.framework).toBe("nextjs");
            (0, vitest_1.expect)(config.services.web.build.command).toBe("npm run build");
            (0, vitest_1.expect)(config.services.web.start.command).toBe("npm start");
            (0, vitest_1.expect)(config.services.web.start.port).toBe(3000);
        });
        (0, vitest_1.it)("should auto-detect Django project", async () => {
            await fileSystem.createStructure({
                "manage.py": "#!/usr/bin/env python\n# Django manage.py",
                "requirements.txt": "django>=4.0\npsycopg2-binary\n",
            });
            const result = await cli.execute(["init", "django-test"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Detected framework: Django");
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.framework).toBe("django");
            (0, vitest_1.expect)(config.services.web.start.command).toBe("python manage.py runserver 0.0.0.0:8000");
            (0, vitest_1.expect)(config.services.web.start.port).toBe(8000);
        });
        (0, vitest_1.it)("should prompt for framework when not detected", async () => {
            // Create ambiguous project structure
            await fileSystem.createFile("index.js", 'console.log("Hello");');
            const result = await cli.executeInteractive(["init", "unknown-project"], {
                cwd: testDir,
                inputs: [
                    {
                        waitFor: "Which framework are you using?",
                        response: "express", // Select Express from the list
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.framework).toBe("express");
        });
        (0, vitest_1.it)("should use framework option when provided", async () => {
            // Even if we have Next.js files, the option should take precedence
            await fileSystem.createFile("next.config.js", "module.exports = {};");
            const result = await cli.execute(["init", "forced-framework", "--framework", "vue"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.framework).toBe("vue");
        });
    });
    (0, vitest_1.describe)("Configuration Content", () => {
        (0, vitest_1.it)("should create valid YAML configuration", async () => {
            const result = await cli.execute(["init", "yaml-test"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            const configContent = await fileSystem.readFile("cygni.yml");
            // Should be valid YAML
            (0, vitest_1.expect)(() => js_yaml_1.default.load(configContent)).not.toThrow();
            // Check structure
            const config = js_yaml_1.default.load(configContent);
            (0, vitest_1.expect)(config).toHaveProperty("name");
            (0, vitest_1.expect)(config).toHaveProperty("services");
            (0, vitest_1.expect)(config.services).toHaveProperty("web");
            (0, vitest_1.expect)(config.services.web).toHaveProperty("build");
            (0, vitest_1.expect)(config.services.web).toHaveProperty("start");
        });
        (0, vitest_1.it)("should include deployment configuration", async () => {
            const result = await cli.execute(["init", "deploy-test"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config).toHaveProperty("deploy");
            (0, vitest_1.expect)(config.deploy).toHaveProperty("strategy");
            (0, vitest_1.expect)(config.deploy).toHaveProperty("healthCheck");
        });
    });
    (0, vitest_1.describe)("Error Handling", () => {
        (0, vitest_1.it)("should fail gracefully in read-only directory", async () => {
            // Make directory read-only
            await fileSystem.chmod(".", 0o555);
            const result = await cli.execute(["init", "readonly-test"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(1);
            (0, vitest_1.expect)(result.stderr).toContain("Permission denied");
            // Restore permissions for cleanup
            await fileSystem.chmod(".", 0o755);
        });
        (0, vitest_1.it)("should handle existing cygni.yml file", async () => {
            // Create existing config
            await fileSystem.createFile("cygni.yml", "name: existing-project\n");
            const result = await cli.execute(["init", "new-project"], {
                cwd: testDir,
            });
            // Should either fail or prompt for overwrite
            (0, vitest_1.expect)(result.stdout + result.stderr).toMatch(/already exists|overwrite/i);
        });
    });
    (0, vitest_1.describe)("Special Cases", () => {
        (0, vitest_1.it)("should handle project names with spaces", async () => {
            const result = await cli.execute(["init", "My Awesome Project"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.name).toBe("My Awesome Project");
        });
        (0, vitest_1.it)("should handle special characters in project name", async () => {
            const result = await cli.execute(["init", "project-2024@v1"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.name).toBe("project-2024@v1");
        });
        (0, vitest_1.it)("should handle 'other' framework selection", async () => {
            const result = await cli.executeInteractive(["init", "custom-framework"], {
                cwd: testDir,
                inputs: [
                    {
                        waitFor: "Which framework are you using?",
                        response: "other",
                    },
                ],
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            const config = js_yaml_1.default.load(await fileSystem.readFile("cygni.yml"));
            (0, vitest_1.expect)(config.framework).toBe("other");
        });
    });
    (0, vitest_1.describe)("Next Steps Output", () => {
        (0, vitest_1.it)("should display helpful next steps after initialization", async () => {
            const result = await cli.execute(["init", "helpful-test"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Next steps:");
            (0, vitest_1.expect)(result.stdout).toContain("Review your cygni.yml configuration");
            (0, vitest_1.expect)(result.stdout).toContain("cygni login");
            (0, vitest_1.expect)(result.stdout).toContain("cygni deploy");
        });
    });
});
//# sourceMappingURL=init-real.test.js.map