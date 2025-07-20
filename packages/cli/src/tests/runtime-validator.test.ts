import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateRuntimeSpec, detectRuntime } from "../lib/runtime-validator";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("Runtime Validator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cygni-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  describe("validateRuntimeSpec", () => {
    it("should validate a correct runtime spec", async () => {
      const validSpec = `
version: "0.1"
name: node-20
detect: package.json
build:
  install: pnpm install
  command: pnpm build
run:
  start: node index.js
  port: 3000
health:
  path: /health
  interval: 30s
`;
      const specPath = path.join(tempDir, "runtime.yaml");
      await fs.writeFile(specPath, validSpec);

      const result = await validateRuntimeSpec(specPath);
      expect(result.valid).toBe(true);
      expect(result.spec?.name).toBe("node-20");
    });

    it("should fail on missing required fields", async () => {
      const invalidSpec = `
name: node-20
detect: package.json
`;
      const specPath = path.join(tempDir, "runtime.yaml");
      await fs.writeFile(specPath, invalidSpec);

      const result = await validateRuntimeSpec(specPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      // Check that at least one error mentions a missing field
      const hasRequiredError = result.errors!.some(e => 
        e.includes("Required") || e.includes("required") || e.includes("Expected")
      );
      expect(hasRequiredError).toBe(true);
    });

    it("should fail on invalid version", async () => {
      const invalidSpec = `
version: "0.2"
name: node-20
detect: package.json
build:
  install: pnpm install
run:
  start: node index.js
`;
      const specPath = path.join(tempDir, "runtime.yaml");
      await fs.writeFile(specPath, invalidSpec);

      const result = await validateRuntimeSpec(specPath);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes("version"))).toBe(true);
    });

    it("should fail on invalid YAML", async () => {
      const invalidYaml = `
version: "0.1"
name: node-20
  detect: package.json
    invalid indentation
`;
      const specPath = path.join(tempDir, "runtime.yaml");
      await fs.writeFile(specPath, invalidYaml);

      const result = await validateRuntimeSpec(specPath);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes("YAML parsing error"))).toBe(true);
    });
  });

  describe("detectRuntime", () => {
    it("should detect Node.js project", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-app", version: "1.0.0" })
      );

      const runtime = await detectRuntime(tempDir);
      expect(runtime).not.toBeNull();
      expect(runtime?.name).toBe("node-20");
    });

    it("should detect Next.js project", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ 
          name: "test-app", 
          version: "1.0.0",
          dependencies: { next: "14.0.0" }
        })
      );
      await fs.writeFile(path.join(tempDir, "next.config.js"), "module.exports = {}");

      const runtime = await detectRuntime(tempDir);
      expect(runtime).not.toBeNull();
      expect(runtime?.name).toBe("nextjs-14");
    });

    it("should prefer custom runtime.yaml over auto-detection", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-app", version: "1.0.0" })
      );

      const customSpec = `
version: "0.1"
name: custom-runtime
detect: package.json
build:
  install: npm install
run:
  start: npm start
  port: 8080
`;
      await fs.writeFile(path.join(tempDir, "runtime.yaml"), customSpec);

      const runtime = await detectRuntime(tempDir);
      expect(runtime).not.toBeNull();
      expect(runtime?.name).toBe("custom-runtime");
      expect(runtime?.run.port).toBe(8080);
    });

    it("should return null for unsupported project", async () => {
      await fs.writeFile(path.join(tempDir, "Gemfile"), "source 'https://rubygems.org'");

      const runtime = await detectRuntime(tempDir);
      expect(runtime).toBeNull();
    });
  });
});