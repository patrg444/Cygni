/**
 * Multi-Service Builder
 * Handles building multiple services with dependency management
 */

import execa from "execa";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs/promises";
import { ServiceInfo } from "./fullstack-analyzer";

/**
 * Options for building services.
 * @interface BuildOptions
 */
export interface BuildOptions {
  /** Whether to build services in parallel (not yet implemented) */
  parallel?: boolean;
  /** Environment variables to inject during build */
  injectEnv?: Record<string, string>;
  /** Skip running tests during build */
  skipTests?: boolean;
}

/**
 * Result of building a single service.
 * @interface BuildResult
 */
export interface BuildResult {
  /** Name of the service that was built */
  service: string;
  /** Whether the build succeeded */
  success: boolean;
  /** Build duration in milliseconds */
  duration: number;
  /** Error message if build failed */
  error?: string;
  /** List of build artifacts produced */
  artifacts?: string[];
}

/**
 * Builds multiple services in a project with proper ordering and dependency management.
 * Handles environment variable injection for frontend services to connect to backend APIs.
 *
 * @example
 * ```typescript
 * const builder = new MultiServiceBuilder(services);
 * const results = await builder.build({
 *   injectEnv: { API_URL: 'http://localhost:3001' }
 * });
 *
 * results.forEach(result => {
 *   if (result.success) {
 *     console.log(`${result.service} built in ${result.duration}ms`);
 *   }
 * });
 * ```
 *
 * @class MultiServiceBuilder
 */
export class MultiServiceBuilder {
  private services: ServiceInfo[];
  private buildOrder: ServiceInfo[];

  /**
   * Creates a new MultiServiceBuilder instance.
   * @param {ServiceInfo[]} services - List of services to build
   * @param {string} packageManager - Package manager to use (npm, yarn, pnpm)
   */
  constructor(
    services: ServiceInfo[],
    _packageManager: "npm" | "yarn" | "pnpm" = "npm",
  ) {
    this.services = services;
    this.buildOrder = this.determineBuildOrder(services);
  }

  /**
   * Builds all services in the correct order.
   * Backend services are built first, then fullstack, then frontend.
   *
   * @param {BuildOptions} options - Build configuration options
   * @returns {Promise<BuildResult[]>} Results for each service build
   */
  async build(options: BuildOptions = {}): Promise<BuildResult[]> {
    const results: BuildResult[] = [];

    console.log(chalk.bold("\n🔨 Building services...\n"));

    // Build backend services first (they might provide APIs)
    const backendServices = this.buildOrder.filter((s) => s.type === "backend");
    const frontendServices = this.buildOrder.filter(
      (s) => s.type === "frontend",
    );
    const fullstackServices = this.buildOrder.filter(
      (s) => s.type === "fullstack",
    );

    // Build order: backend -> fullstack -> frontend
    const orderedServices = [
      ...backendServices,
      ...fullstackServices,
      ...frontendServices,
    ];

    for (const service of orderedServices) {
      const result = await this.buildService(service, options);
      results.push(result);

      if (!result.success && !options.parallel) {
        // Stop on first failure in sequential mode
        break;
      }
    }

    // Summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(chalk.bold("\n📊 Build Summary:"));
    console.log(chalk.green(`  ✓ ${successful} services built successfully`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ ${failed} services failed to build`));
    }

    return results;
  }

  /**
   * Builds a single service.
   * Handles environment variable injection and framework-specific build commands.
   *
   * @private
   * @param {ServiceInfo} service - Service to build
   * @param {BuildOptions} options - Build options
   * @returns {Promise<BuildResult>} Build result
   */
  private async buildService(
    service: ServiceInfo,
    options: BuildOptions,
  ): Promise<BuildResult> {
    const spinner = ora(
      `Building ${service.name} (${service.framework})`,
    ).start();
    const startTime = Date.now();

    try {
      // Prepare environment variables
      const env: Record<string, string> = {
        ...process.env,
        NODE_ENV: "production",
        CI: "true",
      };

      // Inject backend URL for frontend services
      if (service.type === "frontend" && options.injectEnv) {
        Object.assign(env, options.injectEnv);

        // Framework-specific env var prefixes
        const envPrefix = this.getEnvPrefix(service.framework);
        if (envPrefix && options.injectEnv.API_URL) {
          env[`${envPrefix}API_URL`] = options.injectEnv.API_URL;
        }
      }

      // Check if build command exists
      if (!service.buildCommand) {
        spinner.info(`No build command for ${service.name}, skipping...`);
        return {
          service: service.name,
          success: true,
          duration: 0,
          artifacts: [],
        };
      }

      // Run build command with correct package manager
      const [command, ...args] = service.buildCommand.split(" ");
      await execa(command!, args, {
        cwd: service.path,
        env,
        stdout: "pipe",
        stderr: "pipe",
      });

      const duration = Date.now() - startTime;
      spinner.succeed(
        chalk.green(`✓ ${service.name} built successfully (${duration}ms)`),
      );

      // Detect build artifacts
      const artifacts = await this.detectArtifacts(service);

      return {
        service: service.name,
        success: true,
        duration,
        artifacts,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      spinner.fail(chalk.red(`✗ ${service.name} build failed`));

      console.error(chalk.dim(`\n${error.stderr || error.message}\n`));

      return {
        service: service.name,
        success: false,
        duration,
        error: error.message,
      };
    }
  }

  /**
   * Determines the build order based on service dependencies.
   * Currently uses a simple ordering: backend -> fullstack -> frontend.
   *
   * @private
   * @param {ServiceInfo[]} services - Services to order
   * @returns {ServiceInfo[]} Ordered list of services
   */
  private determineBuildOrder(services: ServiceInfo[]): ServiceInfo[] {
    // Simple ordering for now: backend -> fullstack -> frontend
    return services.sort((a, b) => {
      const order = { backend: 0, fullstack: 1, frontend: 2 };
      return order[a.type] - order[b.type];
    });
  }

  /**
   * Gets the environment variable prefix for a specific framework.
   * Frontend frameworks require specific prefixes for build-time env vars.
   *
   * @private
   * @param {string} framework - The framework name
   * @returns {string | null} The env var prefix or null
   */
  private getEnvPrefix(framework: string): string | null {
    const prefixes: Record<string, string> = {
      react: "REACT_APP_",
      vue: "VUE_APP_",
      nextjs: "NEXT_PUBLIC_",
      gatsby: "GATSBY_",
      angular: "NG_",
    };
    return prefixes[framework] || null;
  }

  /**
   * Detects build artifacts produced by a service.
   * Checks common output directories based on framework.
   *
   * @private
   * @param {ServiceInfo} service - The service to check
   * @returns {Promise<string[]>} List of artifact paths
   */
  private async detectArtifacts(service: ServiceInfo): Promise<string[]> {
    const artifacts: string[] = [];

    // Common build output directories
    const buildDirs: Record<string, string[]> = {
      react: ["build", "dist"],
      vue: ["dist"],
      angular: ["dist"],
      nextjs: [".next", "out"],
      gatsby: ["public", ".cache"],
      express: ["dist", "build"],
      fastify: ["dist", "build"],
    };

    const possibleDirs = buildDirs[service.framework] || ["dist", "build"];

    for (const dir of possibleDirs) {
      const artifactPath = path.join(service.path, dir);
      try {
        const stat = await fs.stat(artifactPath);
        if (stat.isDirectory()) {
          artifacts.push(artifactPath);
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return artifacts;
  }

  /**
   * Creates optimized production builds for all services.
   * Installs production dependencies and sets production environment variables.
   *
   * @param {BuildOptions} options - Build options
   * @returns {Promise<BuildResult[]>} Build results for all services
   */
  async productionBuild(options: BuildOptions = {}): Promise<BuildResult[]> {
    console.log(chalk.bold("\n🚀 Production Build\n"));

    // First, install dependencies with production flag
    for (const service of this.services) {
      const spinner = ora(
        `Installing production dependencies for ${service.name}`,
      ).start();
      try {
        await execa("npm", ["ci", "--production"], {
          cwd: service.path,
          stdout: "pipe",
          stderr: "pipe",
        });
        spinner.succeed();
      } catch (error) {
        spinner.fail();
        console.error(
          chalk.red(`Failed to install dependencies for ${service.name}`),
        );
      }
    }

    // Run builds with production optimizations
    const buildOptions: BuildOptions = {
      ...options,
      injectEnv: {
        ...options.injectEnv,
        NODE_ENV: "production",
        GENERATE_SOURCEMAP: "false",
      },
    };

    return this.build(buildOptions);
  }

  /**
   * Generates a build manifest file with detailed build information.
   * Useful for deployment tracking and debugging.
   *
   * @param {BuildResult[]} results - Build results to include in manifest
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * const results = await builder.build();
   * await builder.generateManifest(results);
   * // Creates build-manifest.json with timestamps, durations, and artifacts
   * ```
   */
  async generateManifest(results: BuildResult[]): Promise<void> {
    const manifest = {
      timestamp: new Date().toISOString(),
      services: results.map((r) => ({
        name: r.service,
        success: r.success,
        duration: r.duration,
        artifacts: r.artifacts || [],
        error: r.error,
      })),
      metadata: {
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
        successCount: results.filter((r) => r.success).length,
        failureCount: results.filter((r) => !r.success).length,
      },
    };

    const manifestPath = path.join(process.cwd(), "build-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(chalk.green(`\n✓ Build manifest written to ${manifestPath}`));
  }

  /**
   * Installs dependencies for all services using the appropriate package manager.
   * Checks if node_modules exists to avoid unnecessary installations.
   *
   * @param {string} packageManager - The package manager to use (npm, yarn, pnpm)
   * @returns {Promise<void>}
   */
  async installDependencies(
    packageManager: "npm" | "yarn" | "pnpm" = "npm",
  ): Promise<void> {
    console.log(chalk.bold("\n📦 Installing dependencies...\n"));

    for (const service of this.services) {
      const nodeModulesPath = path.join(service.path, "node_modules");

      // Check if node_modules already exists
      try {
        await fs.access(nodeModulesPath);
        console.log(
          chalk.dim(`  ✓ ${service.name}: dependencies already installed`),
        );
        continue;
      } catch {
        // node_modules doesn't exist, need to install
      }

      const spinner = ora(
        `Installing dependencies for ${service.name}`,
      ).start();

      try {
        const installCommand =
          packageManager === "npm" ? "npm" : packageManager;
        const installArgs =
          packageManager === "npm" ? ["install"] : ["install"];

        await execa(installCommand, installArgs, {
          cwd: service.path,
          stdout: "pipe",
          stderr: "pipe",
        });

        spinner.succeed(
          chalk.green(`✓ ${service.name}: dependencies installed`),
        );
      } catch (error: any) {
        spinner.fail(
          chalk.red(`✗ ${service.name}: failed to install dependencies`),
        );
        throw new Error(
          `Failed to install dependencies for ${service.name}: ${error.message}`,
        );
      }
    }
  }
}
