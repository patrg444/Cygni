#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { version } from "../package.json";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";
import { deployAwsCommand } from "./commands/deploy-aws";
import { deployFullstackCommand } from "./commands/deploy-fullstack";
import { deployGitCommand } from "./commands/deploy-git";
import { deleteCommand } from "./commands/delete";
import { loginCommand } from "./commands/login";
import { logsCommand } from "./commands/logs";
import { statusCommand } from "./commands/status";
import { secretsCommand } from "./commands/secrets";
import { validateCommand } from "./commands/validate";
import { analyzeCommand } from "./commands/analyze";
import { buildCommand } from "./commands/build";
import { generateCommand } from "./commands/generate";
import { gitCommand } from "./commands/git";
import { projectsCommand } from "./commands/projects";
import { periodicUpdateCheck, autoUpdate } from "./utils/update-check";

program
  .name("cygni")
  .description("CloudExpress CLI - The full-stack developer cloud platform")
  .version(version);

// Commands
program.addCommand(loginCommand);
program.addCommand(initCommand);
program.addCommand(deployCommand);
program.addCommand(deployAwsCommand);
program.addCommand(deployFullstackCommand);
program.addCommand(deployGitCommand);
program.addCommand(deleteCommand);
program.addCommand(logsCommand);
program.addCommand(statusCommand);
program.addCommand(secretsCommand);
program.addCommand(validateCommand);
program.addCommand(analyzeCommand);
program.addCommand(buildCommand);
program.addCommand(generateCommand);
program.addCommand(gitCommand);
program.addCommand(projectsCommand);

// Error handling
program.exitOverride();

async function main() {
  try {
    // Check for auto-update
    const updated = await autoUpdate();
    if (updated) {
      process.exit(0);
    }

    // Check for updates periodically
    await periodicUpdateCheck();

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
