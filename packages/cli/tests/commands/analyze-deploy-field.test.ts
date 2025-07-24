import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastCliExecutor } from "../services/cli-executor-fast";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";

describe("analyze command - runtime.yaml deploy field", () => {
  let cli: FastCliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    cli = new FastCliExecutor();
    fileSystem = new RealFileSystem("analyze-deploy-field");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  it("should create runtime.yaml with deploy field", async () => {
    // Create a simple Express app
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "test-app",
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    await fileSystem.createFile(
      "index.js",
      `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000);
    `,
    );

    const result = await cli.execute(["analyze"], { cwd: testDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Runtime spec written to");

    // Check runtime.yaml exists and has deploy field
    const runtimePath = path.join(testDir, "runtime.yaml");
    const runtimeContent = await fs.readFile(runtimePath, "utf-8");
    const runtimeSpec = yaml.load(runtimeContent) as any;

    expect(runtimeSpec.deploy).toBeDefined();
    expect(runtimeSpec.deploy.strategy).toBe("rolling");
    expect(runtimeSpec.deploy.healthCheck).toBeDefined();
    expect(runtimeSpec.deploy.healthCheck.path).toBe("/health");
    expect(runtimeSpec.deploy.healthCheck.interval).toBe(30);
    expect(runtimeSpec.deploy.healthCheck.timeout).toBe(5);
    expect(runtimeSpec.deploy.healthCheck.retries).toBe(3);
  });

  it("should use framework-specific port in runtime.yaml", async () => {
    // Create a Flask app
    await fileSystem.createFile("requirements.txt", "flask==2.3.0\n");
    await fileSystem.createFile(
      "app.py",
      `
from flask import Flask
app = Flask(__name__)

@app.route('/health')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(port=5000)
    `,
    );

    const result = await cli.execute(["analyze"], { cwd: testDir });

    expect(result.code).toBe(0);

    const runtimePath = path.join(testDir, "runtime.yaml");
    const runtimeContent = await fs.readFile(runtimePath, "utf-8");
    const runtimeSpec = yaml.load(runtimeContent) as any;

    expect(runtimeSpec.framework).toBe("flask");
    expect(runtimeSpec.port).toBe(5000); // Flask default port
    expect(runtimeSpec.deploy).toBeDefined();
  });

  it("should work with yq to query deploy.strategy", async () => {
    // Create a simple app
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "test-app",
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    const result = await cli.execute(["analyze"], { cwd: testDir });

    expect(result.code).toBe(0);

    // Verify the YAML structure is valid for yq
    const runtimePath = path.join(testDir, "runtime.yaml");
    const runtimeContent = await fs.readFile(runtimePath, "utf-8");

    // Parse and check it's valid YAML
    const runtimeSpec = yaml.load(runtimeContent) as any;
    expect(runtimeSpec.deploy.strategy).toBe("rolling");

    // The output would be queryable with: yq '.deploy.strategy' runtime.yaml
    // Which would return: "rolling"
  });

  it("should include all required fields in runtime.yaml", async () => {
    // Create a Next.js app
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

    const result = await cli.execute(["analyze"], { cwd: testDir });

    expect(result.code).toBe(0);

    const runtimePath = path.join(testDir, "runtime.yaml");
    const runtimeContent = await fs.readFile(runtimePath, "utf-8");
    const runtimeSpec = yaml.load(runtimeContent) as any;

    // Check all fields are present
    expect(runtimeSpec.runtime).toBe("node");
    expect(runtimeSpec.framework).toBe("nextjs");
    expect(runtimeSpec.endpoints).toBeDefined();
    expect(runtimeSpec.port).toBe(3000);
    expect(runtimeSpec.build).toBe("npm run build");
    expect(runtimeSpec.start).toBe("npm start");
    expect(runtimeSpec.deploy).toBeDefined();
    expect(runtimeSpec.deploy.strategy).toBe("rolling");
    expect(runtimeSpec.deploy.healthCheck).toBeDefined();
  });
});
