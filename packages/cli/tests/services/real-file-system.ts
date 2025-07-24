import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

/**
 * Real file system service for integration tests.
 * Provides isolated test directories and cleanup.
 */
export class RealFileSystem {
  private testDirs: Set<string> = new Set();
  private baseDir: string;

  constructor(testName?: string) {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(4).toString("hex");
    const dirName = testName
      ? `cygni-test-${testName}-${timestamp}-${hash}`
      : `cygni-test-${timestamp}-${hash}`;
    this.baseDir = path.join(os.tmpdir(), dirName);
  }

  /**
   * Creates a test directory and returns its path
   */
  async createTestDir(name?: string): Promise<string> {
    const dirPath = name ? path.join(this.baseDir, name) : this.baseDir;
    await fs.mkdir(dirPath, { recursive: true });
    this.testDirs.add(dirPath);
    return dirPath;
  }

  /**
   * Creates a test file with content
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Creates a directory
   */
  async createDir(dirPath: string): Promise<void> {
    const fullPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(this.baseDir, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * Creates a test directory structure
   */
  async createStructure(
    structure: Record<string, string | Record<string, any>>,
  ): Promise<string> {
    const rootDir = await this.createTestDir();

    const createRecursive = async (
      basePath: string,
      struct: Record<string, any>,
    ) => {
      for (const [key, value] of Object.entries(struct)) {
        const fullPath = path.join(basePath, key);

        if (typeof value === "string") {
          // It's a file
          await this.createFile(fullPath, value);
        } else {
          // It's a directory
          await fs.mkdir(fullPath, { recursive: true });
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
  async readFile(filePath: string): Promise<string> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    return await fs.readFile(fullPath, "utf-8");
  }

  /**
   * Checks if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets file stats
   */
  async stat(filePath: string): Promise<any> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    return await fs.stat(fullPath);
  }

  /**
   * Sets file permissions
   */
  async chmod(filePath: string, mode: number): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    await fs.chmod(fullPath, mode);
  }

  /**
   * Lists directory contents
   */
  async listDir(dirPath: string = ""): Promise<string[]> {
    const fullPath = dirPath ? path.join(this.baseDir, dirPath) : this.baseDir;
    return await fs.readdir(fullPath);
  }

  /**
   * Removes a file or directory
   */
  async remove(filePath: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.baseDir, filePath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  /**
   * Gets the base test directory path
   */
  getBasePath(): string {
    return this.baseDir;
  }

  /**
   * Gets the full path for a relative path
   */
  getPath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  /**
   * Cleans up all test directories
   */
  async cleanup(): Promise<void> {
    for (const dir of this.testDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
        console.warn(`Failed to cleanup ${dir}:`, error);
      }
    }

    // Also try to clean the base dir
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    this.testDirs.clear();
  }

  /**
   * Creates a mock home directory for testing auth operations
   */
  async createMockHome(): Promise<string> {
    const homeDir = await this.createTestDir("home");
    return homeDir;
  }

  /**
   * Monitors file changes in a directory
   */
  async watchForChanges(
    dirPath: string,
    callback: (event: string, filename: string) => void,
  ): Promise<() => void> {
    const fullPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(this.baseDir, dirPath);
    const watcher = fs.watch(fullPath, { recursive: true });

    for await (const event of watcher) {
      callback(event.eventType, event.filename || "");
    }

    return () => watcher.close();
  }
}
