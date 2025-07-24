import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../utils/config";
import { buildProject } from "../lib/builder";
import { deployToCloudExpress } from "../lib/deployer";
import { watchLogs } from "../lib/logs";
import { getApiClient } from "../lib/api-client";
import {
  validateDeploymentOptions,
  checkBuildCache,
  displayDeploymentSummary,
  checkDeploymentHealth,
  handleDeploymentFailure,
} from "../lib/deploy-helpers";

export const deployCommand = new Command("deploy")
  .description("Deploy your application to CloudExpress")
  .option("-w, --watch", "Watch deployment logs")
  .option("-e, --env <environment>", "Target environment", "production")
  .option(
    "--namespace <namespace>",
    "Deploy to a specific namespace (e.g., preview-123)",
  )
  .option("--rollback", "Rollback to previous deployment")
  .option(
    "--health-gate <level>",
    "Health gate level (strict, normal, off)",
    "normal",
  )
  .option(
    "--strategy <strategy>",
    "Deployment strategy (rolling, canary)",
    "rolling",
  )
  .action(async (options) => {
    if (options.rollback) {
      return handleRollback(options);
    }

    try {
      // Validate options
      validateDeploymentOptions(options);

      console.log(chalk.blue("Deploying to Cygni...\n"));

      // Load configuration
      const config = await loadConfig();

      // Build project
      const buildSpinner = ora("Building project...").start();
      const buildResult = await buildProject(config);

      // Check build cache for idempotency
      const cachedBuild = await checkBuildCache(
        buildResult.commitSha,
        buildResult.dockerfilePath,
      );

      if (cachedBuild) {
        buildSpinner.succeed(
          `Build cached (${cachedBuild.imageId.substring(0, 12)})`,
        );
      } else {
        buildSpinner.succeed("Build complete!");
      }

      // Deploy
      const deploySpinner = ora("Deploying application...").start();
      const deployment = await deployToCloudExpress({
        config,
        buildResult,
        environment: options.env,
        namespace: options.namespace,
        strategy: options.strategy,
        cachedImageId: cachedBuild?.imageId,
      });
      deploySpinner.succeed("Deployment initiated!");

      // Check deployment health
      if (options.healthGate !== "off") {
        const healthSpinner = ora("Checking deployment health...").start();
        const isHealthy = await checkDeploymentHealth(
          deployment.id,
          options.healthGate,
        );

        if (isHealthy) {
          healthSpinner.succeed("Deployment is healthy!");
        } else {
          healthSpinner.fail("Deployment health check failed");
          await handleDeploymentFailure(
            deployment.id,
            new Error("Health check failed"),
            options,
          );
          process.exit(1);
        }
      }

      // Show deployment info
      displayDeploymentSummary(deployment, options);

      // Watch logs if requested
      if (options.watch) {
        console.log("\n" + chalk.yellow("Watching deployment logs..."));
        await watchLogs(deployment.id);
      }
    } catch (error: any) {
      console.error(chalk.red("Deployment failed:"), error.message);
      process.exit(1);
    }
  });

async function handleRollback(options: any) {
  console.log(chalk.blue("Rolling back deployment...\n"));

  try {
    const config = await loadConfig();
    const api = await getApiClient();

    // Get current deployment status
    const projectId = config.projectId;
    if (!projectId) {
      console.error(chalk.red('No project found. Run "cygni init" first.'));
      process.exit(1);
    }

    // Get latest deployment with previous deployment info in a single call
    const deploymentData = await api.get(
      `/projects/${projectId}/deployments/latest`,
      {
        params: {
          environment: options.env,
          includePrevious: true,
        },
      },
    );

    if (!deploymentData.data.latest) {
      console.error(chalk.red("No deployments found to rollback"));
      process.exit(1);
    }

    const currentDeployment = deploymentData.data.latest;
    const previousDeployment = deploymentData.data.previous;

    if (!previousDeployment) {
      console.error(chalk.red("No previous deployment available for rollback"));
      process.exit(1);
    }

    console.log("Current deployment:");
    console.log(chalk.gray(`  Image: ${currentDeployment.build.imageUrl}`));
    console.log(chalk.gray(`  Status: ${currentDeployment.status}`));
    console.log("\nWill rollback to:");
    console.log(chalk.green(`  Image: ${previousDeployment.build.imageUrl}`));

    const confirmed = await confirm({
      message: "Are you sure you want to rollback?",
      default: false,
    });

    if (!confirmed) {
      console.log("Rollback cancelled");
      return;
    }

    const spinner = ora("Initiating rollback...").start();

    // Trigger rollback
    const rollbackResponse = await api.post(
      `/deployments/${currentDeployment.id}/rollback`,
    );

    spinner.succeed("Rollback initiated!");

    console.log("\n" + chalk.green(" Rollback Started!"));
    console.log("Deployment ID: " + chalk.gray(rollbackResponse.data.id));

    if (options.watch) {
      console.log("\n" + chalk.yellow("Watching rollback progress..."));
      await watchLogs(rollbackResponse.data.id);
    } else {
      console.log("\nMonitor rollback with:");
      console.log(
        chalk.cyan(`  cygni logs ${rollbackResponse.data.id} --follow`),
      );
    }
  } catch (error: any) {
    console.error(
      chalk.red("Rollback failed:"),
      error.response?.data?.error || error.message,
    );
    process.exit(1);
  }
}
