"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const builder_1 = require("../../src/lib/builder");
const real_file_system_1 = require("../services/real-file-system");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("Builder - Real Implementation", () => {
    let fileSystem;
    let testDir;
    let originalCwd;
    (0, vitest_1.beforeEach)(async () => {
        originalCwd = process.cwd();
        fileSystem = new real_file_system_1.RealFileSystem("builder");
        testDir = await fileSystem.createTestDir();
        // Change to test directory before each test
        process.chdir(testDir);
    });
    (0, vitest_1.afterEach)(async () => {
        // Always restore original directory
        process.chdir(originalCwd);
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("buildProject", () => {
        (0, vitest_1.it)("should handle non-git repository", async () => {
            const config = {
                name: "test-app",
                framework: "nextjs",
            };
            const result = await (0, builder_1.buildProject)(config);
            // Should generate a pseudo commit SHA
            (0, vitest_1.expect)(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
            (0, vitest_1.expect)(result.branch).toBe("main");
            (0, vitest_1.expect)(result.hasDockerfile).toBe(false);
        });
        (0, vitest_1.it)("should work with git repository", async () => {
            // Initialize git repo in current directory (we're already chdir'd)
            await execAsync("git init");
            await execAsync("git config user.email 'test@example.com'");
            await execAsync("git config user.name 'Test User'");
            // Create a file and commit
            await fileSystem.createFile("test.txt", "test content");
            await execAsync("git add .");
            await execAsync("git commit -m 'Initial commit'");
            const config = {
                name: "test-app",
                framework: "nextjs",
            };
            const result = await (0, builder_1.buildProject)(config);
            // Should get real git info
            (0, vitest_1.expect)(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
            (0, vitest_1.expect)(result.branch).toMatch(/main|master/); // Could be either depending on git config
            (0, vitest_1.expect)(result.hasDockerfile).toBe(false);
        });
        (0, vitest_1.it)("should detect Dockerfile when present", async () => {
            await fileSystem.createFile("Dockerfile", `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]`);
            const config = {
                name: "test-app",
                framework: "nextjs",
            };
            const result = await (0, builder_1.buildProject)(config);
            (0, vitest_1.expect)(result.hasDockerfile).toBe(true);
            (0, vitest_1.expect)(result.dockerfilePath).toBe("Dockerfile");
        });
        (0, vitest_1.it)("should detect lowercase dockerfile", async () => {
            await fileSystem.createFile("dockerfile", `FROM node:20-alpine
WORKDIR /app`);
            const config = {
                name: "test-app",
                framework: "nextjs",
            };
            const result = await (0, builder_1.buildProject)(config);
            (0, vitest_1.expect)(result.hasDockerfile).toBe(true);
            (0, vitest_1.expect)(result.dockerfilePath).toBe("dockerfile");
        });
        (0, vitest_1.it)("should auto-detect framework when not specified", async () => {
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
            const config = {
                name: "test-app",
                // No framework specified
            };
            const result = await (0, builder_1.buildProject)(config);
            (0, vitest_1.expect)(result.detectedFramework).toBe("nextjs");
        });
        (0, vitest_1.it)("should set correct buildpack args for Next.js", async () => {
            const config = {
                name: "test-app",
                framework: "nextjs",
            };
            const result = await (0, builder_1.buildProject)(config);
            (0, vitest_1.expect)(result.buildArgs).toEqual({
                NODE_ENV: "production",
                NEXT_TELEMETRY_DISABLED: "1",
            });
        });
        (0, vitest_1.it)("should run pre-build commands when specified", async () => {
            // Create a simple script that creates a marker file
            const config = {
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
            await (0, builder_1.buildProject)(config);
            // Check if prebuild command ran
            const markerExists = await fileSystem.exists("prebuild.marker");
            (0, vitest_1.expect)(markerExists).toBe(true);
            if (markerExists) {
                const content = await fileSystem.readFile("prebuild.marker");
                (0, vitest_1.expect)(content).toContain("Prebuild ran");
            }
        });
        (0, vitest_1.it)("should handle build errors gracefully", async () => {
            const config = {
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
            await (0, vitest_1.expect)((0, builder_1.buildProject)(config)).rejects.toThrow();
        });
        (0, vitest_1.it)("should support Python framework", async () => {
            await fileSystem.createFile("requirements.txt", "flask==2.0.0\nrequests==2.26.0");
            await fileSystem.createFile("app.py", "from flask import Flask\napp = Flask(__name__)");
            const config = {
                name: "test-app",
                framework: "flask",
            };
            const result = await (0, builder_1.buildProject)(config);
            // Python frameworks get base args
            (0, vitest_1.expect)(result.buildArgs).toEqual({
                NODE_ENV: "production",
            });
        });
        (0, vitest_1.it)("should handle Docker multi-stage builds", async () => {
            await fileSystem.createFile("Dockerfile", `# Build stage
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
CMD ["node", "dist/index.js"]`);
            const config = {
                name: "test-app",
                framework: "node",
            };
            const result = await (0, builder_1.buildProject)(config);
            (0, vitest_1.expect)(result.hasDockerfile).toBe(true);
            (0, vitest_1.expect)(result.dockerfilePath).toBe("Dockerfile");
        });
    });
});
//# sourceMappingURL=builder-real.test.js.map