"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("init command - direct test", () => {
    (0, vitest_1.it)("should work with direct execution", async () => {
        // Create temp directory
        const tempDir = path_1.default.join(os_1.default.tmpdir(), `cygni-test-${Date.now()}`);
        await promises_1.default.mkdir(tempDir, { recursive: true });
        try {
            // Execute CLI directly with framework option to avoid prompts
            const cliPath = path_1.default.join(__dirname, "../../dist/index.js");
            const { stdout, stderr } = await execAsync(`node ${cliPath} init my-awesome-project --framework nextjs`, { cwd: tempDir });
            console.log("STDOUT:", stdout);
            console.log("STDERR:", stderr);
            // Check output
            (0, vitest_1.expect)(stdout).toContain("Welcome to CloudExpress!");
            (0, vitest_1.expect)(stdout).toContain("Your project is ready!");
            // Check file was created
            const configPath = path_1.default.join(tempDir, "cygni.yml");
            const configExists = await promises_1.default
                .stat(configPath)
                .then(() => true)
                .catch(() => false);
            (0, vitest_1.expect)(configExists).toBe(true);
            // Read and check config
            const configContent = await promises_1.default.readFile(configPath, "utf-8");
            (0, vitest_1.expect)(configContent).toContain("name: my-awesome-project");
        }
        finally {
            // Cleanup
            await promises_1.default.rm(tempDir, { recursive: true, force: true });
        }
    }, 10000);
});
//# sourceMappingURL=init-direct.test.js.map