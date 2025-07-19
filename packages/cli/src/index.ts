#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { version } from "../package.json";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";
import { loginCommand } from "./commands/login";
import { logsCommand } from "./commands/logs";
import { statusCommand } from "./commands/status";
import { secretsCommand } from "./commands/secrets";

program
  .name("cygni")
  .description("CloudExpress CLI - The full-stack developer cloud platform")
  .version(version);

// Commands
program.addCommand(loginCommand);
program.addCommand(initCommand);
program.addCommand(deployCommand);
program.addCommand(logsCommand);
program.addCommand(statusCommand);
program.addCommand(secretsCommand);

// Error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === "commander.help") {
      process.exit(0);
    }
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

main();
