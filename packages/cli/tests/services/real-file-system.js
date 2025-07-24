"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealFileSystem = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * Real file system service for integration tests.
 * Provides isolated test directories and cleanup.
 */
class RealFileSystem {
    constructor(testName) {
        this.testDirs = new Set();
        const timestamp = Date.now();
        const hash = crypto_1.default.randomBytes(4).toString("hex");
        const dirName = testName
            ? `cygni-test-${testName}-${timestamp}-${hash}`
            : `cygni-test-${timestamp}-${hash}`;
        this.baseDir = path_1.default.join(os_1.default.tmpdir(), dirName);
    }
    /**
     * Creates a test directory and returns its path
     */
    async createTestDir(name) {
        const dirPath = name ? path_1.default.join(this.baseDir, name) : this.baseDir;
        await promises_1.default.mkdir(dirPath, { recursive: true });
        this.testDirs.add(dirPath);
        return dirPath;
    }
    /**
     * Creates a test file with content
     */
    async createFile(filePath, content) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        const dir = path_1.default.dirname(fullPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(fullPath, content, "utf-8");
    }
    /**
     * Creates a directory
     */
    async createDir(dirPath) {
        const fullPath = path_1.default.isAbsolute(dirPath)
            ? dirPath
            : path_1.default.join(this.baseDir, dirPath);
        await promises_1.default.mkdir(fullPath, { recursive: true });
    }
    /**
     * Creates a test directory structure
     */
    async createStructure(structure) {
        const rootDir = await this.createTestDir();
        const createRecursive = async (basePath, struct) => {
            for (const [key, value] of Object.entries(struct)) {
                const fullPath = path_1.default.join(basePath, key);
                if (typeof value === "string") {
                    // It's a file
                    await this.createFile(fullPath, value);
                }
                else {
                    // It's a directory
                    await promises_1.default.mkdir(fullPath, { recursive: true });
                    await createRecursive(fullPath, value);
                }
            }
        };
        await createRecursive(rootDir, structure);
        return rootDir;
    }
    /**
     * Reads a file from the test directory
     */
    async readFile(filePath) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        return await promises_1.default.readFile(fullPath, "utf-8");
    }
    /**
     * Checks if a file exists
     */
    async exists(filePath) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        try {
            await promises_1.default.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Gets file stats
     */
    async stat(filePath) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        return await promises_1.default.stat(fullPath);
    }
    /**
     * Sets file permissions
     */
    async chmod(filePath, mode) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        await promises_1.default.chmod(fullPath, mode);
    }
    /**
     * Lists directory contents
     */
    async listDir(dirPath = "") {
        const fullPath = dirPath ? path_1.default.join(this.baseDir, dirPath) : this.baseDir;
        return await promises_1.default.readdir(fullPath);
    }
    /**
     * Removes a file or directory
     */
    async remove(filePath) {
        const fullPath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.baseDir, filePath);
        await promises_1.default.rm(fullPath, { recursive: true, force: true });
    }
    /**
     * Gets the base test directory path
     */
    getBasePath() {
        return this.baseDir;
    }
    /**
     * Gets the full path for a relative path
     */
    getPath(relativePath) {
        return path_1.default.join(this.baseDir, relativePath);
    }
    /**
     * Cleans up all test directories
     */
    async cleanup() {
        for (const dir of this.testDirs) {
            try {
                await promises_1.default.rm(dir, { recursive: true, force: true });
            }
            catch (error) {
                // Ignore errors during cleanup
                console.warn(`Failed to cleanup ${dir}:`, error);
            }
        }
        // Also try to clean the base dir
        try {
            await promises_1.default.rm(this.baseDir, { recursive: true, force: true });
        }
        catch {
            // Ignore
        }
        this.testDirs.clear();
    }
    /**
     * Creates a mock home directory for testing auth operations
     */
    async createMockHome() {
        const homeDir = await this.createTestDir("home");
        return homeDir;
    }
    /**
     * Monitors file changes in a directory
     */
    async watchForChanges(dirPath, callback) {
        const fullPath = path_1.default.isAbsolute(dirPath)
            ? dirPath
            : path_1.default.join(this.baseDir, dirPath);
        const watcher = promises_1.default.watch(fullPath, { recursive: true });
        for await (const event of watcher) {
            callback(event.eventType, event.filename || "");
        }
        return () => watcher.close();
    }
}
exports.RealFileSystem = RealFileSystem;
//# sourceMappingURL=real-file-system.js.map