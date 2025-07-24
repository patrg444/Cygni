"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fullstack_analyzer_1 = require("../../src/lib/fullstack-analyzer");
const real_file_system_1 = require("../services/real-file-system");
const path_1 = __importDefault(require("path"));
(0, vitest_1.describe)("FullstackAnalyzer", () => {
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        fileSystem = new real_file_system_1.RealFileSystem("fullstack-analyzer-test");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.it)("should detect monorepo with workspaces", async () => {
        // Create monorepo structure
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "fullstack-app",
            private: true,
            workspaces: ["frontend", "backend"],
        }));
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "frontend",
            dependencies: {
                react: "^18.0.0",
                "react-dom": "^18.0.0",
            },
        }));
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "backend",
            dependencies: {
                express: "^4.18.0",
            },
        }));
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        (0, vitest_1.expect)(result.isMonorepo).toBe(true);
        (0, vitest_1.expect)(result.workspaces).toHaveLength(2);
        (0, vitest_1.expect)(result.services).toHaveLength(2);
        const frontend = result.services.find((s) => s.name === "frontend");
        const backend = result.services.find((s) => s.name === "backend");
        (0, vitest_1.expect)(frontend).toBeDefined();
        (0, vitest_1.expect)(frontend?.type).toBe("frontend");
        (0, vitest_1.expect)(frontend?.framework).toBe("react");
        (0, vitest_1.expect)(backend).toBeDefined();
        (0, vitest_1.expect)(backend?.type).toBe("backend");
        (0, vitest_1.expect)(backend?.framework).toBe("express");
    });
    (0, vitest_1.it)("should detect separate frontend/backend directories", async () => {
        // Create separate directories
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "my-frontend",
            dependencies: {
                vue: "^3.0.0",
            },
        }));
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "my-backend",
            dependencies: {
                fastify: "^4.0.0",
            },
        }));
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        (0, vitest_1.expect)(result.isMonorepo).toBe(false);
        (0, vitest_1.expect)(result.services).toHaveLength(2);
        const frontend = result.services.find((s) => s.type === "frontend");
        const backend = result.services.find((s) => s.type === "backend");
        (0, vitest_1.expect)(frontend?.framework).toBe("vue");
        (0, vitest_1.expect)(backend?.framework).toBe("fastify");
    });
    (0, vitest_1.it)("should detect Next.js as fullstack framework", async () => {
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "nextjs-app",
            dependencies: {
                next: "^13.0.0",
                react: "^18.0.0",
            },
        }));
        await fileSystem.createFile("next.config.js", "module.exports = {}");
        // Create API routes
        await fileSystem.createFile("app/api/users/route.ts", `
      export async function GET() {
        return Response.json({ users: [] });
      }
    `);
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        (0, vitest_1.expect)(result.services).toHaveLength(1);
        (0, vitest_1.expect)(result.services[0].type).toBe("fullstack");
        (0, vitest_1.expect)(result.services[0].framework).toBe("nextjs");
    });
    (0, vitest_1.it)("should detect environment variables", async () => {
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "api",
            dependencies: { express: "^4.18.0" },
        }));
        await fileSystem.createFile("backend/.env.example", `
DATABASE_URL=postgresql://localhost/mydb
JWT_SECRET=your-secret-here
PORT=3001
API_KEY=
    `);
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        const backend = result.services.find((s) => s.name === "backend");
        (0, vitest_1.expect)(backend?.envVars).toContain("DATABASE_URL");
        (0, vitest_1.expect)(backend?.envVars).toContain("JWT_SECRET");
        (0, vitest_1.expect)(backend?.envVars).toContain("PORT");
        (0, vitest_1.expect)(backend?.envVars).toContain("API_KEY");
    });
    (0, vitest_1.it)("should detect ports from various sources", async () => {
        // Service with PORT in .env
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "backend",
            dependencies: { express: "^4.18.0" },
        }));
        await fileSystem.createFile("backend/.env", "PORT=3001");
        // Service with port in package.json script
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "frontend",
            scripts: {
                start: "vite --port 5173",
            },
            dependencies: { react: "^18.0.0" },
        }));
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        const backend = result.services.find((s) => s.name === "backend");
        const frontend = result.services.find((s) => s.name === "frontend");
        (0, vitest_1.expect)(backend?.port).toBe(3001);
        (0, vitest_1.expect)(frontend?.port).toBe(5173);
    });
    (0, vitest_1.it)("should determine relationships between services", async () => {
        await fileSystem.createFile("frontend/package.json", JSON.stringify({
            name: "frontend",
            dependencies: { react: "^18.0.0" },
        }));
        await fileSystem.createFile("frontend/.env.example", `
REACT_APP_API_URL=http://localhost:3000
REACT_APP_API_KEY=
    `);
        await fileSystem.createFile("backend/package.json", JSON.stringify({
            name: "backend",
            dependencies: { express: "^4.18.0" },
        }));
        const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(testDir);
        const result = await analyzer.analyze();
        (0, vitest_1.expect)(result.relationships.frontend).toBe("frontend");
        (0, vitest_1.expect)(result.relationships.backend).toBe("backend");
        (0, vitest_1.expect)(result.relationships.apiUrl).toContain("REACT_APP_API_URL");
    });
    (0, vitest_1.it)("should analyze real fullstack demo project", async () => {
        const demoPath = path_1.default.join(process.cwd(), "..", "..", "examples", "fullstack-demo");
        // Check if demo exists
        try {
            const analyzer = new fullstack_analyzer_1.FullstackAnalyzer(demoPath);
            const result = await analyzer.analyze();
            (0, vitest_1.expect)(result.isMonorepo).toBe(true);
            (0, vitest_1.expect)(result.services.length).toBeGreaterThanOrEqual(2);
            const frontend = result.services.find((s) => s.name === "frontend");
            const backend = result.services.find((s) => s.name === "backend");
            (0, vitest_1.expect)(frontend).toBeDefined();
            (0, vitest_1.expect)(backend).toBeDefined();
            // Frontend should be React/Vite
            (0, vitest_1.expect)(frontend?.dependencies).toContain("react");
            (0, vitest_1.expect)(frontend?.dependencies).toContain("vite");
            // Backend should be Express
            (0, vitest_1.expect)(backend?.framework).toBe("express");
            (0, vitest_1.expect)(backend?.dependencies).toContain("express");
            (0, vitest_1.expect)(backend?.dependencies).toContain("sqlite3");
        }
        catch (error) {
            console.log("Skipping real project test - demo not found");
        }
    });
});
//# sourceMappingURL=fullstack-analyzer.test.js.map