"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliExecutor = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Real CLI executor for integration tests.
 * Handles both simple and interactive CLI commands.
 */
class CliExecutor {
    constructor(cliPath) {
        this.cliPath = cliPath || path_1.default.join(__dirname, "../../dist/index.js");
    }
    /**
     * Ensures the CLI is built before running tests
     * Uses a shared promise to avoid multiple builds
     */
    async ensureBuilt() {
        // Skip build if CLI path already exists (for CI/CD environments)
        try {
            await execAsync(`test -f ${this.cliPath}`);
            return;
        }
        catch {
            // File doesn't exist, need to build
        }
        // Use shared build promise to avoid multiple builds
        if (!CliExecutor.buildPromise) {
            CliExecutor.buildPromise = this.performBuild();
        }
        await CliExecutor.buildPromise;
    }
    async performBuild() {
        const projectRoot = path_1.default.join(__dirname, "../..");
        console.log("Building CLI for tests...");
        await execAsync("npm run build", { cwd: projectRoot });
        console.log("CLI build complete");
    }
    /**
     * Executes a simple CLI command (non-interactive)
     */
    async execute(args, options) {
        await this.ensureBuilt();
        const env = { ...process.env, ...options?.env };
        const cwd = options?.cwd || process.cwd();
        try {
            const { stdout, stderr } = await execAsync(`node ${this.cliPath} ${args.join(" ")}`, { env, cwd });
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: 0,
            };
        }
        catch (error) {
            return {
                stdout: error.stdout?.trim() || "",
                stderr: error.stderr?.trim() || error.message,
                code: error.code || 1,
            };
        }
    }
    /**
     * Executes an interactive CLI command
     */
    async executeInteractive(args, options) {
        await this.ensureBuilt();
        return new Promise((resolve, reject) => {
            const env = { ...process.env, ...options.env };
            const cwd = options.cwd || process.cwd();
            const child = (0, child_process_1.spawn)("node", [this.cliPath, ...args], {
                env,
                cwd,
                stdio: ["pipe", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let currentInputIndex = 0;
            const inputs = options.inputs || [];
            // Set timeout if specified
            const timeout = options.timeout || 30000;
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error(`CLI command timed out after ${timeout}ms`));
            }, timeout);
            // Handle stdout
            child.stdout.on("data", (data) => {
                const chunk = data.toString();
                stdout += chunk;
                // Check if we need to respond to any prompts
                if (currentInputIndex < inputs.length) {
                    const input = inputs[currentInputIndex];
                    const matcher = input.waitFor;
                    const matches = typeof matcher === "string"
                        ? stdout.includes(matcher)
                        : matcher.test(stdout);
                    if (matches) {
                        child.stdin.write(input.response + "\n");
                        currentInputIndex++;
                    }
                }
            });
            // Handle stderr
            child.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            // Handle process exit
            child.on("close", (code) => {
                clearTimeout(timer);
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code: code || 0,
                });
            });
            // Handle errors
            child.on("error", (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    /**
     * Executes a command with piped input
     */
    async executeWithInput(args, input, options) {
        await this.ensureBuilt();
        const env = { ...process.env, ...options?.env };
        const cwd = options?.cwd || process.cwd();
        try {
            const { stdout, stderr } = await execAsync(`echo "${input.replace(/"/g, '\\"')}" | node ${this.cliPath} ${args.join(" ")}`, { env, cwd, shell: true });
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: 0,
            };
        }
        catch (error) {
            return {
                stdout: error.stdout?.trim() || "",
                stderr: error.stderr?.trim() || error.message,
                code: error.code || 1,
            };
        }
    }
    /**
     * Tests if a command exits with a specific code
     */
    async expectExit(args, expectedCode, options) {
        const result = await this.execute(args, options);
        return result.code === expectedCode;
    }
    /**
     * Tests if a command outputs specific text
     */
    async expectOutput(args, expectedOutput, options) {
        const result = await this.execute(args, options);
        const output = result.stdout + result.stderr;
        return typeof expectedOutput === "string"
            ? output.includes(expectedOutput)
            : expectedOutput.test(output);
    }
    /**
     * Gets the CLI version
     */
    async getVersion() {
        const result = await this.execute(["--version"]);
        return result.stdout;
    }
    /**
     * Gets the CLI help text
     */
    async getHelp() {
        const result = await this.execute(["--help"]);
        // Help might exit with code 1 but still provide output
        return result.stdout || result.stderr;
    }
    /**
     * Creates a script to handle complex interactive scenarios
     */
    createInteractiveScript(scenario) {
        return `
      const { spawn } = require('child_process');
      const cli = spawn('node', ['${this.cliPath}', ...process.argv.slice(2)], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      ${scenario}
      
      cli.on('close', (code) => {
        process.exit(code);
      });
    `;
    }
}
exports.CliExecutor = CliExecutor;
CliExecutor.buildPromise = null;
//# sourceMappingURL=cli-executor.js.map