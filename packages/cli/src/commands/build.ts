import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { FullstackAnalyzer } from "../lib/fullstack-analyzer";
import { MultiServiceBuilder } from "../lib/multi-service-builder";

export const buildCommand = new Command()
  .name("build")
  .description("Build project for deployment")
  .option("--parallel", "Build services in parallel", false)
  .option("--skip-tests", "Skip running tests", false)
  .option("--skip-install", "Skip dependency installation", false)
  .option("--production", "Production build with optimizations", false)
  .option("--api-url <url>", "Backend API URL to inject into frontend build")
  .action(async (options) => {
    try {
      // First, check if cloudexpress.yaml exists
      const configPath = path.join(process.cwd(), "cloudexpress.yaml");
      let hasConfig = false;

      try {
        await fs.access(configPath);
        hasConfig = true;
      } catch {
        // Config doesn't exist
      }

      if (!hasConfig) {
        console.log(
          chalk.yellow(
            "⚠ No cloudexpress.yaml found. Running analysis first...",
          ),
        );

        // Run fullstack analysis
        const analyzer = new FullstackAnalyzer();
        const analysisResult = await analyzer.analyze();

        if (analysisResult.services.length === 0) {
          console.error(chalk.red("✗ No services detected in project"));
          process.exit(1);
        }
      }

      // Load the config
      const configContent = await fs.readFile(configPath, "utf-8");
      yaml.load(configContent); // Just to validate it

      // Re-analyze to get full service info
      const analyzer = new FullstackAnalyzer();
      const analysisResult = await analyzer.analyze();

      // Determine API URL
      let apiUrl = options.apiUrl;
      if (!apiUrl && analysisResult.relationships.backend) {
        const backend = analysisResult.services.find(
          (s) => s.name === analysisResult.relationships.backend,
        );
        if (backend && backend.port) {
          apiUrl = `http://localhost:${backend.port}`;
          console.log(chalk.blue(`ℹ Using backend URL: ${apiUrl}`));
        }
      }

      // Filter to only deployable services
      const deployableServices = analysisResult.services.filter(
        (s) => s.isDeployable !== false,
      );

      if (deployableServices.length === 0) {
        console.error(
          chalk.red(
            "✗ No deployable services found. Services must have a 'start' or 'serve' script to be deployable.",
          ),
        );
        process.exit(1);
      }

      console.log(
        chalk.blue(
          `ℹ Found ${deployableServices.length} deployable services out of ${analysisResult.services.length} total services`,
        ),
      );

      // Build services
      const builder = new MultiServiceBuilder(
        deployableServices,
        analysisResult.packageManager,
      );

      // Install dependencies if needed
      if (!options.skipInstall) {
        await builder.installDependencies(analysisResult.packageManager);
      }

      const buildOptions = {
        parallel: options.parallel,
        skipTests: options.skipTests,
        injectEnv: apiUrl ? { API_URL: apiUrl } : undefined,
      };

      let results;
      if (options.production) {
        results = await builder.productionBuild(buildOptions);
      } else {
        results = await builder.build(buildOptions);
      }

      // Generate build manifest
      await builder.generateManifest(results);

      // Check if all builds succeeded
      const allSuccess = results.every((r) => r.success);

      if (!allSuccess) {
        console.error(chalk.red("\n✗ Build failed"));
        process.exit(1);
      }

      console.log(chalk.green("\n✓ All services built successfully"));

      // Show next steps
      console.log(chalk.bold("\n📦 Next Steps:"));
      console.log(
        chalk.gray("  1. Review build artifacts in build-manifest.json"),
      );
      console.log(
        chalk.gray("  2. Run 'cx deploy' to deploy your application"),
      );
    } catch (error) {
      console.error(chalk.red("✗ Build failed:"), error);
      process.exit(1);
    }
  });
