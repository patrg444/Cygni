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
 * Real CLI executor for integration tests.
 * Handles both simple and interactive CLI commands.
 */
export declare class CliExecutor {
    private cliPath;
    private static buildPromise;
    constructor(cliPath?: string);
    /**
     * Ensures the CLI is built before running tests
     * Uses a shared promise to avoid multiple builds
     */
    ensureBuilt(): Promise<void>;
    private performBuild;
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
    /**
     * Tests if a command exits with a specific code
     */
    expectExit(args: string[], expectedCode: number, options?: {
        env?: Record<string, string>;
    }): Promise<boolean>;
    /**
     * Tests if a command outputs specific text
     */
    expectOutput(args: string[], expectedOutput: string | RegExp, options?: {
        env?: Record<string, string>;
    }): Promise<boolean>;
    /**
     * Gets the CLI version
     */
    getVersion(): Promise<string>;
    /**
     * Gets the CLI help text
     */
    getHelp(): Promise<string>;
    /**
     * Creates a script to handle complex interactive scenarios
     */
    createInteractiveScript(scenario: string): string;
}
//# sourceMappingURL=cli-executor.d.ts.map