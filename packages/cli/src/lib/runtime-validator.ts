import { z } from "zod";
import * as yaml from "js-yaml";
import { promises as fs } from "fs";
import path from "path";

// Runtime spec schema
const RuntimeSpecSchema = z.object({
  version: z.literal("0.1"),
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Name must be lowercase alphanumeric with hyphens"),
  detect: z.union([z.string(), z.array(z.string())]),
  build: z.object({
    install: z.string().optional(),
    command: z.string().optional(),
  }),
  run: z.object({
    start: z.string(),
    port: z.number().int().min(1).max(65535).default(3000),
  }),
  health: z
    .object({
      path: z.string().default("/health"),
      interval: z
        .string()
        .regex(/^\d+[sm]$/)
        .default("30s"),
      timeout: z
        .string()
        .regex(/^\d+[sm]$/)
        .default("10s"),
      retries: z.number().int().min(1).default(3),
    })
    .optional(),
  env: z.record(z.string()).optional(),
});

export type RuntimeSpec = z.infer<typeof RuntimeSpecSchema>;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  spec?: RuntimeSpec;
}

export async function validateRuntimeSpec(
  filePath: string,
): Promise<ValidationResult> {
  try {
    // Read file
    const content = await fs.readFile(filePath, "utf8");

    // Parse YAML
    const data = yaml.load(content);

    // Validate against schema
    const result = RuntimeSpecSchema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        spec: result.data,
      };
    } else {
      // Format Zod errors
      const errors = result.error.errors.map((err) => {
        const path = err.path.join(".");
        return path ? `${path}: ${err.message}` : err.message;
      });

      return {
        valid: false,
        errors,
      };
    }
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return {
        valid: false,
        errors: [`YAML parsing error: ${error.message}`],
      };
    }

    return {
      valid: false,
      errors: [
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

// Built-in runtime definitions
export const BUILTIN_RUNTIMES: Record<string, RuntimeSpec> = {
  "node-20": {
    version: "0.1",
    name: "node-20",
    detect: "package.json",
    build: {
      install: "pnpm install --prod",
      command: "pnpm build",
    },
    run: {
      start: "node dist/index.js",
      port: 3000,
    },
    health: {
      path: "/health",
      interval: "30s",
      timeout: "10s",
      retries: 3,
    },
  },
  "node-18": {
    version: "0.1",
    name: "node-18",
    detect: "package.json",
    build: {
      install: "pnpm install --prod",
      command: "pnpm build",
    },
    run: {
      start: "node dist/index.js",
      port: 3000,
    },
    health: {
      path: "/health",
      interval: "30s",
      timeout: "10s",
      retries: 3,
    },
  },
  "nextjs-14": {
    version: "0.1",
    name: "nextjs-14",
    detect: ["package.json", "next.config.js"],
    build: {
      install: "pnpm install",
      command: "pnpm build",
    },
    run: {
      start: "pnpm start",
      port: 3000,
    },
    health: {
      path: "/api/health",
      interval: "30s",
      timeout: "10s",
      retries: 3,
    },
    env: {
      NODE_ENV: "production",
    },
  },
};

// Auto-detect runtime based on project files
export async function detectRuntime(
  projectPath: string,
): Promise<RuntimeSpec | null> {
  // Check for custom runtime.yaml first
  const customRuntimePath = path.join(projectPath, "runtime.yaml");
  try {
    await fs.access(customRuntimePath);
    const result = await validateRuntimeSpec(customRuntimePath);
    if (result.valid && result.spec) {
      return result.spec;
    }
  } catch {
    // No custom runtime, continue with auto-detection
  }

  // Check built-in runtimes (check Next.js first since it's more specific)
  const runtimeOrder = ["nextjs-14", "node-20", "node-18"];

  for (const name of runtimeOrder) {
    const runtime = BUILTIN_RUNTIMES[name];
    if (!runtime) continue;

    const detectFiles = Array.isArray(runtime.detect)
      ? runtime.detect
      : [runtime.detect];
    const allExist = await Promise.all(
      detectFiles.map(async (file) => {
        try {
          await fs.access(path.join(projectPath, file));
          return true;
        } catch {
          return false;
        }
      }),
    );

    if (allExist.every((exists) => exists)) {
      // Special check for Next.js
      if (name === "nextjs-14") {
        try {
          const packageJson = JSON.parse(
            await fs.readFile(path.join(projectPath, "package.json"), "utf8"),
          );
          if (
            packageJson.dependencies?.next ||
            packageJson.devDependencies?.next
          ) {
            return runtime;
          }
        } catch {
          continue;
        }
      } else {
        return runtime;
      }
    }
  }

  return null;
}
