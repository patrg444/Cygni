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
export declare class FastCliExecutor {
    private cliPath;
    constructor(cliPath?: string);
    /**
     * Executes a simple CLI command (non-interactive)
     */
    execute(args: string[], options?: {
        env?: Record<string, string>;
        cwd?: string;
    }): Promise<CliResult>;
    /**
     * Executes an interactive CLI command
     */
    executeInteractive(args: string[], options: InteractiveCliOptions): Promise<CliResult>;
    /**
     * Executes a command with piped input
     */
    executeWithInput(args: string[], input: string, options?: {
        env?: Record<string, string>;
        cwd?: string;
    }): Promise<CliResult>;
}
//# sourceMappingURL=cli-executor-fast.d.ts.map