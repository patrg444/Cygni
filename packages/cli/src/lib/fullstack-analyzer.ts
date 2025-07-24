/**
 * Fullstack Project Analyzer
 * Detects and analyzes multiple services (frontend/backend) in a project
 */

import fs from "fs/promises";
import { accessSync } from "fs";
import path from "path";
import { glob } from "glob";
import { ApiAnalyzer, ApiAnalysisResult } from "./api-analyzer";
import { detectFramework } from "../utils/framework-detector";

/**
 * Information about a single service detected in the project.
 * @interface ServiceInfo
 */
export interface ServiceInfo {
  /** Service name (usually directory name) */
  name: string;
  /** Type of service based on framework and purpose */
  type: "frontend" | "backend" | "fullstack";
  /** Detected framework (e.g., nextjs, express, django) */
  framework: string;
  /** Absolute path to the service directory */
  path: string;
  /** Default port if detected from configuration */
  port?: number;
  /** Build command for production builds */
  buildCommand?: string;
  /** Start command for development/production */
  startCommand?: string;
  /** API analysis results if this is a backend service */
  apiAnalysis?: ApiAnalysisResult;
  /** List of other services this service depends on */
  dependencies?: string[];
  /** Environment variables required by the service */
  envVars?: string[];
  /** Whether this is a deployable application (has start/serve script) */
  isDeployable?: boolean;
}

/**
 * Complete analysis result for a fullstack project.
 * @interface FullstackAnalysisResult
 */
export interface FullstackAnalysisResult {
  /** List of all services detected in the project */
  services: ServiceInfo[];
  /** Whether this is a monorepo structure */
  isMonorepo: boolean;
  /** Workspace paths if monorepo */
  workspaces?: string[];
  /** Detected package manager (npm, yarn, pnpm) */
  packageManager: "npm" | "yarn" | "pnpm";
  /** Detected monorepo tool if any */
  monorepoTool?:
    | "turbo"
    | "nx"
    | "lerna"
    | "rush"
    | "yarn-workspaces"
    | "pnpm-workspaces";
  /** Relationships between services */
  relationships: {
    /** Name of the frontend service */
    frontend?: string;
    /** Name of the backend service */
    backend?: string;
    /** API URL that frontend should use to connect to backend */
    apiUrl?: string;
  };
}

/**
 * Analyzes fullstack projects to detect multiple services and their relationships.
 * Supports monorepos, separate frontend/backend directories, and single fullstack frameworks.
 *
 * @example
 * ```typescript
 * const analyzer = new FullstackAnalyzer('/path/to/project');
 * const result = await analyzer.analyze();
 *
 * console.log(`Found ${result.services.length} services`);
 * if (result.relationships.frontend && result.relationships.backend) {
 *   console.log('This is a fullstack project');
 * }
 * ```
 *
 * @class FullstackAnalyzer
 */
export class FullstackAnalyzer {
  private projectDir: string;

  /**
   * Creates a new FullstackAnalyzer instance.
   * @param {string} projectDir - The project directory to analyze (defaults to current working directory)
   */
  constructor(projectDir: string = process.cwd()) {
    this.projectDir = projectDir;
  }

  /**
   * Analyzes the project structure to detect all services.
   * Detects monorepos, separate service directories, and fullstack frameworks.
   *
   * @returns {Promise<FullstackAnalysisResult>} Complete analysis of the fullstack project
   * @throws {Error} If the project structure cannot be analyzed
   */
  async analyze(): Promise<FullstackAnalysisResult> {
    // Detect package manager
    const packageManager = await this.detectPackageManager();

    // Detect monorepo tool
    const monorepoTool = await this.detectMonorepoTool();

    // Check if it's a monorepo
    const { isMonorepo, workspaces } = await this.detectMonorepo();

    const services: ServiceInfo[] = [];

    if (isMonorepo && workspaces) {
      // Analyze each workspace
      for (const workspace of workspaces) {
        const service = await this.analyzeService(workspace, packageManager);
        if (service) {
          services.push(service);
        }
      }
    } else {
      // Check for separate frontend/backend directories
      const possibleServices = [
        "frontend",
        "client",
        "web",
        "backend",
        "api",
        "server",
      ];

      for (const serviceName of possibleServices) {
        const servicePath = path.join(this.projectDir, serviceName);
        if (await this.exists(servicePath)) {
          const service = await this.analyzeService(
            servicePath,
            packageManager,
          );
          if (service) {
            services.push(service);
          }
        }
      }

      // If no separate services found, analyze root as single service
      if (services.length === 0) {
        const rootService = await this.analyzeService(
          this.projectDir,
          packageManager,
        );
        if (rootService) {
          services.push(rootService);
        }
      }
    }

    // Determine relationships
    const relationships = this.determineRelationships(services);

    return {
      services,
      isMonorepo,
      workspaces,
      packageManager,
      monorepoTool,
      relationships,
    };
  }

  /**
   * Detects if the project is a monorepo and finds all workspaces.
   * Supports npm/yarn workspaces and Lerna configurations.
   *
   * @private
   * @returns {Promise<{isMonorepo: boolean; workspaces?: string[]}>} Monorepo detection result
   */
  private async detectMonorepo(): Promise<{
    isMonorepo: boolean;
    workspaces?: string[];
  }> {
    try {
      const packageJsonPath = path.join(this.projectDir, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      if (packageJson.workspaces) {
        // Handle array or object format
        const workspaces = Array.isArray(packageJson.workspaces)
          ? packageJson.workspaces
          : packageJson.workspaces.packages || [];

        // Resolve workspace paths
        const resolvedWorkspaces: string[] = [];
        for (const workspace of workspaces) {
          if (workspace.includes("*")) {
            // Handle glob patterns
            const matches = await glob(workspace, { cwd: this.projectDir });
            resolvedWorkspaces.push(
              ...matches.map((m) => path.join(this.projectDir, m)),
            );
          } else {
            resolvedWorkspaces.push(path.join(this.projectDir, workspace));
          }
        }

        return { isMonorepo: true, workspaces: resolvedWorkspaces };
      }

      // Check for lerna.json
      const lernaPath = path.join(this.projectDir, "lerna.json");
      if (await this.exists(lernaPath)) {
        const lernaConfig = JSON.parse(await fs.readFile(lernaPath, "utf-8"));
        const packages = lernaConfig.packages || ["packages/*"];
        const resolvedPackages: string[] = [];

        for (const pkg of packages) {
          const matches = await glob(pkg, { cwd: this.projectDir });
          resolvedPackages.push(
            ...matches.map((m) => path.join(this.projectDir, m)),
          );
        }

        return { isMonorepo: true, workspaces: resolvedPackages };
      }
    } catch (error) {
      // Not a monorepo
    }

    return { isMonorepo: false };
  }

  /**
   * Analyzes a single service directory to extract its configuration.
   * Detects framework, build commands, and dependencies.
   *
   * @private
   * @param {string} servicePath - Path to the service directory
   * @returns {Promise<ServiceInfo | null>} Service information or null if not a valid service
   */
  private async analyzeService(
    servicePath: string,
    packageManager: "npm" | "yarn" | "pnpm" = "npm",
  ): Promise<ServiceInfo | null> {
    try {
      const framework = await detectFramework(servicePath);
      if (!framework) return null;

      const serviceName = path.basename(servicePath);
      const type = this.determineServiceType(framework, servicePath);

      const service: ServiceInfo = {
        name: serviceName,
        type,
        framework,
        path: servicePath,
      };

      // Get package.json info
      const packageJsonPath = path.join(servicePath, "package.json");
      if (await this.exists(packageJsonPath)) {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8"),
        );

        // Extract build and start commands with correct package manager
        if (packageJson.scripts) {
          const runCommand =
            packageManager === "npm" ? "npm run" : packageManager;

          if (packageJson.scripts.build) {
            service.buildCommand = `${runCommand} build`;
          }

          if (packageJson.scripts.start) {
            service.startCommand = `${runCommand} start`;
          } else if (packageJson.scripts.serve) {
            service.startCommand = `${runCommand} serve`;
          } else if (packageJson.scripts.dev) {
            service.startCommand = `${runCommand} dev`;
          }

          // Determine if this is a deployable application
          service.isDeployable = !!(
            packageJson.scripts.start || packageJson.scripts.serve
          );
        } else {
          service.isDeployable = false;
        }

        // Extract dependencies
        service.dependencies = Object.keys({
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        });
      }

      // Look for environment variables
      service.envVars = await this.detectEnvVars(servicePath);

      // If it's a backend service, run API analysis
      if (type === "backend" || type === "fullstack") {
        const apiAnalyzer = new ApiAnalyzer(servicePath);
        service.apiAnalysis = await apiAnalyzer.analyze();
      }

      // Detect port
      service.port = await this.detectPort(servicePath, framework || "unknown");

      return service;
    } catch (error) {
      console.error(`Failed to analyze service at ${servicePath}:`, error);
      return null;
    }
  }

  /**
   * Determines the type of service based on framework and directory structure.
   *
   * @private
   * @param {string} framework - The detected framework
   * @param {string} servicePath - Path to the service
   * @returns {"frontend" | "backend" | "fullstack"} The service type
   */
  private determineServiceType(
    framework: string,
    servicePath: string,
  ): "frontend" | "backend" | "fullstack" {
    const frontendFrameworks = [
      "react",
      "vue",
      "angular",
      "svelte",
      "nextjs",
      "nuxt",
      "gatsby",
    ];
    const backendFrameworks = [
      "express",
      "fastify",
      "nestjs",
      "django",
      "flask",
      "rails",
      "fastapi",
    ];

    if (frontendFrameworks.includes(framework)) {
      // Check if it's actually a fullstack framework like Next.js with API routes
      if (framework === "nextjs") {
        const apiDir = path.join(servicePath, "pages", "api");
        const appApiDir = path.join(servicePath, "app", "api");
        if (this.existsSync(apiDir) || this.existsSync(appApiDir)) {
          return "fullstack";
        }
      }
      return "frontend";
    }

    if (backendFrameworks.includes(framework)) {
      return "backend";
    }

    return "backend"; // Default to backend if unknown
  }

  /**
   * Detects the port number a service will run on.
   * Checks environment files, package.json scripts, and framework defaults.
   *
   * @private
   * @param {string} servicePath - Path to the service
   * @param {string} framework - The service framework
   * @returns {Promise<number | undefined>} The detected port or undefined
   */
  private async detectPort(
    servicePath: string,
    framework: string,
  ): Promise<number | undefined> {
    // Framework defaults
    const frameworkPorts: Record<string, number> = {
      express: 3000,
      fastify: 3000,
      nextjs: 3000,
      react: 3000,
      vue: 3000,
      angular: 4200,
      django: 8000,
      flask: 5000,
      rails: 3000,
      fastapi: 8000,
    };

    // Check for PORT in .env files
    const envFiles = [".env", ".env.local", ".env.development"];
    for (const envFile of envFiles) {
      const envPath = path.join(servicePath, envFile);
      if (await this.exists(envPath)) {
        const content = await fs.readFile(envPath, "utf-8");
        const portMatch = content.match(/^PORT=(\d+)/m);
        if (portMatch) {
          return parseInt(portMatch[1]!);
        }
      }
    }

    // Check for port in package.json scripts
    const packageJsonPath = path.join(servicePath, "package.json");
    if (await this.exists(packageJsonPath)) {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );
      const scripts = packageJson.scripts || {};

      for (const script of Object.values(scripts)) {
        if (typeof script === "string") {
          const portMatch = script.match(/--port[= ](\d+)|PORT=(\d+)/);
          if (portMatch) {
            return parseInt(portMatch[1] || portMatch[2]!);
          }
        }
      }
    }

    return frameworkPorts[framework] || 3000;
  }

  /**
   * Detects environment variables used by a service.
   * Scans .env.example and similar files for variable definitions.
   *
   * @private
   * @param {string} servicePath - Path to the service
   * @returns {Promise<string[]>} List of environment variable names
   */
  private async detectEnvVars(servicePath: string): Promise<string[]> {
    const envVars = new Set<string>();

    // Check .env.example files
    const envExampleFiles = [".env.example", ".env.sample", ".env.template"];
    for (const envFile of envExampleFiles) {
      const envPath = path.join(servicePath, envFile);
      if (await this.exists(envPath)) {
        const content = await fs.readFile(envPath, "utf-8");
        const matches = content.match(/^([A-Z_][A-Z0-9_]*)=/gm);
        if (matches) {
          matches.forEach((match) => {
            const varName = match.replace("=", "");
            envVars.add(varName);
          });
        }
      }
    }

    return Array.from(envVars);
  }

  /**
   * Determines relationships between services.
   * Identifies which service is frontend, backend, and the API URL pattern.
   *
   * @private
   * @param {ServiceInfo[]} services - List of detected services
   * @returns {FullstackAnalysisResult["relationships"]} Service relationships
   */
  private determineRelationships(
    services: ServiceInfo[],
  ): FullstackAnalysisResult["relationships"] {
    const frontend = services.find(
      (s) => s.type === "frontend" || s.type === "fullstack",
    );
    const backend = services.find(
      (s) => s.type === "backend" || (s.type === "fullstack" && s !== frontend),
    );

    let apiUrl: string | undefined;

    if (backend && backend.port) {
      apiUrl = `http://localhost:${backend.port}`;

      // Check if frontend has API URL configuration
      if (frontend) {
        const envVarPrefixes = [
          "REACT_APP_",
          "VITE_",
          "NEXT_PUBLIC_",
          "VUE_APP_",
        ];
        const apiEnvVars = frontend.envVars?.filter(
          (v) =>
            envVarPrefixes.some((prefix) => v.startsWith(prefix)) &&
            v.includes("API"),
        );

        if (apiEnvVars && apiEnvVars.length > 0) {
          // Frontend expects API URL in environment variable
          apiUrl = `process.env.${apiEnvVars[0]}`;
        }
      }
    }

    return {
      frontend: frontend?.name,
      backend: backend?.name,
      apiUrl,
    };
  }

  /**
   * Asynchronously checks if a file or directory exists.
   *
   * @private
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>} True if the path exists
   */
  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synchronously checks if a file or directory exists.
   *
   * @private
   * @param {string} filePath - Path to check
   * @returns {boolean} True if the path exists
   */
  private existsSync(filePath: string): boolean {
    try {
      accessSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detects the package manager used in the project.
   * Checks for lock files to determine npm, yarn, or pnpm.
   *
   * @private
   * @returns {Promise<'npm' | 'yarn' | 'pnpm'>} The detected package manager
   */
  private async detectPackageManager(): Promise<"npm" | "yarn" | "pnpm"> {
    // Check for yarn.lock
    if (await this.exists(path.join(this.projectDir, "yarn.lock"))) {
      return "yarn";
    }

    // Check for pnpm-lock.yaml
    if (await this.exists(path.join(this.projectDir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }

    // Default to npm (package-lock.json or no lock file)
    return "npm";
  }

  /**
   * Detects the monorepo tool used in the project.
   * Checks package.json for common monorepo tool dependencies.
   *
   * @private
   * @returns {Promise<'turbo' | 'nx' | 'lerna' | 'rush' | 'yarn-workspaces' | 'pnpm-workspaces' | undefined>}
   */
  private async detectMonorepoTool(): Promise<
    | "turbo"
    | "nx"
    | "lerna"
    | "rush"
    | "yarn-workspaces"
    | "pnpm-workspaces"
    | undefined
  > {
    const packageJsonPath = path.join(this.projectDir, "package.json");

    if (!(await this.exists(packageJsonPath))) {
      return undefined;
    }

    try {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );

      // Check for turbo
      if (
        packageJson.devDependencies?.turbo ||
        packageJson.dependencies?.turbo
      ) {
        return "turbo";
      }

      // Check for nx
      if (
        packageJson.devDependencies?.nx ||
        packageJson.dependencies?.nx ||
        packageJson.devDependencies?.["@nrwl/workspace"]
      ) {
        return "nx";
      }

      // Check for lerna
      if (
        packageJson.devDependencies?.lerna ||
        packageJson.dependencies?.lerna
      ) {
        return "lerna";
      }

      // Check for rush
      if (await this.exists(path.join(this.projectDir, "rush.json"))) {
        return "rush";
      }

      // Check for yarn workspaces
      if (
        packageJson.workspaces &&
        (await this.exists(path.join(this.projectDir, "yarn.lock")))
      ) {
        return "yarn-workspaces";
      }

      // Check for pnpm workspaces
      if (
        await this.exists(path.join(this.projectDir, "pnpm-workspace.yaml"))
      ) {
        return "pnpm-workspaces";
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}
