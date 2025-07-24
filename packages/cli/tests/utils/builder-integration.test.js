"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const builder_1 = require("../../src/lib/builder");
const real_file_system_1 = require("../services/real-file-system");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("Builder - Integration Tests", () => {
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        fileSystem = new real_file_system_1.RealFileSystem("builder-integration");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("buildProject with real files", () => {
        (0, vitest_1.it)("should build a Next.js project", async () => {
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
                "pages/index.js": "export default function Home() { return <div>Home</div>; }",
            });
            // Initialize git repo
            await execAsync("git init", { cwd: testDir });
            await execAsync("git config user.email 'test@example.com'", {
                cwd: testDir,
            });
            await execAsync("git config user.name 'Test User'", { cwd: testDir });
            await execAsync("git add .", { cwd: testDir });
            await execAsync("git commit -m 'Initial commit'", { cwd: testDir });
            const config = {
                name: "test-nextjs-app",
                framework: "nextjs",
            };
            // Run build in the test directory
            const originalCwd = process.cwd();
            process.chdir(testDir);
            try {
                const result = await (0, builder_1.buildProject)(config);
                (0, vitest_1.expect)(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
                (0, vitest_1.expect)(result.branch).toMatch(/main|master/);
                (0, vitest_1.expect)(result.hasDockerfile).toBe(false);
                (0, vitest_1.expect)(result.buildArgs).toEqual({
                    NODE_ENV: "production",
                    NEXT_TELEMETRY_DISABLED: "1",
                });
            }
            finally {
                process.chdir(originalCwd);
            }
        });
        (0, vitest_1.it)("should build a project with Dockerfile", async () => {
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
            const config = {
                name: "test-docker-app",
                framework: "node",
            };
            const originalCwd = process.cwd();
            process.chdir(testDir);
            try {
                const result = await (0, builder_1.buildProject)(config);
                (0, vitest_1.expect)(result.hasDockerfile).toBe(true);
                (0, vitest_1.expect)(result.dockerfilePath).toBe("Dockerfile");
                // When Dockerfile exists, no buildArgs are generated
                (0, vitest_1.expect)(result.buildArgs).toEqual({});
            }
            finally {
                process.chdir(originalCwd);
            }
        });
        (0, vitest_1.it)("should run pre-build commands", async () => {
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
            const config = {
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
                await (0, builder_1.buildProject)(config);
                // Check if prebuild command ran
                const envBuildPath = path_1.default.join(testDir, ".env.build");
                const envBuildExists = await promises_1.default
                    .access(envBuildPath)
                    .then(() => true)
                    .catch(() => false);
                (0, vitest_1.expect)(envBuildExists).toBe(true);
                if (envBuildExists) {
                    const content = await promises_1.default.readFile(envBuildPath, "utf-8");
                    (0, vitest_1.expect)(content).toContain("PREBUILD_RAN=true");
                }
            }
            finally {
                process.chdir(originalCwd);
            }
        });
        (0, vitest_1.it)("should detect Python framework", async () => {
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
            const config = {
                name: "test-python-app",
                // No framework specified - should auto-detect
            };
            const originalCwd = process.cwd();
            process.chdir(testDir);
            try {
                const result = await (0, builder_1.buildProject)(config);
                (0, vitest_1.expect)(result.detectedFramework).toBe("flask");
                (0, vitest_1.expect)(result.buildArgs).toEqual({
                    NODE_ENV: "production",
                });
            }
            finally {
                process.chdir(originalCwd);
            }
        });
        (0, vitest_1.it)("should handle build command failures gracefully", async () => {
            // Create project with failing build command
            await fileSystem.createStructure({
                "package.json": JSON.stringify({
                    name: "test-fail-app",
                    scripts: {
                        build: "exit 1",
                    },
                }),
            });
            const config = {
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
                await (0, vitest_1.expect)((0, builder_1.buildProject)(config)).rejects.toThrow();
            }
            finally {
                process.chdir(originalCwd);
            }
        });
        (0, vitest_1.it)("should handle multi-stage Docker builds", async () => {
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
            const config = {
                name: "test-multistage-app",
                framework: "node",
            };
            const originalCwd = process.cwd();
            process.chdir(testDir);
            try {
                const result = await (0, builder_1.buildProject)(config);
                (0, vitest_1.expect)(result.hasDockerfile).toBe(true);
                (0, vitest_1.expect)(result.dockerfilePath).toBe("Dockerfile");
                // Read the Dockerfile to verify it's multi-stage
                const dockerfileContent = await promises_1.default.readFile(path_1.default.join(testDir, "Dockerfile"), "utf-8");
                (0, vitest_1.expect)(dockerfileContent).toContain("AS builder");
                (0, vitest_1.expect)(dockerfileContent).toContain("COPY --from=builder");
            }
            finally {
                process.chdir(originalCwd);
            }
        });
    });
});
//# sourceMappingURL=builder-integration.test.js.map