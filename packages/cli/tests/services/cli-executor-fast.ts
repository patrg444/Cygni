import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface InteractiveCliOptions {
  inputs?: Array<{
    waitFor: string | RegExp;
    response: string;
  }>;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

/**
 * Fast CLI executor that assumes the CLI is already built.
 * Use this for faster test execution when you know the CLI is built.
 */
export class FastCliExecutor {
  private cliPath: string;

  constructor(cliPath?: string) {
    this.cliPath = cliPath || path.join(__dirname, "../../dist/index.js");
  }

  /**
   * Executes a simple CLI command (non-interactive)
   */
  async execute(
    args: string[],
    options?: { env?: Record<string, string>; cwd?: string },
  ): Promise<CliResult> {
    const env = { ...process.env, ...options?.env };
    const cwd = options?.cwd || process.cwd();

    try {
      // Properly quote arguments that contain spaces
      const quotedArgs = args.map((arg) =>
        arg.includes(" ") ? `"${arg}"` : arg,
      );
      const { stdout, stderr } = await execAsync(
        `node ${this.cliPath} ${quotedArgs.join(" ")}`,
        { env, cwd },
      );

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: 0,
      };
    } catch (error: any) {
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
  async executeInteractive(
    args: string[],
    options: InteractiveCliOptions,
  ): Promise<CliResult> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...options.env };
      const cwd = options.cwd || process.cwd();

      const child = spawn("node", [this.cliPath, ...args], {
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
          if (input) {
            const matcher = input.waitFor;

            const matches =
              typeof matcher === "string"
                ? stdout.includes(matcher)
                : matcher.test(stdout);

            if (matches) {
              child.stdin.write(input.response + "\n");
              currentInputIndex++;
            }
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
  async executeWithInput(
    args: string[],
    input: string,
    options?: { env?: Record<string, string>; cwd?: string },
  ): Promise<CliResult> {
    const env = { ...process.env, ...options?.env };
    const cwd = options?.cwd || process.cwd();

    try {
      const { stdout, stderr } = await execAsync(
        `echo "${input.replace(/"/g, '\\"')}" | node ${this.cliPath} ${args.join(" ")}`,
        { env, cwd },
      );

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || error.message,
        code: error.code || 1,
      };
    }
  }
}
