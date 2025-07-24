import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastCliExecutor } from "../services/cli-executor-fast";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";

describe("analyze command - Real Implementation", () => {
  let cli: FastCliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    cli = new FastCliExecutor();
    fileSystem = new RealFileSystem("analyze-command");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("Express API detection", () => {
    beforeEach(async () => {
      // Create Express app
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "express-api",
          version: "1.0.0",
          dependencies: {
            express: "^4.18.0",
            jsonwebtoken: "^9.0.0",
          },
        }),
      );

      await fileSystem.createFile(
        "index.js",
        `
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
      `,
      );
    });

    it("should detect endpoints with --explain flag", async () => {
      const result = await cli.execute(["analyze", "--explain"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Analysis complete!");
      expect(result.stdout).toContain(
        "Found 4 endpoints in express application",
      );
      expect(result.stdout).toContain("Framework: express");
      expect(result.stdout).toContain("Authentication: jwt");
      expect(result.stdout).toContain("GET     /health");
      expect(result.stdout).toContain("POST    /auth/login");
      expect(result.stdout).toContain("GET     /api/users [authenticate]");
      expect(result.stdout).toContain(
        "POST    /api/users [authenticate, adminOnly]",
      );
    });

    it("should generate OpenAPI spec", async () => {
      const outputPath = path.join(testDir, "openapi.json");

      const result = await cli.execute(
        ["analyze", "--output", "openapi", "--file", outputPath],
        { cwd: testDir },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Output written to");

      const openApiContent = await fs.readFile(outputPath, "utf-8");
      const openApiSpec = JSON.parse(openApiContent);

      expect(openApiSpec.openapi).toBe("3.0.0");
      expect(openApiSpec.info.description).toContain("4 endpoints");
      expect(openApiSpec.paths["/health"]).toBeDefined();
      expect(openApiSpec.paths["/auth/login"]).toBeDefined();
      expect(openApiSpec.paths["/api/users"]).toBeDefined();
      expect(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
    });

    it("should generate runtime.yaml", async () => {
      const result = await cli.execute(["analyze"], { cwd: testDir });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Runtime spec written to");

      const runtimePath = path.join(testDir, "runtime.yaml");
      const runtimeContent = await fs.readFile(runtimePath, "utf-8");
      const runtimeSpec = yaml.load(runtimeContent) as any;

      expect(runtimeSpec.runtime).toBe("node");
      expect(runtimeSpec.framework).toBe("express");
      expect(runtimeSpec.endpoints).toBe(4);
      expect(runtimeSpec.port).toBe(3000);
      expect(runtimeSpec.start).toBe("node index.js");
    });
  });

  describe("Next.js API detection", () => {
    beforeEach(async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "nextjs-app",
          dependencies: {
            next: "^14.0.0",
            react: "^18.0.0",
          },
        }),
      );

      // App Router API
      await fileSystem.createDir("app/api/posts");
      await fileSystem.createFile(
        "app/api/posts/route.ts",
        `
export async function GET() {
  return Response.json({ posts: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ created: true }, { status: 201 });
}
      `,
      );

      await fileSystem.createDir("app/api/posts/[id]");
      await fileSystem.createFile(
        "app/api/posts/[id]/route.ts",
        `
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}

export async function PUT(request: Request) {
  return Response.json({ updated: true });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
      `,
      );
    });

    it("should detect Next.js App Router endpoints", async () => {
      const result = await cli.execute(["analyze", "--explain"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Found 5 endpoints in nextjs application",
      );
      expect(result.stdout).toContain("GET     /api/posts");
      expect(result.stdout).toContain("POST    /api/posts");
      expect(result.stdout).toContain("GET     /api/posts/[id]");
      expect(result.stdout).toContain("PUT     /api/posts/[id]");
      expect(result.stdout).toContain("DELETE  /api/posts/[id]");
    });

    it("should generate correct runtime spec for Next.js", async () => {
      const result = await cli.execute(["analyze"], { cwd: testDir });

      expect(result.code).toBe(0);

      const runtimePath = path.join(testDir, "runtime.yaml");
      const runtimeContent = await fs.readFile(runtimePath, "utf-8");
      const runtimeSpec = yaml.load(runtimeContent) as any;

      expect(runtimeSpec.runtime).toBe("node");
      expect(runtimeSpec.framework).toBe("nextjs");
      expect(runtimeSpec.build).toBe("npm run build");
      expect(runtimeSpec.start).toBe("npm start");
    });
  });

  describe("Flask API detection", () => {
    beforeEach(async () => {
      await fileSystem.createFile(
        "requirements.txt",
        `
flask==2.3.0
flask-cors==4.0.0
gunicorn==21.0.0
      `,
      );

      await fileSystem.createFile(
        "app.py",
        `
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
      `,
      );
    });

    it("should detect Flask endpoints", async () => {
      const result = await cli.execute(["analyze", "--explain"], {
        cwd: testDir,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Found 6 endpoints in flask application");
      expect(result.stdout).toContain("Framework: flask");
      expect(result.stdout).toContain("GET     /api/health");
      expect(result.stdout).toContain("GET     /api/books");
      expect(result.stdout).toContain("POST    /api/books");
      expect(result.stdout).toContain("GET     /api/books/<int:id>");
      expect(result.stdout).toContain("PUT     /api/books/<int:id>");
      expect(result.stdout).toContain("DELETE  /api/books/<int:id>");
    });

    it("should generate correct runtime spec for Flask", async () => {
      const result = await cli.execute(["analyze"], { cwd: testDir });

      expect(result.code).toBe(0);

      const runtimePath = path.join(testDir, "runtime.yaml");
      const runtimeContent = await fs.readFile(runtimePath, "utf-8");
      const runtimeSpec = yaml.load(runtimeContent) as any;

      expect(runtimeSpec.runtime).toBe("python");
      expect(runtimeSpec.framework).toBe("flask");
      expect(runtimeSpec.start).toBe("gunicorn app:app");
    });
  });

  describe("Output formats", () => {
    beforeEach(async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "test-api",
          dependencies: { express: "^4.18.0" },
        }),
      );

      await fileSystem.createFile(
        "index.js",
        `
const express = require('express');
const app = express();
app.get('/test', (req, res) => res.json({ ok: true }));
app.listen(3000);
      `,
      );
    });

    it("should output JSON format by default", async () => {
      const result = await cli.execute(["analyze"], { cwd: testDir });

      expect(result.code).toBe(0);

      // Find the JSON output in stdout
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();

      const output = JSON.parse(jsonMatch![0]);
      expect(output.framework).toBe("express");
      expect(output.endpoints).toHaveLength(1);
    });

    it("should output YAML format", async () => {
      const outputPath = path.join(testDir, "analysis.yaml");

      const result = await cli.execute(
        ["analyze", "--output", "yaml", "--file", outputPath],
        { cwd: testDir },
      );

      expect(result.code).toBe(0);

      const yamlContent = await fs.readFile(outputPath, "utf-8");
      const output = yaml.load(yamlContent) as any;

      expect(output.framework).toBe("express");
      expect(output.endpoints).toHaveLength(1);
    });
  });

  describe("Error handling", () => {
    it("should handle missing package.json gracefully", async () => {
      const result = await cli.execute(["analyze"], { cwd: testDir });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Found 0 endpoints in unknown application",
      );
    });

    it("should handle invalid JavaScript files", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          dependencies: { express: "^4.18.0" },
        }),
      );

      await fileSystem.createFile(
        "broken.js",
        `
const express = require('express');
const app = express();
app.get('/test', (req, res) => { // Missing closing brace
      `,
      );

      const result = await cli.execute(["analyze"], { cwd: testDir });

      // Should still succeed but skip the broken file
      expect(result.code).toBe(0);
      expect(result.stderr).toContain("Error parsing broken.js");
    });
  });
});
