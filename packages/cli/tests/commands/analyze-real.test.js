"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_fast_1 = require("../services/cli-executor-fast");
const real_file_system_1 = require("../services/real-file-system");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const js_yaml_1 = __importDefault(require("js-yaml"));
(0, vitest_1.describe)("analyze command - Real Implementation", () => {
    let cli;
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("analyze-command");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.describe)("Express API detection", () => {
        (0, vitest_1.beforeEach)(async () => {
            // Create Express app
            await fileSystem.createFile("package.json", JSON.stringify({
                name: "express-api",
                version: "1.0.0",
                dependencies: {
                    express: "^4.18.0",
                    jsonwebtoken: "^9.0.0",
                },
            }));
            await fileSystem.createFile("index.js", `
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());

// Public routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/auth/login', (req, res) => {
  const token = jwt.sign({ userId: 1 }, 'secret');
  res.json({ token });
});

// Protected routes
app.get('/api/users', authenticate, (req, res) => {
  res.json({ users: [] });
});

app.post('/api/users', authenticate, adminOnly, (req, res) => {
  res.status(201).json({ created: true });
});

function authenticate(req, res, next) {
  // JWT validation
  next();
}

function adminOnly(req, res, next) {
  // Admin check
  next();
}

app.listen(3000);
      `);
        });
        (0, vitest_1.it)("should detect endpoints with --explain flag", async () => {
            const result = await cli.execute(["analyze", "--explain"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Analysis complete!");
            (0, vitest_1.expect)(result.stdout).toContain("Found 4 endpoints in express application");
            (0, vitest_1.expect)(result.stdout).toContain("Framework: express");
            (0, vitest_1.expect)(result.stdout).toContain("Authentication: jwt");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /health");
            (0, vitest_1.expect)(result.stdout).toContain("POST    /auth/login");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/users [authenticate]");
            (0, vitest_1.expect)(result.stdout).toContain("POST    /api/users [authenticate, adminOnly]");
        });
        (0, vitest_1.it)("should generate OpenAPI spec", async () => {
            const outputPath = path_1.default.join(testDir, "openapi.json");
            const result = await cli.execute(["analyze", "--output", "openapi", "--file", outputPath], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Output written to");
            const openApiContent = await promises_1.default.readFile(outputPath, "utf-8");
            const openApiSpec = JSON.parse(openApiContent);
            (0, vitest_1.expect)(openApiSpec.openapi).toBe("3.0.0");
            (0, vitest_1.expect)(openApiSpec.info.description).toContain("4 endpoints");
            (0, vitest_1.expect)(openApiSpec.paths["/health"]).toBeDefined();
            (0, vitest_1.expect)(openApiSpec.paths["/auth/login"]).toBeDefined();
            (0, vitest_1.expect)(openApiSpec.paths["/api/users"]).toBeDefined();
            (0, vitest_1.expect)(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
        });
        (0, vitest_1.it)("should generate runtime.yaml", async () => {
            const result = await cli.execute(["analyze"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Runtime spec written to");
            const runtimePath = path_1.default.join(testDir, "runtime.yaml");
            const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
            const runtimeSpec = js_yaml_1.default.load(runtimeContent);
            (0, vitest_1.expect)(runtimeSpec.runtime).toBe("node");
            (0, vitest_1.expect)(runtimeSpec.framework).toBe("express");
            (0, vitest_1.expect)(runtimeSpec.endpoints).toBe(4);
            (0, vitest_1.expect)(runtimeSpec.port).toBe(3000);
            (0, vitest_1.expect)(runtimeSpec.start).toBe("node index.js");
        });
    });
    (0, vitest_1.describe)("Next.js API detection", () => {
        (0, vitest_1.beforeEach)(async () => {
            await fileSystem.createFile("package.json", JSON.stringify({
                name: "nextjs-app",
                dependencies: {
                    next: "^14.0.0",
                    react: "^18.0.0",
                },
            }));
            // App Router API
            await fileSystem.createDir("app/api/posts");
            await fileSystem.createFile("app/api/posts/route.ts", `
export async function GET() {
  return Response.json({ posts: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ created: true }, { status: 201 });
}
      `);
            await fileSystem.createDir("app/api/posts/[id]");
            await fileSystem.createFile("app/api/posts/[id]/route.ts", `
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}

export async function PUT(request: Request) {
  return Response.json({ updated: true });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
      `);
        });
        (0, vitest_1.it)("should detect Next.js App Router endpoints", async () => {
            const result = await cli.execute(["analyze", "--explain"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 5 endpoints in nextjs application");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/posts");
            (0, vitest_1.expect)(result.stdout).toContain("POST    /api/posts");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/posts/[id]");
            (0, vitest_1.expect)(result.stdout).toContain("PUT     /api/posts/[id]");
            (0, vitest_1.expect)(result.stdout).toContain("DELETE  /api/posts/[id]");
        });
        (0, vitest_1.it)("should generate correct runtime spec for Next.js", async () => {
            const result = await cli.execute(["analyze"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            const runtimePath = path_1.default.join(testDir, "runtime.yaml");
            const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
            const runtimeSpec = js_yaml_1.default.load(runtimeContent);
            (0, vitest_1.expect)(runtimeSpec.runtime).toBe("node");
            (0, vitest_1.expect)(runtimeSpec.framework).toBe("nextjs");
            (0, vitest_1.expect)(runtimeSpec.build).toBe("npm run build");
            (0, vitest_1.expect)(runtimeSpec.start).toBe("npm start");
        });
    });
    (0, vitest_1.describe)("Flask API detection", () => {
        (0, vitest_1.beforeEach)(async () => {
            await fileSystem.createFile("requirements.txt", `
flask==2.3.0
flask-cors==4.0.0
gunicorn==21.0.0
      `);
            await fileSystem.createFile("app.py", `
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/health')
def health():
    return jsonify({"status": "healthy"})

@app.route('/api/books', methods=['GET'])
def get_books():
    return jsonify({"books": []})

@app.route('/api/books', methods=['POST'])
def create_book():
    data = request.json
    return jsonify({"created": True}), 201

@app.route('/api/books/<int:id>', methods=['GET', 'PUT', 'DELETE'])
def book_detail(id):
    if request.method == 'GET':
        return jsonify({"id": id})
    elif request.method == 'PUT':
        return jsonify({"updated": True})
    else:  # DELETE
        return '', 204

if __name__ == '__main__':
    app.run(port=5000)
      `);
        });
        (0, vitest_1.it)("should detect Flask endpoints", async () => {
            const result = await cli.execute(["analyze", "--explain"], {
                cwd: testDir,
            });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 6 endpoints in flask application");
            (0, vitest_1.expect)(result.stdout).toContain("Framework: flask");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/health");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/books");
            (0, vitest_1.expect)(result.stdout).toContain("POST    /api/books");
            (0, vitest_1.expect)(result.stdout).toContain("GET     /api/books/<int:id>");
            (0, vitest_1.expect)(result.stdout).toContain("PUT     /api/books/<int:id>");
            (0, vitest_1.expect)(result.stdout).toContain("DELETE  /api/books/<int:id>");
        });
        (0, vitest_1.it)("should generate correct runtime spec for Flask", async () => {
            const result = await cli.execute(["analyze"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            const runtimePath = path_1.default.join(testDir, "runtime.yaml");
            const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
            const runtimeSpec = js_yaml_1.default.load(runtimeContent);
            (0, vitest_1.expect)(runtimeSpec.runtime).toBe("python");
            (0, vitest_1.expect)(runtimeSpec.framework).toBe("flask");
            (0, vitest_1.expect)(runtimeSpec.start).toBe("gunicorn app:app");
        });
    });
    (0, vitest_1.describe)("Output formats", () => {
        (0, vitest_1.beforeEach)(async () => {
            await fileSystem.createFile("package.json", JSON.stringify({
                name: "test-api",
                dependencies: { express: "^4.18.0" },
            }));
            await fileSystem.createFile("index.js", `
const express = require('express');
const app = express();
app.get('/test', (req, res) => res.json({ ok: true }));
app.listen(3000);
      `);
        });
        (0, vitest_1.it)("should output JSON format by default", async () => {
            const result = await cli.execute(["analyze"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            // Find the JSON output in stdout
            const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
            (0, vitest_1.expect)(jsonMatch).toBeTruthy();
            const output = JSON.parse(jsonMatch[0]);
            (0, vitest_1.expect)(output.framework).toBe("express");
            (0, vitest_1.expect)(output.endpoints).toHaveLength(1);
        });
        (0, vitest_1.it)("should output YAML format", async () => {
            const outputPath = path_1.default.join(testDir, "analysis.yaml");
            const result = await cli.execute(["analyze", "--output", "yaml", "--file", outputPath], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            const yamlContent = await promises_1.default.readFile(outputPath, "utf-8");
            const output = js_yaml_1.default.load(yamlContent);
            (0, vitest_1.expect)(output.framework).toBe("express");
            (0, vitest_1.expect)(output.endpoints).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)("Error handling", () => {
        (0, vitest_1.it)("should handle missing package.json gracefully", async () => {
            const result = await cli.execute(["analyze"], { cwd: testDir });
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stdout).toContain("Found 0 endpoints in unknown application");
        });
        (0, vitest_1.it)("should handle invalid JavaScript files", async () => {
            await fileSystem.createFile("package.json", JSON.stringify({
                dependencies: { express: "^4.18.0" },
            }));
            await fileSystem.createFile("broken.js", `
const express = require('express');
const app = express();
app.get('/test', (req, res) => { // Missing closing brace
      `);
            const result = await cli.execute(["analyze"], { cwd: testDir });
            // Should still succeed but skip the broken file
            (0, vitest_1.expect)(result.code).toBe(0);
            (0, vitest_1.expect)(result.stderr).toContain("Error parsing broken.js");
        });
    });
});
//# sourceMappingURL=analyze-real.test.js.map