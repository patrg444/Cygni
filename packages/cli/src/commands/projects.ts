import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { SharedDeployer } from "../lib/shared-deployer";
import Table from "cli-table3";

export const projectsCommand = new Command("projects")
  .description("Manage projects deployed to shared infrastructure");

// List all projects
projectsCommand
  .command("list")
  .alias("ls")
  .description("List all projects deployed to shared infrastructure")
  .option("-r, --region <region>", "AWS region", "us-east-1")
  .action(async (options) => {
    const spinner = ora("Loading projects...").start();
    
    try {
      const deployer = new SharedDeployer(options.region);
      await deployer.loadSharedInfrastructure();
      
      const projects = await deployer.listProjects();
      spinner.stop();
      
      if (projects.length === 0) {
        console.log(chalk.yellow("\nNo projects deployed to shared infrastructure"));
        return;
      }
      
      console.log(chalk.bold(`\n📦 Projects in shared infrastructure (${options.region}):\n`));
      
      // Create table
      const table = new Table({
        head: [
          chalk.cyan("Project ID"),
          chalk.cyan("Status"),
          chalk.cyan("Tasks"),
          chalk.cyan("URL"),
        ],
        style: {
          head: [],
          border: [],
        },
      });
      
      for (const project of projects) {
        table.push([
          project.projectId,
          project.status === "ACTIVE" ? chalk.green(project.status) : chalk.yellow(project.status),
          `${project.runningTasks}/${project.desiredTasks}`,
          chalk.blue(project.url),
        ]);
      }
      
      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${projects.length} project(s)`));
      
    } catch (error: any) {
      spinner.fail("Failed to list projects");
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Remove a project
projectsCommand
  .command("remove <projectId>")
  .alias("rm")
  .description("Remove a project from shared infrastructure")
  .option("-r, --region <region>", "AWS region", "us-east-1")
  .option("-f, --force", "Skip confirmation prompt", false)
  .action(async (projectId, options) => {
    try {
      // Confirmation prompt
      if (!options.force) {
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const confirm = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow(`\n⚠️  Are you sure you want to remove project "${projectId}"? (yes/no): `),
            resolve
          );
        });
        
        rl.close();
        
        if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
          console.log(chalk.gray("\nOperation cancelled"));
          return;
        }
      }
      
      const spinner = ora(`Removing project ${projectId}...`).start();
      
      const deployer = new SharedDeployer(options.region);
      await deployer.loadSharedInfrastructure();
      await deployer.removeProject(projectId);
      
      spinner.succeed(`Project ${projectId} removed successfully`);
      
    } catch (error: any) {
      console.error(chalk.red(`\n✗ Failed to remove project: ${error.message}`));
      process.exit(1);
    }
  });

// View project logs
projectsCommand
  .command("logs <projectId>")
  .description("View logs for a project")
  .option("-r, --region <region>", "AWS region", "us-east-1")
  .option("-f, --follow", "Follow log output", false)
  .option("-t, --tail <lines>", "Number of lines to show", "100")
  .action(async (projectId, _options) => {
    console.log(chalk.blue(`\n📋 Logs for project: ${projectId}\n`));
    
    // Log viewing would require CloudWatch integration
    console.log(chalk.yellow("Note: Log viewing requires AWS CloudWatch integration"));
    console.log(chalk.gray("\nTo view logs manually:"));
    console.log(chalk.gray(`  1. Go to AWS CloudWatch console`));
    console.log(chalk.gray(`  2. Navigate to Log groups`));
    console.log(chalk.gray(`  3. Find /ecs/cygni-shared`));
    console.log(chalk.gray(`  4. Filter by log stream prefix: ${projectId}`));
  });

// Show project details
projectsCommand
  .command("info <projectId>")
  .description("Show detailed information about a project")
  .option("-r, --region <region>", "AWS region", "us-east-1")
  .action(async (projectId, options) => {
    const spinner = ora("Loading project details...").start();
    
    try {
      const deployer = new SharedDeployer(options.region);
      await deployer.loadSharedInfrastructure();
      
      const projects = await deployer.listProjects();
      const project = projects.find(p => p.projectId === projectId);
      
      spinner.stop();
      
      if (!project) {
        console.error(chalk.red(`\n✗ Project "${projectId}" not found`));
        process.exit(1);
      }
      
      console.log(chalk.bold(`\n📦 Project: ${project.projectId}\n`));
      console.log(`  Status:         ${project.status === "ACTIVE" ? chalk.green(project.status) : chalk.yellow(project.status)}`);
      console.log(`  Service:        ${project.serviceName}`);
      console.log(`  Running Tasks:  ${project.runningTasks}`);
      console.log(`  Desired Tasks:  ${project.desiredTasks}`);
      console.log(`  URL:            ${chalk.blue(project.url)}`);
      console.log(`  Region:         ${options.region}`);
      console.log(`  Tier:           Shared`);
      
      console.log(chalk.bold("\n📝 Commands:"));
      console.log(chalk.gray(`  cx projects:logs ${projectId}      # View logs`));
      console.log(chalk.gray(`  cx projects:remove ${projectId}    # Remove project`));
      
    } catch (error: any) {
      spinner.fail("Failed to load project details");
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });