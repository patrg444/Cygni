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
(0, vitest_1.describe)("CLI Integration - Real Command Execution", () => {
    const testDir = path_1.default.join(os_1.default.tmpdir(), `cygni-cli-test-${Date.now()}`);
    const cliPath = path_1.default.join(__dirname, "../dist/index.js");
    (0, vitest_1.beforeEach)(async () => {
        await promises_1.default.mkdir(testDir, { recursive: true });
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(testDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)("User initializes a new project", () => {
        (0, vitest_1.it)("should create cygni.yml config file with init command", async () => {
            // Build the CLI first
            await execAsync("npm run build", { cwd: path_1.default.join(__dirname, "..") });
            // Run init command
            const { stdout, stderr } = await execAsync(`node ${cliPath} init my-test-project --framework nextjs`, {
                cwd: testDir,
                env: { ...process.env, CI: "true" }, // Prevent interactive prompts
            });
            // Check output - the command outputs with special characters
            const fullOutput = stdout + stderr;
            (0, vitest_1.expect)(fullOutput.toLowerCase()).toContain("configuration created");
            (0, vitest_1.expect)(fullOutput).toContain("Your project is ready!");
            // Verify file was created
            const configPath = path_1.default.join(testDir, "cygni.yml");
            const exists = await promises_1.default
                .access(configPath)
                .then(() => true)
                .catch(() => false);
            (0, vitest_1.expect)(exists).toBe(true);
            // Read and verify content
            const content = await promises_1.default.readFile(configPath, "utf-8");
            (0, vitest_1.expect)(content).toContain("name: my-test-project");
            (0, vitest_1.expect)(content).toContain("framework: nextjs");
        });
    });
    (0, vitest_1.describe)("User validates runtime configuration", () => {
        (0, vitest_1.it)("should validate runtime.yaml file", async () => {
            // Create a runtime.yaml file
            const runtime = `
runtime: node
version: "20"
memory: 512
cpu: 256
`;
            await promises_1.default.writeFile(path_1.default.join(testDir, "runtime.yaml"), runtime);
            // Run validate command
            const { stdout, stderr } = await execAsync(`node ${cliPath} validate runtime.yaml`, { cwd: testDir });
            // Should validate successfully
            (0, vitest_1.expect)(stdout + stderr).toContain("valid");
        });
    });
    (0, vitest_1.describe)("User checks CLI version", () => {
        (0, vitest_1.it)("should display version information", async () => {
            try {
                const { stdout } = await execAsync(`node ${cliPath} --version`);
                // Should show version from package.json
                (0, vitest_1.expect)(stdout).toMatch(/\d+\.\d+\.\d+/); // Semantic version
            }
            catch (error) {
                // CLI might exit with code 1 but still output version
                (0, vitest_1.expect)(error.stdout).toMatch(/\d+\.\d+\.\d+/);
            }
        });
    });
    (0, vitest_1.describe)("User gets help", () => {
        (0, vitest_1.it)("should display available commands", async () => {
            try {
                const { stdout } = await execAsync(`node ${cliPath} --help`);
                // Should show available commands
                (0, vitest_1.expect)(stdout).toContain("init");
                (0, vitest_1.expect)(stdout).toContain("login");
                (0, vitest_1.expect)(stdout).toContain("deploy");
                (0, vitest_1.expect)(stdout).toContain("secrets");
            }
            catch (error) {
                // CLI might exit with code 1 but still output help
                const output = error.stdout || "";
                (0, vitest_1.expect)(output).toContain("init");
                (0, vitest_1.expect)(output).toContain("login");
                (0, vitest_1.expect)(output).toContain("deploy");
                (0, vitest_1.expect)(output).toContain("secrets");
            }
        });
    });
});
//# sourceMappingURL=cli-integration.test.js.map