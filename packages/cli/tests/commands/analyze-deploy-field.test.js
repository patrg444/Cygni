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
(0, vitest_1.describe)("analyze command - runtime.yaml deploy field", () => {
    let cli;
    let fileSystem;
    let testDir;
    (0, vitest_1.beforeEach)(async () => {
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("analyze-deploy-field");
        testDir = await fileSystem.createTestDir();
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.it)("should create runtime.yaml with deploy field", async () => {
        // Create a simple Express app
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "test-app",
            dependencies: {
                express: "^4.18.0",
            },
        }));
        await fileSystem.createFile("index.js", `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000);
    `);
        const result = await cli.execute(["analyze"], { cwd: testDir });
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Runtime spec written to");
        // Check runtime.yaml exists and has deploy field
        const runtimePath = path_1.default.join(testDir, "runtime.yaml");
        const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
        const runtimeSpec = js_yaml_1.default.load(runtimeContent);
        (0, vitest_1.expect)(runtimeSpec.deploy).toBeDefined();
        (0, vitest_1.expect)(runtimeSpec.deploy.strategy).toBe("rolling");
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck).toBeDefined();
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck.path).toBe("/health");
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck.interval).toBe(30);
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck.timeout).toBe(5);
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck.retries).toBe(3);
    });
    (0, vitest_1.it)("should use framework-specific port in runtime.yaml", async () => {
        // Create a Flask app
        await fileSystem.createFile("requirements.txt", "flask==2.3.0\n");
        await fileSystem.createFile("app.py", `
from flask import Flask
app = Flask(__name__)

@app.route('/health')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(port=5000)
    `);
        const result = await cli.execute(["analyze"], { cwd: testDir });
        (0, vitest_1.expect)(result.code).toBe(0);
        const runtimePath = path_1.default.join(testDir, "runtime.yaml");
        const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
        const runtimeSpec = js_yaml_1.default.load(runtimeContent);
        (0, vitest_1.expect)(runtimeSpec.framework).toBe("flask");
        (0, vitest_1.expect)(runtimeSpec.port).toBe(5000); // Flask default port
        (0, vitest_1.expect)(runtimeSpec.deploy).toBeDefined();
    });
    (0, vitest_1.it)("should work with yq to query deploy.strategy", async () => {
        // Create a simple app
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "test-app",
            dependencies: {
                express: "^4.18.0",
            },
        }));
        const result = await cli.execute(["analyze"], { cwd: testDir });
        (0, vitest_1.expect)(result.code).toBe(0);
        // Verify the YAML structure is valid for yq
        const runtimePath = path_1.default.join(testDir, "runtime.yaml");
        const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
        // Parse and check it's valid YAML
        const runtimeSpec = js_yaml_1.default.load(runtimeContent);
        (0, vitest_1.expect)(runtimeSpec.deploy.strategy).toBe("rolling");
        // The output would be queryable with: yq '.deploy.strategy' runtime.yaml
        // Which would return: "rolling"
    });
    (0, vitest_1.it)("should include all required fields in runtime.yaml", async () => {
        // Create a Next.js app
        await fileSystem.createFile("package.json", JSON.stringify({
            name: "nextjs-app",
            dependencies: {
                next: "^13.0.0",
                react: "^18.0.0",
            },
        }));
        await fileSystem.createFile("next.config.js", "module.exports = {}");
        const result = await cli.execute(["analyze"], { cwd: testDir });
        (0, vitest_1.expect)(result.code).toBe(0);
        const runtimePath = path_1.default.join(testDir, "runtime.yaml");
        const runtimeContent = await promises_1.default.readFile(runtimePath, "utf-8");
        const runtimeSpec = js_yaml_1.default.load(runtimeContent);
        // Check all fields are present
        (0, vitest_1.expect)(runtimeSpec.runtime).toBe("node");
        (0, vitest_1.expect)(runtimeSpec.framework).toBe("nextjs");
        (0, vitest_1.expect)(runtimeSpec.endpoints).toBeDefined();
        (0, vitest_1.expect)(runtimeSpec.port).toBe(3000);
        (0, vitest_1.expect)(runtimeSpec.build).toBe("npm run build");
        (0, vitest_1.expect)(runtimeSpec.start).toBe("npm start");
        (0, vitest_1.expect)(runtimeSpec.deploy).toBeDefined();
        (0, vitest_1.expect)(runtimeSpec.deploy.strategy).toBe("rolling");
        (0, vitest_1.expect)(runtimeSpec.deploy.healthCheck).toBeDefined();
    });
});
//# sourceMappingURL=analyze-deploy-field.test.js.map