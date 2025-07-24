import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs/promises";
import path from "path";
import { FullstackAnalyzer } from "../lib/fullstack-analyzer";
import { MultiServiceBuilder } from "../lib/multi-service-builder";
import {
  MultiServiceDeployer,
  DeploymentTarget,
} from "../lib/multi-service-deployer";
import { SharedDeployer } from "../lib/shared-deployer";

export const deployFullstackCommand = new Command("deploy:fullstack")
  .description("Deploy fullstack application with multiple services")
  .option("-e, --env <environment>", "Target environment", "production")
  .option(
    "--provider <provider>",
    "Deployment provider (cloudexpress, aws, vercel, netlify)",
    "cloudexpress",
  )
  .option("--region <region>", "Deployment region", "us-east-1")
  .option("--skip-build", "Skip build step", false)
  .option("--api-url <url>", "Override backend API URL for frontend")
  .option("--dry-run", "Show deployment plan without deploying", false)
  .option(
    "--tier <tier>",
    "AWS deployment tier (shared or dedicated)",
    "shared",
  )
  .option(
    "--project-id <id>",
    "Project ID for shared infrastructure (required for shared tier)",
  )
  .action(async (options) => {
    try {
      console.log(chalk.bold("\n🚀 CloudExpress Fullstack Deployment\n"));

      // Check for cloudexpress.yaml
      const configPath = path.join(process.cwd(), "cloudexpress.yaml");

      try {
        await fs.access(configPath);
      } catch {
        // Config doesn't exist
      }

      // Analyze project
      const analyzeSpinner = ora("Analyzing project structure...").start();
      const analyzer = new FullstackAnalyzer();
      const analysisResult = await analyzer.analyze();
      analyzeSpinner.succeed();

      if (analysisResult.services.length === 0) {
        console.error(chalk.red("✗ No services detected in project"));
        process.exit(1);
      }

      // Display detected services
      console.log(chalk.bold("\n📦 Detected Services:"));
      for (const service of analysisResult.services) {
        console.log(
          `  • ${chalk.cyan(service.name)} (${service.type}) - ${service.framework}`,
        );
        if (service.port) {
          console.log(`    Port: ${service.port}`);
        }
      }

      if (
        analysisResult.relationships.frontend &&
        analysisResult.relationships.backend
      ) {
        console.log(chalk.bold("\n🔗 Architecture:"));
        console.log(`  Frontend → Backend connection detected`);
        console.log(`  API URL will be injected during deployment`);
      }

      // Build services (unless skipped)
      if (!options.skipBuild) {
        console.log(chalk.bold("\n🔨 Building Services..."));

        const builder = new MultiServiceBuilder(
          analysisResult.services,
          analysisResult.packageManager,
        );

        // Determine API URL for frontend build
        let apiUrl = options.apiUrl;
        if (!apiUrl && analysisResult.relationships.backend) {
          const backend = analysisResult.services.find(
            (s) => s.name === analysisResult.relationships.backend,
          );
          if (backend && backend.port) {
            // Use production URL pattern
            apiUrl = `https://api-${options.env}.cloudexpress.io`;
            console.log(chalk.blue(`ℹ Frontend will use API URL: ${apiUrl}`));
          }
        }

        const buildResults = await builder.build({
          injectEnv: apiUrl ? { API_URL: apiUrl } : {},
        });

        const failedBuilds = buildResults.filter((r) => !r.success);
        if (failedBuilds.length > 0) {
          console.error(chalk.red("\n✗ Build failed for some services"));
          process.exit(1);
        }

        await builder.generateManifest(buildResults);
      }

      // Deployment plan
      if (options.dryRun) {
        console.log(chalk.bold("\n📋 Deployment Plan:"));
        console.log(`  Provider: ${options.provider}`);
        console.log(`  Environment: ${options.env}`);
        console.log(`  Region: ${options.region}`);
        
        // Show tier for AWS deployments
        if (options.provider === "aws") {
          console.log(`  Tier: ${options.tier}`);
          if (options.tier === "shared") {
            console.log(`  Project ID: ${options.projectId || '<required>'}`);
          }
        }
        
        console.log("\n  Services to deploy:");

        for (const service of analysisResult.services) {
          console.log(`    • ${service.name} (${service.type})`);

          // Show expected URLs
          if (options.provider === "cloudexpress") {
            const subdomain = service.type === "frontend" ? "app" : "api";
            console.log(
              `      → https://${subdomain}-${options.env}.cloudexpress.io`,
            );
          } else if (options.provider === "aws" && options.tier === "shared") {
            if (service.type === "backend") {
              console.log(
                `      → https://<shared-alb-dns>/${options.projectId || '<project-id>'}`,
              );
            }
          }
        }

        console.log(
          chalk.yellow(
            "\n⚠ This is a dry run. No resources will be deployed.",
          ),
        );
        return;
      }

      // Deploy services
      console.log(chalk.bold("\n🚀 Deploying Services..."));

      // Handle AWS shared infrastructure deployment
      if (options.provider === "aws" && options.tier === "shared") {
        // Validate project ID for shared tier
        if (!options.projectId) {
          console.error(
            chalk.red("\n✗ --project-id is required for shared tier deployment"),
          );
          console.log("\nExample: cx deploy:fullstack --provider aws --tier shared --project-id my-app");
          process.exit(1);
        }

        // Deploy to shared infrastructure
        const sharedDeployer = new SharedDeployer(options.region);
        await sharedDeployer.loadSharedInfrastructure();

        // Deploy backend service if exists
        const backendService = analysisResult.services.find(s => s.type === "backend");
        if (backendService) {
          console.log(chalk.blue(`\nDeploying backend to shared infrastructure...`));
          
          const result = await sharedDeployer.deployService(backendService, {
            projectId: options.projectId,
            environment: options.env,
            memory: 512,
            cpu: 256,
            desiredCount: 1,
            healthCheckPath: "/health",
            port: backendService.port || 3000,
          });

          if (result.success) {
            console.log(chalk.green("\n✅ Deployment Complete!"));
            console.log(chalk.bold("\n🌐 Your application is live at:"));
            console.log(`  URL: ${chalk.cyan.underline(result.url)}`);
            console.log(chalk.gray(`\n✨ Deployment completed in under 1 minute`));
            
            // Show useful commands
            console.log(chalk.bold("\n📝 Useful Commands:"));
            console.log(
              chalk.gray(`  cx projects list                    # List all projects`),
            );
            console.log(
              chalk.gray(`  cx projects remove ${options.projectId}     # Remove this project`),
            );
            console.log(
              chalk.gray(`  cx projects logs ${options.projectId}       # View logs`),
            );
          } else {
            console.error(chalk.red("\n✗ Deployment failed:"), result.error);
            process.exit(1);
          }
        } else {
          console.error(chalk.red("\n✗ No backend service found for shared tier deployment"));
          console.log(chalk.yellow("Note: Shared tier currently only supports backend services"));
          process.exit(1);
        }
        
        return; // Exit early for shared tier
      }

      // Standard deployment flow (dedicated tier or other providers)
      const apiUrl = process.env.CLOUDEXPRESS_API_URL;

      const deployer = new MultiServiceDeployer(
        analysisResult.services,
        apiUrl,
      );
      const deploymentTarget: DeploymentTarget = {
        provider: options.provider,
        region: options.region,
        environment: options.env,
      };

      const deploymentResult = await deployer.deploy(deploymentTarget);

      if (!deploymentResult.success) {
        console.error(chalk.red("\n✗ Deployment failed"));

        // Show failed deployments
        const failed = deploymentResult.deployments.filter(
          (d) => d.status === "failed",
        );
        for (const deployment of failed) {
          console.error(
            chalk.red(`  ${deployment.service.name}: ${deployment.error}`),
          );
        }

        process.exit(1);
      }

      // Success!
      console.log(chalk.green("\n✅ Deployment Complete!"));

      if (deploymentResult.urls.frontend || deploymentResult.urls.backend) {
        console.log(chalk.bold("\n🌐 Your application is live at:"));

        if (deploymentResult.urls.frontend) {
          console.log(
            `  Frontend: ${chalk.cyan.underline(deploymentResult.urls.frontend)}`,
          );
        }

        if (deploymentResult.urls.backend) {
          console.log(
            `  Backend:  ${chalk.cyan.underline(deploymentResult.urls.backend)}`,
          );
        }
      }

      // Show useful commands
      console.log(chalk.bold("\n📝 Useful Commands:"));
      console.log(
        chalk.gray("  cx logs                    # View application logs"),
      );
      console.log(
        chalk.gray("  cx status                  # Check deployment status"),
      );
      console.log(
        chalk.gray("  cx deploy:fullstack --help # See all deployment options"),
      );

      // Environment-specific notes
      if (options.env === "production") {
        console.log(
          chalk.yellow(
            "\n⚠ Production deployment detected. Monitor your application closely.",
          ),
        );
      }
    } catch (error: any) {
      console.error(chalk.red("\n✗ Deployment failed:"), error.message);

      if (error.stack && process.env.DEBUG) {
        console.error(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });
