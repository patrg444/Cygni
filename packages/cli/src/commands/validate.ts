import { Command } from "commander";
import chalk from "chalk";
import { validateRuntimeSpec } from "../lib/runtime-validator";

export const validateCommand = new Command()
  .name("validate")
  .description("Validate configuration files")
  .argument("<file>", "File to validate (e.g., runtime.yaml)")
  .action(async (file: string) => {
    if (!file.endsWith("runtime.yaml")) {
      console.error(chalk.red("✗ Only runtime.yaml validation is supported in v0.1"));
      process.exit(1);
    }

    console.log(chalk.blue(`Validating ${file}...`));

    const result = await validateRuntimeSpec(file);

    if (result.valid) {
      console.log(chalk.green("✓ Runtime spec is valid"));
      
      if (result.spec) {
        console.log("\nRuntime details:");
        console.log(`  Name: ${result.spec.name}`);
        console.log(`  Version: ${result.spec.version}`);
        console.log(`  Port: ${result.spec.run.port}`);
        if (result.spec.health) {
          console.log(`  Health check: ${result.spec.health.path}`);
        }
      }
      
      process.exit(0);
    } else {
      console.error(chalk.red("✗ Validation failed:"));
      result.errors?.forEach(error => {
        console.error(chalk.red(`  - ${error}`));
      });
      process.exit(1);
    }
  });