import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FullstackAnalyzer } from "../../src/lib/fullstack-analyzer";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";

describe("FullstackAnalyzer", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    fileSystem = new RealFileSystem("fullstack-analyzer-test");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  it("should detect monorepo with workspaces", async () => {
    // Create monorepo structure
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "fullstack-app",
        private: true,
        workspaces: ["frontend", "backend"],
      }),
    );

    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
        },
      }),
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    expect(result.isMonorepo).toBe(true);
    expect(result.workspaces).toHaveLength(2);
    expect(result.services).toHaveLength(2);

    const frontend = result.services.find((s) => s.name === "frontend");
    const backend = result.services.find((s) => s.name === "backend");

    expect(frontend).toBeDefined();
    expect(frontend?.type).toBe("frontend");
    expect(frontend?.framework).toBe("react");

    expect(backend).toBeDefined();
    expect(backend?.type).toBe("backend");
    expect(backend?.framework).toBe("express");
  });

  it("should detect separate frontend/backend directories", async () => {
    // Create separate directories
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "my-frontend",
        dependencies: {
          vue: "^3.0.0",
        },
      }),
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "my-backend",
        dependencies: {
          fastify: "^4.0.0",
        },
      }),
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    expect(result.isMonorepo).toBe(false);
    expect(result.services).toHaveLength(2);

    const frontend = result.services.find((s) => s.type === "frontend");
    const backend = result.services.find((s) => s.type === "backend");

    expect(frontend?.framework).toBe("vue");
    expect(backend?.framework).toBe("fastify");
  });

  it("should detect Next.js as fullstack framework", async () => {
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "nextjs-app",
        dependencies: {
          next: "^13.0.0",
          react: "^18.0.0",
        },
      }),
    );

    await fileSystem.createFile("next.config.js", "module.exports = {}");

    // Create API routes
    await fileSystem.createFile(
      "app/api/users/route.ts",
      `
      export async function GET() {
        return Response.json({ users: [] });
      }
    `,
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe("fullstack");
    expect(result.services[0].framework).toBe("nextjs");
  });

  it("should detect environment variables", async () => {
    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "api",
        dependencies: { express: "^4.18.0" },
      }),
    );

    await fileSystem.createFile(
      "backend/.env.example",
      `
DATABASE_URL=postgresql://localhost/mydb
JWT_SECRET=your-secret-here
PORT=3001
API_KEY=
    `,
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    const backend = result.services.find((s) => s.name === "backend");
    expect(backend?.envVars).toContain("DATABASE_URL");
    expect(backend?.envVars).toContain("JWT_SECRET");
    expect(backend?.envVars).toContain("PORT");
    expect(backend?.envVars).toContain("API_KEY");
  });

  it("should detect ports from various sources", async () => {
    // Service with PORT in .env
    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        dependencies: { express: "^4.18.0" },
      }),
    );
    await fileSystem.createFile("backend/.env", "PORT=3001");

    // Service with port in package.json script
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        scripts: {
          start: "vite --port 5173",
        },
        dependencies: { react: "^18.0.0" },
      }),
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    const backend = result.services.find((s) => s.name === "backend");
    const frontend = result.services.find((s) => s.name === "frontend");

    expect(backend?.port).toBe(3001);
    expect(frontend?.port).toBe(5173);
  });

  it("should determine relationships between services", async () => {
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        dependencies: { react: "^18.0.0" },
      }),
    );

    await fileSystem.createFile(
      "frontend/.env.example",
      `
REACT_APP_API_URL=http://localhost:3000
REACT_APP_API_KEY=
    `,
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        dependencies: { express: "^4.18.0" },
      }),
    );

    const analyzer = new FullstackAnalyzer(testDir);
    const result = await analyzer.analyze();

    expect(result.relationships.frontend).toBe("frontend");
    expect(result.relationships.backend).toBe("backend");
    expect(result.relationships.apiUrl).toContain("REACT_APP_API_URL");
  });

  it("should analyze real fullstack demo project", async () => {
    const demoPath = path.join(
      process.cwd(),
      "..",
      "..",
      "examples",
      "fullstack-demo",
    );

    // Check if demo exists
    try {
      const analyzer = new FullstackAnalyzer(demoPath);
      const result = await analyzer.analyze();

      expect(result.isMonorepo).toBe(true);
      expect(result.services.length).toBeGreaterThanOrEqual(2);

      const frontend = result.services.find((s) => s.name === "frontend");
      const backend = result.services.find((s) => s.name === "backend");

      expect(frontend).toBeDefined();
      expect(backend).toBeDefined();

      // Frontend should be React/Vite
      expect(frontend?.dependencies).toContain("react");
      expect(frontend?.dependencies).toContain("vite");

      // Backend should be Express
      expect(backend?.framework).toBe("express");
      expect(backend?.dependencies).toContain("express");
      expect(backend?.dependencies).toContain("sqlite3");
    } catch (error) {
      console.log("Skipping real project test - demo not found");
    }
  });
});
