import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildProject, BuildConfig } from "../../src/lib/builder";
import { RealFileSystem } from "../services/real-file-system";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

describe("Builder - Real Implementation", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    fileSystem = new RealFileSystem("builder");
    testDir = await fileSystem.createTestDir();
    // Change to test directory before each test
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Always restore original directory
    process.chdir(originalCwd);
    await fileSystem.cleanup();
  });

  describe("buildProject", () => {
    it("should handle non-git repository", async () => {
      const config: BuildConfig = {
        name: "test-app",
        framework: "nextjs",
      };

      const result = await buildProject(config);

      // Should generate a pseudo commit SHA
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.branch).toBe("main");
      expect(result.hasDockerfile).toBe(false);
    });

    it("should work with git repository", async () => {
      // Initialize git repo in current directory (we're already chdir'd)
      await execAsync("git init");
      await execAsync("git config user.email 'test@example.com'");
      await execAsync("git config user.name 'Test User'");

      // Create a file and commit
      await fileSystem.createFile("test.txt", "test content");
      await execAsync("git add .");
      await execAsync("git commit -m 'Initial commit'");

      const config: BuildConfig = {
        name: "test-app",
        framework: "nextjs",
      };

      const result = await buildProject(config);

      // Should get real git info
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.branch).toMatch(/main|master/); // Could be either depending on git config
      expect(result.hasDockerfile).toBe(false);
    });

    it("should detect Dockerfile when present", async () => {
      await fileSystem.createFile(
        "Dockerfile",
        `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]`,
      );

      const config: BuildConfig = {
        name: "test-app",
        framework: "nextjs",
      };

      const result = await buildProject(config);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe("Dockerfile");
    });

    it("should detect lowercase dockerfile", async () => {
      await fileSystem.createFile(
        "dockerfile",
        `FROM node:20-alpine
WORKDIR /app`,
      );

      const config: BuildConfig = {
        name: "test-app",
        framework: "nextjs",
      };

      const result = await buildProject(config);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe("dockerfile");
    });

    it("should auto-detect framework when not specified", async () => {
      // Create Next.js project structure
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          dependencies: {
            next: "^13.0.0",
            react: "^18.0.0",
          },
        }),
        "next.config.js": "module.exports = {};",
      });

      const config: BuildConfig = {
        name: "test-app",
        // No framework specified
      };

      const result = await buildProject(config);

      expect(result.detectedFramework).toBe("nextjs");
    });

    it("should set correct buildpack args for Next.js", async () => {
      const config: BuildConfig = {
        name: "test-app",
        framework: "nextjs",
      };

      const result = await buildProject(config);

      expect(result.buildArgs).toEqual({
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      });
    });

    it("should run pre-build commands when specified", async () => {
      // Create a simple script that creates a marker file
      const config: BuildConfig = {
        name: "test-app",
        framework: "node",
        services: {
          web: {
            build: {
              command: "echo 'Prebuild ran' > prebuild.marker",
            },
          },
        },
      };

      await buildProject(config);

      // Check if prebuild command ran
      const markerExists = await fileSystem.exists("prebuild.marker");
      expect(markerExists).toBe(true);

      if (markerExists) {
        const content = await fileSystem.readFile("prebuild.marker");
        expect(content).toContain("Prebuild ran");
      }
    });

    it("should handle build errors gracefully", async () => {
      const config: BuildConfig = {
        name: "test-app",
        framework: "node",
        services: {
          web: {
            build: {
              command: "exit 1", // Command that fails
            },
          },
        },
      };

      // Build should throw when prebuild fails
      await expect(buildProject(config)).rejects.toThrow();
    });

    it("should support Python framework", async () => {
      await fileSystem.createFile(
        "requirements.txt",
        "flask==2.0.0\nrequests==2.26.0",
      );
      await fileSystem.createFile(
        "app.py",
        "from flask import Flask\napp = Flask(__name__)",
      );

      const config: BuildConfig = {
        name: "test-app",
        framework: "flask",
      };

      const result = await buildProject(config);

      // Python frameworks get base args
      expect(result.buildArgs).toEqual({
        NODE_ENV: "production",
      });
    });

    it("should handle Docker multi-stage builds", async () => {
      await fileSystem.createFile(
        "Dockerfile",
        `# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --production
CMD ["node", "dist/index.js"]`,
      );

      const config: BuildConfig = {
        name: "test-app",
        framework: "node",
      };

      const result = await buildProject(config);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe("Dockerfile");
    });
  });
});
