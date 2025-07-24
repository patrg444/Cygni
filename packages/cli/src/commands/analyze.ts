import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ApiAnalyzer } from "../lib/api-analyzer";
import { FullstackAnalyzer } from "../lib/fullstack-analyzer";
import { getFrameworkDefaults } from "../utils/framework-detector";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

export const analyzeCommand = new Command()
  .name("analyze")
  .description("Analyze project and detect API endpoints")
  .option(
    "-o, --output <format>",
    "Output format (json, yaml, openapi)",
    "json",
  )
  .option("-f, --file <path>", "Output to file instead of console")
  .option("--explain", "Show detailed analysis explanation")
  .option("--fullstack", "Analyze as fullstack project", false)
  .action(async (options) => {
    const spinner = ora("Analyzing project...").start();

    try {
      // Check if we should do fullstack analysis
      if (options.fullstack) {
        const fullstackAnalyzer = new FullstackAnalyzer();
        const fullstackResult = await fullstackAnalyzer.analyze();

        spinner.stop();

        if (fullstackResult.services.length === 0) {
          console.log(chalk.yellow("⚠ No services detected"));
          return;
        }

        console.log(
          chalk.green(
            `✓ Analysis complete! Found ${fullstackResult.services.length} services`,
          ),
        );

        // Display service information
        console.log("\n" + chalk.bold("Services Detected:"));
        for (const service of fullstackResult.services) {
          const deployableTag =
            service.isDeployable === false ? chalk.gray(" [library]") : "";
          console.log(
            `\n  ${chalk.cyan(service.name)} (${service.type})${deployableTag}`,
          );
          console.log(`    Framework: ${chalk.green(service.framework)}`);
          console.log(`    Path: ${service.path}`);
          if (service.port) {
            console.log(`    Port: ${service.port}`);
          }
          if (service.apiAnalysis) {
            console.log(
              `    API Endpoints: ${service.apiAnalysis.endpoints.length}`,
            );
          }
        }

        // Show deployable count
        const deployableCount = fullstackResult.services.filter(
          (s) => s.isDeployable !== false,
        ).length;
        console.log(
          chalk.dim(
            `\n  ${deployableCount} deployable / ${fullstackResult.services.length} total`,
          ),
        );

        if (
          fullstackResult.relationships.frontend &&
          fullstackResult.relationships.backend
        ) {
          console.log("\n" + chalk.bold("Architecture:"));
          console.log(
            `  Frontend: ${chalk.cyan(fullstackResult.relationships.frontend)}`,
          );
          console.log(
            `  Backend: ${chalk.cyan(fullstackResult.relationships.backend)}`,
          );
          if (fullstackResult.relationships.apiUrl) {
            console.log(
              `  API URL: ${chalk.yellow(fullstackResult.relationships.apiUrl)}`,
            );
          }
        }

        // Generate runtime specs for each service
        for (const service of fullstackResult.services) {
          const specPath = path.join(service.path, "runtime.yaml");
          const frameworkDefaults = getFrameworkDefaults(service.framework);

          const runtimeSpec = {
            service: service.name,
            type: service.type,
            runtime: detectRuntime(service.framework),
            framework: service.framework,
            endpoints: service.apiAnalysis?.endpoints.length || 0,
            port: service.port || frameworkDefaults.port || 3000,
            build:
              service.buildCommand ||
              frameworkDefaults.buildCommand ||
              "npm run build",
            start:
              service.startCommand ||
              frameworkDefaults.startCommand ||
              "npm start",
            env: service.envVars?.reduce((acc, v) => ({ ...acc, [v]: "" }), {}),
            deploy: {
              strategy: "rolling",
              healthCheck: {
                path: service.type === "frontend" ? "/" : "/health",
                interval: 30,
                timeout: 5,
                retries: 3,
              },
            },
          };

          await fs.writeFile(specPath, yaml.dump(runtimeSpec));
          console.log(chalk.green(`\n✓ Runtime spec written to ${specPath}`));
        }

        // Generate project-wide deployment config
        const deploymentConfig: any = {
          version: "1.0",
          services: fullstackResult.services.map((service) => ({
            name: service.name,
            type: service.type,
            path: path.relative(process.cwd(), service.path),
            dependencies:
              service.type === "frontend" &&
              fullstackResult.relationships.backend
                ? [fullstackResult.relationships.backend]
                : [],
          })),
          relationships: fullstackResult.relationships,
        };

        // Add package manager and monorepo tool if detected
        if (fullstackResult.packageManager !== "npm") {
          deploymentConfig.packageManager = fullstackResult.packageManager;
        }
        if (fullstackResult.monorepoTool) {
          deploymentConfig.monorepoTool = fullstackResult.monorepoTool;
        }

        const deployConfigPath = path.join(process.cwd(), "cloudexpress.yaml");
        await fs.writeFile(deployConfigPath, yaml.dump(deploymentConfig));
        console.log(
          chalk.green(`\n✓ Deployment config written to ${deployConfigPath}`),
        );

        return;
      }

      // Original single-service analysis
      const analyzer = new ApiAnalyzer();
      const result = await analyzer.analyze();

      spinner.stop();
      console.log(
        chalk.green(
          `✓ Analysis complete! Found ${result.endpoints.length} endpoints in ${result.framework} application`,
        ),
      );

      if (options.explain) {
        console.log("\n" + chalk.bold("Framework Detection:"));
        console.log(`  Framework: ${chalk.green(result.framework)}`);

        if (result.authentication) {
          console.log(
            `  Authentication: ${chalk.yellow(result.authentication.type)}${result.authentication.strategy ? ` (${result.authentication.strategy})` : ""}`,
          );
        }

        if (result.middleware && result.middleware.length > 0) {
          console.log(
            `  Middleware: ${chalk.blue(result.middleware.join(", "))}`,
          );
        }

        if (result.websockets?.enabled) {
          console.log(
            `  WebSockets: ${chalk.magenta("enabled")} at ${result.websockets.path}`,
          );
        }

        if (result.graphql?.enabled) {
          console.log(
            `  GraphQL: ${chalk.magenta("enabled")} at ${result.graphql.path}`,
          );
        }

        console.log("\n" + chalk.bold("Detected Endpoints:"));
        const byFile = new Map<string, typeof result.endpoints>();

        for (const endpoint of result.endpoints) {
          if (!byFile.has(endpoint.file)) {
            byFile.set(endpoint.file, []);
          }
          byFile.get(endpoint.file)!.push(endpoint);
        }

        for (const [file, endpoints] of byFile) {
          console.log(`\n  ${chalk.dim(file)}:`);
          for (const ep of endpoints) {
            const middlewareStr =
              ep.middleware && ep.middleware.length > 0
                ? chalk.gray(` [${ep.middleware.join(", ")}]`)
                : "";
            console.log(
              `    ${chalk.cyan(ep.method.padEnd(7))} ${ep.path}${middlewareStr}`,
            );
          }
        }
      }

      // Generate output
      let output: any;

      if (options.output === "openapi") {
        output = await analyzer.generateOpenApiSpec(result);
      } else if (options.output === "yaml") {
        output = yaml.dump(result);
      } else {
        output = result;
      }

      // Write to file or console
      if (options.file) {
        const outputStr =
          typeof output === "string" ? output : JSON.stringify(output, null, 2);
        await fs.writeFile(options.file, outputStr);
        console.log(chalk.green(`\n✓ Output written to ${options.file}`));
      } else if (!options.explain) {
        const outputStr =
          typeof output === "string" ? output : JSON.stringify(output, null, 2);
        console.log("\n" + outputStr);
      }

      // Generate runtime spec
      const frameworkDefaults = getFrameworkDefaults(result.framework);
      const runtimeSpec = {
        runtime: detectRuntime(result.framework),
        framework: result.framework,
        endpoints: result.endpoints.length,
        port: frameworkDefaults.port || 3000,
        build: getBuildCommand(result.framework),
        start: getStartCommand(result.framework),
        deploy: {
          strategy: "rolling",
          healthCheck: {
            path: "/health",
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
      };

      const specPath = path.join(process.cwd(), "runtime.yaml");
      await fs.writeFile(specPath, yaml.dump(runtimeSpec));
      console.log(chalk.green(`\n✓ Runtime spec written to ${specPath}`));
    } catch (error) {
      spinner.fail("Analysis failed");
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
      process.exit(1);
    }
  });

function detectRuntime(framework: string): string {
  const runtimeMap: Record<string, string> = {
    express: "node",
    fastify: "node",
    nextjs: "node",
    nestjs: "node",
    django: "python",
    flask: "python",
    fastapi: "python",
    rails: "ruby",
  };

  return runtimeMap[framework] || "unknown";
}

function getBuildCommand(framework: string): string {
  const buildMap: Record<string, string> = {
    nextjs: "npm run build",
    rails: "bundle exec rake assets:precompile",
    django: "python manage.py collectstatic --noinput",
  };

  return buildMap[framework] || "npm run build";
}

function getStartCommand(framework: string): string {
  const startMap: Record<string, string> = {
    express: "node index.js",
    fastify: "node index.js",
    nextjs: "npm start",
    nestjs: "npm run start:prod",
    django: "gunicorn wsgi:application",
    flask: "gunicorn app:app",
    rails: "bundle exec puma",
  };

  return startMap[framework] || "npm start";
}
