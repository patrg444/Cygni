import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient } from "../lib/api-client";

export const deleteCommand = new Command()
  .name("delete")
  .description("Delete a deployment or namespace")
  .option("--namespace <namespace>", "Delete all resources in a namespace")
  .option("--deployment <id>", "Delete a specific deployment by ID")
  .option("-f, --force", "Force deletion without confirmation")
  .action(async (options) => {
    if (!options.namespace && !options.deployment) {
      console.error(
        chalk.red("❌ Please specify either --namespace or --deployment"),
      );
      process.exit(1);
    }

    if (!options.force) {
      const target = options.namespace
        ? `namespace ${options.namespace}`
        : `deployment ${options.deployment}`;

      console.log(
        chalk.yellow(
          `⚠️  This will delete ${target} and all associated resources.`,
        ),
      );
      console.log(chalk.yellow("Use --force to skip this confirmation."));

      // In a real implementation, we'd use inquirer or similar for confirmation
      console.log(chalk.gray("\nProceed with deletion? (y/N)"));
      process.exit(0);
    }

    const spinner = ora("Connecting to API...").start();

    try {
      const api = await getApiClient();

      if (options.namespace) {
        spinner.text = `Deleting namespace ${options.namespace}...`;

        // Delete all deployments in the namespace
        const response = await api.delete(`/namespaces/${options.namespace}`);

        spinner.succeed(`Namespace ${options.namespace} deleted successfully`);

        if (response.data.deletedResources) {
          console.log(chalk.gray("\nDeleted resources:"));
          console.log(
            chalk.gray(
              `  - Deployments: ${response.data.deletedResources.deployments || 0}`,
            ),
          );
          console.log(
            chalk.gray(
              `  - Services: ${response.data.deletedResources.services || 0}`,
            ),
          );
          console.log(
            chalk.gray(
              `  - Databases: ${response.data.deletedResources.databases || 0}`,
            ),
          );
        }
      } else if (options.deployment) {
        spinner.text = `Deleting deployment ${options.deployment}...`;

        await api.delete(`/deployments/${options.deployment}`);

        spinner.succeed(
          `Deployment ${options.deployment} deleted successfully`,
        );
      }
    } catch (error: any) {
      spinner.fail("Deletion failed");

      if (error.response?.status === 404) {
        console.error(chalk.red("❌ Resource not found"));
      } else if (error.response?.data?.message) {
        console.error(chalk.red(`❌ ${error.response.data.message}`));
      } else {
        console.error(chalk.red(`❌ ${error.message}`));
      }

      process.exit(1);
    }
  });
