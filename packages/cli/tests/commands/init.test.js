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
const init_1 = require("../../src/commands/init");
const test_utils_1 = require("../test-utils");
const prompts_1 = require("@inquirer/prompts");
const frameworkDetector = __importStar(require("../../src/utils/framework-detector"));
const config = __importStar(require("../../src/utils/config"));
const chalk_1 = __importDefault(require("chalk"));
const path_1 = __importDefault(require("path"));
vitest_1.vi.mock("@inquirer/prompts");
vitest_1.vi.mock("../../src/utils/framework-detector");
vitest_1.vi.mock("../../src/utils/config");
(0, vitest_1.describe)("init command", () => {
    const mockConfig = {
        name: "test-project",
        framework: "nextjs",
        services: {
            web: {
                build: { command: "npm run build" },
                start: { command: "npm run start", port: 3000 },
            },
        },
    };
    (0, vitest_1.beforeEach)(() => {
        (0, test_utils_1.clearAllMocks)();
        (0, test_utils_1.setupMocks)();
        vitest_1.vi.mocked(prompts_1.input).mockImplementation(test_utils_1.mockInquirer.input);
        vitest_1.vi.mocked(prompts_1.select).mockImplementation(test_utils_1.mockInquirer.select);
        vitest_1.vi.mocked(config.createProjectConfig).mockReturnValue(mockConfig);
        vitest_1.vi.mocked(config.saveConfig).mockResolvedValue();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.describe)("project name handling", () => {
        (0, vitest_1.it)("should use provided project name argument", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("nextjs");
            await init_1.initCommand.parseAsync(["node", "init", "my-awesome-project"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.input).not.toHaveBeenCalled();
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("my-awesome-project", "nextjs");
        });
        (0, vitest_1.it)("should prompt for project name if not provided", async () => {
            const cwd = process.cwd();
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("prompted-project");
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("react");
            await init_1.initCommand.parseAsync(["node", "init"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.input).toHaveBeenCalledWith({
                message: "What is your project name?",
                default: path_1.default.basename(cwd),
            });
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("prompted-project", "react");
        });
    });
    (0, vitest_1.describe)("framework detection", () => {
        (0, vitest_1.it)("should use detected framework", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("vue");
            await init_1.initCommand.parseAsync(["node", "init", "vue-project"]);
            (0, vitest_1.expect)(frameworkDetector.detectFramework).toHaveBeenCalled();
            (0, vitest_1.expect)(test_utils_1.mockInquirer.select).not.toHaveBeenCalled();
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("vue-project", "vue");
        });
        (0, vitest_1.it)("should use framework option if provided", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("react");
            await init_1.initCommand.parseAsync([
                "node",
                "init",
                "my-project",
                "--framework",
                "express",
            ]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.select).not.toHaveBeenCalled();
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("my-project", "express");
        });
        (0, vitest_1.it)("should prompt for framework if not detected", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(null);
            test_utils_1.mockInquirer.select.mockResolvedValueOnce("django");
            await init_1.initCommand.parseAsync(["node", "init", "django-project"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.select).toHaveBeenCalledWith({
                message: "Which framework are you using?",
                choices: vitest_1.expect.arrayContaining([
                    { name: "Next.js", value: "nextjs" },
                    { name: "React", value: "react" },
                    { name: "Vue", value: "vue" },
                    { name: "Express", value: "express" },
                    { name: "Fastify", value: "fastify" },
                    { name: "Django", value: "django" },
                    { name: "FastAPI", value: "fastapi" },
                    { name: "Other", value: "other" },
                ]),
            });
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("django-project", "django");
        });
    });
    (0, vitest_1.describe)("configuration creation", () => {
        (0, vitest_1.it)("should create and save configuration successfully", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("nextjs");
            await init_1.initCommand.parseAsync(["node", "init", "test-project"]);
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("test-project", "nextjs");
            (0, vitest_1.expect)(config.saveConfig).toHaveBeenCalledWith(mockConfig);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Your project is ready!"));
        });
        (0, vitest_1.it)("should display next steps after success", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("react");
            await init_1.initCommand.parseAsync(["node", "init", "test-project"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("Next steps:");
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Review your cygni.yaml configuration"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("cygni login"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("cygni deploy"));
        });
        (0, vitest_1.it)("should handle config save errors", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("nextjs");
            vitest_1.vi.mocked(config.saveConfig).mockRejectedValueOnce(new Error("Permission denied"));
            await (0, vitest_1.expect)(init_1.initCommand.parseAsync(["node", "init", "test-project"])).rejects.toThrow("Permission denied");
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).not.toHaveBeenCalledWith(vitest_1.expect.stringContaining("Your project is ready!"));
        });
    });
    (0, vitest_1.describe)("edge cases", () => {
        (0, vitest_1.it)("should handle spaces in project name", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("nextjs");
            await init_1.initCommand.parseAsync(["node", "init", "my awesome project"]);
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("my awesome project", "nextjs");
        });
        (0, vitest_1.it)("should handle special characters in project name", async () => {
            test_utils_1.mockInquirer.input.mockResolvedValueOnce("project@2024");
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("react");
            await init_1.initCommand.parseAsync(["node", "init"]);
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("project@2024", "react");
        });
        (0, vitest_1.it)("should handle 'other' framework selection", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce(null);
            test_utils_1.mockInquirer.select.mockResolvedValueOnce("other");
            await init_1.initCommand.parseAsync(["node", "init", "custom-project"]);
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("custom-project", "other");
        });
        (0, vitest_1.it)("should handle framework detector errors gracefully", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockRejectedValueOnce(new Error("Detection failed"));
            test_utils_1.mockInquirer.select.mockResolvedValueOnce("express");
            await init_1.initCommand.parseAsync(["node", "init", "error-project"]);
            (0, vitest_1.expect)(test_utils_1.mockInquirer.select).toHaveBeenCalled();
            (0, vitest_1.expect)(config.createProjectConfig).toHaveBeenCalledWith("error-project", "express");
        });
    });
    (0, vitest_1.describe)("user experience", () => {
        (0, vitest_1.it)("should display welcome message", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("nextjs");
            await init_1.initCommand.parseAsync(["node", "init", "test-project"]);
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(chalk_1.default.blue("Welcome to CloudExpress!"));
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith("Let's set up your new project.\n");
        });
        (0, vitest_1.it)("should show spinner during config creation", async () => {
            vitest_1.vi.mocked(frameworkDetector.detectFramework).mockResolvedValueOnce("react");
            await init_1.initCommand.parseAsync(["node", "init", "test-project"]);
            // Verify that ora spinner methods were called (mocked internally)
            (0, vitest_1.expect)(test_utils_1.mockConsole.log).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Configuration created!"));
        });
    });
});
//# sourceMappingURL=init.test.js.map