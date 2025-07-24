import { Command } from "commander";
import { password, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import fs from "fs/promises";
import { getApiClient } from "../lib/api-client";
import { loadConfig } from "../utils/config";
import {
  SecretsManager,
  getSecretsBackend,
  getLocalStackConfig,
} from "../lib/secrets-manager";

export const secretsCommand = new Command("secrets")
  .description("Manage project secrets")
  .addCommand(
    new Command("set")
      .description("Set a secret value")
      .argument("<key>", "Secret key (e.g., DATABASE_URL)")
      .argument("[value]", "Secret value (prompted if not provided)")
      .option("-p, --project <project>", "Project name or ID")
      .option(
        "-e, --env <environment>",
        "Environment (leave empty for all environments)",
      )
      .action(async (key, value, options) => {
        try {
          const config = await loadConfig();
          const api = await getApiClient();

          const projectId = await getProjectId(
            api,
            options.project || config.name,
          );

          // Validate key format
          if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
            console.error(
              chalk.red(
                "Secret key must be uppercase with underscores (e.g., API_KEY)",
              ),
            );
            process.exit(1);
          }

          // Get value if not provided
          if (!value) {
            value = await password({
              message: `Enter value for ${key}:`,
              mask: "*",
            });
          }

          // Get environment if specified
          let environmentId;
          if (options.env) {
            const environments = await api.get(
              `/projects/${projectId}/environments`,
            );
            const env = environments.data.find(
              (e: any) => e.slug === options.env || e.name === options.env,
            );

            if (!env) {
              console.error(
                chalk.red(`Environment '${options.env}' not found`),
              );
              process.exit(1);
            }

            environmentId = env.id;
          }

          const spinner = ora("Setting secret...").start();

          // Use SecretsManager
          const backend = getSecretsBackend();
          const secretsManager = new SecretsManager({
            backend,
            awsConfig: backend === "aws" ? getLocalStackConfig() : undefined,
            projectId,
          });

          try {
            await secretsManager.setSecret(key, value, environmentId);
            spinner.succeed(`Secret ${key} set successfully!`);
          } catch (error: any) {
            spinner.fail("Failed to set secret");
            if (
              error.response?.status === 409 ||
              error.message?.includes("already exists")
            ) {
              throw { response: { status: 409 } };
            }
            throw error;
          }

          if (environmentId) {
            console.log(
              chalk.yellow("\n  Changes will take effect on next deployment"),
            );
          }
        } catch (error: any) {
          if (error.response?.status === 409) {
            console.error(
              chalk.red(
                'Secret already exists. Use "cygni secrets update" to change it.',
              ),
            );
          } else {
            console.error(
              chalk.red("Error:"),
              error.response?.data?.error || error.message,
            );
          }
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command("list")
      .alias("ls")
      .description("List all secrets")
      .option("-p, --project <project>", "Project name or ID")
      .option("-e, --env <environment>", "Filter by environment")
      .option("--show-values", "Show secret values (requires admin access)")
      .action(async (options) => {
        try {
          const config = await loadConfig();
          const api = await getApiClient();

          const projectId = await getProjectId(
            api,
            options.project || config.name,
          );

          const params: any = {};
          if (options.env) {
            const environments = await api.get(
              `/projects/${projectId}/environments`,
            );
            const env = environments.data.find(
              (e: any) => e.slug === options.env || e.name === options.env,
            );

            if (env) {
              params.environmentId = env.id;
            }
          }

          // Use SecretsManager
          const backend = getSecretsBackend();
          const secretsManager = new SecretsManager({
            backend,
            awsConfig: backend === "aws" ? getLocalStackConfig() : undefined,
            projectId,
          });

          const secrets = await secretsManager.listSecrets(
            params.environmentId,
          );

          if (secrets.length === 0) {
            console.log(chalk.gray("No secrets found"));
            return;
          }

          console.log(chalk.bold("\nSecrets:"));
          secrets.forEach((secret: any) => {
            const envLabel = secret.environmentId
              ? chalk.gray(
                  ` [${secret.environment?.name || secret.environmentId}]`,
                )
              : "";
            const value =
              options.showValues && secret.value
                ? chalk.gray(` = ${secret.value}`)
                : secret.preview
                  ? chalk.gray(` = ${secret.preview}`)
                  : "";

            console.log(`  ${secret.key}${envLabel}${value}`);
          });

          console.log(chalk.gray(`\nTotal: ${secrets.length} secrets`));
        } catch (error: any) {
          console.error(
            chalk.red("Error:"),
            error.response?.data?.error || error.message,
          );
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command("remove")
      .alias("rm")
      .description("Remove a secret")
      .argument("<key>", "Secret key")
      .option("-p, --project <project>", "Project name or ID")
      .option("-e, --env <environment>", "Environment")
      .option("-y, --yes", "Skip confirmation")
      .action(async (key, options) => {
        try {
          const config = await loadConfig();
          const api = await getApiClient();

          const projectId = await getProjectId(
            api,
            options.project || config.name,
          );

          // Get environment if specified
          let environmentId;
          if (options.env) {
            const environments = await api.get(
              `/projects/${projectId}/environments`,
            );
            const env = environments.data.find(
              (e: any) => e.slug === options.env || e.name === options.env,
            );

            if (env) {
              environmentId = env.id;
            }
          }

          // Use SecretsManager
          const backend = getSecretsBackend();
          const secretsManager = new SecretsManager({
            backend,
            awsConfig: backend === "aws" ? getLocalStackConfig() : undefined,
            projectId,
          });

          const secret = await secretsManager.getSecret(key, environmentId);
          if (!secret) {
            console.error(chalk.red(`Secret '${key}' not found`));
            process.exit(1);
          }

          // Confirm deletion
          if (!options.yes) {
            const confirmed = await confirm({
              message: `Are you sure you want to remove ${key}?`,
              default: false,
            });

            if (!confirmed) {
              console.log("Cancelled");
              return;
            }
          }

          const spinner = ora("Removing secret...").start();

          await secretsManager.deleteSecret(key, environmentId);

          spinner.succeed(`Secret ${key} removed successfully!`);
        } catch (error: any) {
          console.error(
            chalk.red("Error:"),
            error.response?.data?.error || error.message,
          );
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command("import")
      .description("Import secrets from .env file")
      .argument("<file>", ".env file path")
      .option("-p, --project <project>", "Project name or ID")
      .option("-e, --env <environment>", "Target environment")
      .action(async (file, options) => {
        try {
          const config = await loadConfig();
          const api = await getApiClient();

          const projectId = await getProjectId(
            api,
            options.project || config.name,
          );

          // Read .env file
          const content = await fs.readFile(file, "utf-8");
          const secrets: Record<string, string> = {};

          content.split("\n").forEach((line) => {
            line = line.trim();
            if (line && !line.startsWith("#")) {
              const [key, ...valueParts] = line.split("=");
              const value = valueParts.join("=").replace(/^["']|["']$/g, "");

              if (key && /^[A-Z_][A-Z0-9_]*$/.test(key)) {
                secrets[key] = value;
              }
            }
          });

          const secretCount = Object.keys(secrets).length;
          if (secretCount === 0) {
            console.log(chalk.yellow("No valid secrets found in file"));
            return;
          }

          console.log(chalk.blue(`Found ${secretCount} secrets to import`));

          // Get environment if specified
          let environmentId;
          if (options.env) {
            const environments = await api.get(
              `/projects/${projectId}/environments`,
            );
            const env = environments.data.find(
              (e: any) => e.slug === options.env || e.name === options.env,
            );

            if (!env) {
              console.error(
                chalk.red(`Environment '${options.env}' not found`),
              );
              process.exit(1);
            }

            environmentId = env.id;
          }

          const spinner = ora("Importing secrets...").start();

          // Use SecretsManager
          const backend = getSecretsBackend();
          const secretsManager = new SecretsManager({
            backend,
            awsConfig: backend === "aws" ? getLocalStackConfig() : undefined,
            projectId,
          });

          const response = await secretsManager.bulkImport(
            secrets,
            environmentId,
          );

          const successful = response.results.filter(
            (r: any) => r.success,
          ).length;
          const failed = response.results.filter((r: any) => r.error).length;

          spinner.succeed(
            `Import complete! ${successful} succeeded, ${failed} failed`,
          );

          if (failed > 0) {
            console.log(chalk.red("\nFailed secrets:"));
            response.results
              .filter((r: any) => r.error)
              .forEach((r: any) => {
                console.log(`  ${r.key}: ${r.error}`);
              });
          }
        } catch (error: any) {
          console.error(
            chalk.red("Error:"),
            error.response?.data?.error || error.message,
          );
          process.exit(1);
        }
      }),
  );

async function getProjectId(
  api: any,
  projectNameOrId: string,
): Promise<string> {
  if (!projectNameOrId) {
    throw new Error("No project specified");
  }

  // Try as ID first
  if (projectNameOrId.startsWith("proj_")) {
    return projectNameOrId;
  }

  // Try to find by slug
  try {
    const response = await api.get(`/projects/by-slug/${projectNameOrId}`);
    return response.data.id;
  } catch (error) {
    throw new Error(`Project '${projectNameOrId}' not found`);
  }
}
