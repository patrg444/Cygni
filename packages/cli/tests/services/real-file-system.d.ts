/**
 * Real file system service for integration tests.
 * Provides isolated test directories and cleanup.
 */
export declare class RealFileSystem {
    private testDirs;
    private baseDir;
    constructor(testName?: string);
    /**
     * Creates a test directory and returns its path
     */
    createTestDir(name?: string): Promise<string>;
    /**
     * Creates a test file with content
     */
    createFile(filePath: string, content: string): Promise<void>;
    /**
     * Creates a directory
     */
    createDir(dirPath: string): Promise<void>;
    /**
     * Creates a test directory structure
     */
    createStructure(structure: Record<string, string | Record<string, any>>): Promise<string>;
    /**
     * Reads a file from the test directory
     */
    readFile(filePath: string): Promise<string>;
    /**
     * Checks if a file exists
     */
    exists(filePath: string): Promise<boolean>;
    /**
     * Gets file stats
     */
    stat(filePath: string): Promise<any>;
    /**
     * Sets file permissions
     */
    chmod(filePath: string, mode: number): Promise<void>;
    /**
     * Lists directory contents
     */
    listDir(dirPath?: string): Promise<string[]>;
    /**
     * Removes a file or directory
     */
    remove(filePath: string): Promise<void>;
    /**
     * Gets the base test directory path
     */
    getBasePath(): string;
    /**
     * Gets the full path for a relative path
     */
    getPath(relativePath: string): string;
    /**
     * Cleans up all test directories
     */
    cleanup(): Promise<void>;
    /**
     * Creates a mock home directory for testing auth operations
     */
    createMockHome(): Promise<string>;
    /**
     * Monitors file changes in a directory
     */
    watchForChanges(dirPath: string, callback: (event: string, filename: string) => void): Promise<() => void>;
}
//# sourceMappingURL=real-file-system.d.ts.map