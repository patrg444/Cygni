import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildProject, BuildConfig } from "../../src/lib/builder";
import { RealFileSystem } from "../services/real-file-system";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

describe("Builder - Integration Tests", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    fileSystem = new RealFileSystem("builder-integration");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("buildProject with real files", () => {
    it("should build a Next.js project", async () => {
      // Create Next.js project structure
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "test-nextjs-app",
          dependencies: {
            next: "^13.0.0",
            react: "^18.0.0",
          },
        }),
        "next.config.js": "module.exports = {};",
        "pages/index.js":
          "export default function Home() { return <div>Home</div>; }",
      });

      // Initialize git repo
      await execAsync("git init", { cwd: testDir });
      await execAsync("git config user.email 'test@example.com'", {
        cwd: testDir,
      });
      await execAsync("git config user.name 'Test User'", { cwd: testDir });
      await execAsync("git add .", { cwd: testDir });
      await execAsync("git commit -m 'Initial commit'", { cwd: testDir });

      const config: BuildConfig = {
        name: "test-nextjs-app",
        framework: "nextjs",
      };

      // Run build in the test directory
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const result = await buildProject(config);

        expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
        expect(result.branch).toMatch(/main|master/);
        expect(result.hasDockerfile).toBe(false);
        expect(result.buildArgs).toEqual({
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should build a project with Dockerfile", async () => {
      // Create project with Dockerfile
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "test-docker-app",
          scripts: {
            start: "node index.js",
          },
        }),
        "index.js": 'console.log("Hello from Docker!");',
        Dockerfile: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]`,
      });

      const config: BuildConfig = {
        name: "test-docker-app",
        framework: "node",
      };

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const result = await buildProject(config);

        expect(result.hasDockerfile).toBe(true);
        expect(result.dockerfilePath).toBe("Dockerfile");
        // When Dockerfile exists, no buildArgs are generated
        expect(result.buildArgs).toEqual({});
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should run pre-build commands", async () => {
      // Create project with pre-build script
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "test-prebuild-app",
          scripts: {
            prebuild: "echo 'PREBUILD_RAN=true' > .env.build",
          },
        }),
        "index.js": 'console.log("App");',
      });

      const config: BuildConfig = {
        name: "test-prebuild-app",
        framework: "node",
        services: {
          web: {
            build: {
              command: "npm run prebuild",
            },
          },
        },
      };

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        await buildProject(config);

        // Check if prebuild command ran
        const envBuildPath = path.join(testDir, ".env.build");
        const envBuildExists = await fs
          .access(envBuildPath)
          .then(() => true)
          .catch(() => false);
        expect(envBuildExists).toBe(true);

        if (envBuildExists) {
          const content = await fs.readFile(envBuildPath, "utf-8");
          expect(content).toContain("PREBUILD_RAN=true");
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should detect Python framework", async () => {
      // Create Python project
      await fileSystem.createStructure({
        "requirements.txt": "flask==2.0.0\ngunicorn==20.1.0",
        "app.py": `from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return 'Hello World!'`,
        Procfile: "web: gunicorn app:app",
      });

      const config: BuildConfig = {
        name: "test-python-app",
        // No framework specified - should auto-detect
      };

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const result = await buildProject(config);

        expect(result.detectedFramework).toBe("flask");
        expect(result.buildArgs).toEqual({
          NODE_ENV: "production",
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle build command failures gracefully", async () => {
      // Create project with failing build command
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "test-fail-app",
          scripts: {
            build: "exit 1",
          },
        }),
      });

      const config: BuildConfig = {
        name: "test-fail-app",
        framework: "node",
        services: {
          web: {
            build: {
              command: "npm run build",
            },
          },
        },
      };

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        // Build should throw when pre-build fails
        await expect(buildProject(config)).rejects.toThrow();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle multi-stage Docker builds", async () => {
      // Create project with multi-stage Dockerfile
      await fileSystem.createStructure({
        "package.json": JSON.stringify({
          name: "test-multistage-app",
          scripts: {
            build: "tsc",
            start: "node dist/index.js",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            outDir: "./dist",
            module: "commonjs",
            target: "es2020",
          },
        }),
        "src/index.ts": 'console.log("TypeScript app");',
        Dockerfile: `# Build stage
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
      });

      const config: BuildConfig = {
        name: "test-multistage-app",
        framework: "node",
      };

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const result = await buildProject(config);

        expect(result.hasDockerfile).toBe(true);
        expect(result.dockerfilePath).toBe("Dockerfile");

        // Read the Dockerfile to verify it's multi-stage
        const dockerfileContent = await fs.readFile(
          path.join(testDir, "Dockerfile"),
          "utf-8",
        );
        expect(dockerfileContent).toContain("AS builder");
        expect(dockerfileContent).toContain("COPY --from=builder");
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
