/**
 * Git Repository Deployer
 * Handles cloning and deploying projects from Git repositories
 */

import execa from "execa";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { FullstackAnalyzer } from "./fullstack-analyzer";
import { MultiServiceBuilder } from "./multi-service-builder";
import {
  MultiServiceDeployer,
  DeploymentTarget,
} from "./multi-service-deployer";

export interface GitDeployOptions {
  repository: string;
  branch?: string;
  commit?: string;
  environment?: "development" | "staging" | "production";
  provider?: "cloudexpress" | "aws" | "vercel" | "netlify";
  apiUrl?: string;
  skipBuild?: boolean;
}

export interface GitDeployResult {
  success: boolean;
  repository: string;
  commit: string;
  deploymentUrls?: {
    frontend?: string;
    backend?: string;
  };
  error?: string;
}

export class GitDeployer {
  private tempDir?: string;

  /**
   * Deploy from Git repository
   */
  async deployFromGit(options: GitDeployOptions): Promise<GitDeployResult> {
    const spinner = ora("Preparing deployment from Git repository...").start();

    try {
      // Create temporary directory
      this.tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "cloudexpress-deploy-"),
      );

      // Clone repository
      spinner.text = "Cloning repository...";
      const cloneResult = await this.cloneRepository(options);

      // Change to cloned directory
      const projectDir = path.join(
        this.tempDir,
        this.getRepoName(options.repository),
      );
      process.chdir(projectDir);

      // Install dependencies
      spinner.text = "Installing dependencies...";
      await this.installDependencies(projectDir);

      // Analyze project
      spinner.text = "Analyzing project structure...";
      const analyzer = new FullstackAnalyzer(projectDir);
      const analysisResult = await analyzer.analyze();

      if (analysisResult.services.length === 0) {
        throw new Error("No services detected in repository");
      }

      spinner.succeed("Repository prepared successfully");

      // Display project info
      console.log(chalk.bold("\n📦 Repository Information:"));
      console.log(`  Repository: ${chalk.cyan(options.repository)}`);
      console.log(`  Branch: ${chalk.cyan(cloneResult.branch)}`);
      console.log(
        `  Commit: ${chalk.gray(cloneResult.commit.substring(0, 7))}`,
      );
      console.log(`  Services: ${chalk.green(analysisResult.services.length)}`);

      // Build if not skipped
      if (!options.skipBuild) {
        console.log(chalk.bold("\n🔨 Building Services..."));

        const builder = new MultiServiceBuilder(
          analysisResult.services,
          analysisResult.packageManager,
        );

        // Determine API URL
        let apiUrl = options.apiUrl;
        if (!apiUrl && analysisResult.relationships.backend) {
          apiUrl = `https://api-${options.environment || "production"}.cloudexpress.io`;
        }

        const buildResults = await builder.build({
          injectEnv: apiUrl ? { API_URL: apiUrl } : {},
        });

        const failedBuilds = buildResults.filter((r) => !r.success);
        if (failedBuilds.length > 0) {
          throw new Error("Build failed for some services");
        }
      }

      // Deploy
      console.log(chalk.bold("\n🚀 Deploying Services..."));

      const deployer = new MultiServiceDeployer(analysisResult.services);
      const deploymentTarget: DeploymentTarget = {
        provider: options.provider || "cloudexpress",
        environment: options.environment || "production",
      };

      const deploymentResult = await deployer.deploy(deploymentTarget);

      if (!deploymentResult.success) {
        throw new Error("Deployment failed");
      }

      // Clean up
      await this.cleanup();

      return {
        success: true,
        repository: options.repository,
        commit: cloneResult.commit,
        deploymentUrls: {
          frontend: deploymentResult.urls.frontend,
          backend: deploymentResult.urls.backend,
        },
      };
    } catch (error: any) {
      spinner.fail("Deployment failed");
      await this.cleanup();

      return {
        success: false,
        repository: options.repository,
        commit: "",
        error: error.message,
      };
    }
  }

  /**
   * Clone Git repository
   */
  private async cloneRepository(
    options: GitDeployOptions,
  ): Promise<{ branch: string; commit: string }> {
    const cloneArgs = ["clone"];

    // Add branch if specified
    if (options.branch) {
      cloneArgs.push("-b", options.branch);
    }

    // Add depth for faster cloning
    cloneArgs.push("--depth", "1");

    // Add repository URL
    cloneArgs.push(options.repository);

    // Clone
    await execa("git", cloneArgs, {
      cwd: this.tempDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Get current branch and commit
    const repoDir = path.join(
      this.tempDir!,
      this.getRepoName(options.repository),
    );

    const { stdout: branch } = await execa(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      {
        cwd: repoDir,
      },
    );

    const { stdout: commit } = await execa("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
    });

    // Checkout specific commit if provided
    if (options.commit) {
      await execa("git", ["checkout", options.commit], {
        cwd: repoDir,
      });
      return { branch, commit: options.commit };
    }

    return { branch, commit };
  }

  /**
   * Install dependencies for the project
   */
  private async installDependencies(projectDir: string): Promise<void> {
    // Check for package manager
    const hasYarnLock = await this.fileExists(
      path.join(projectDir, "yarn.lock"),
    );
    const hasPnpmLock = await this.fileExists(
      path.join(projectDir, "pnpm-lock.yaml"),
    );

    let command: string;
    let args: string[];

    if (hasPnpmLock) {
      command = "pnpm";
      args = ["install", "--frozen-lockfile"];
    } else if (hasYarnLock) {
      command = "yarn";
      args = ["install", "--frozen-lockfile"];
    } else {
      command = "npm";
      args = ["ci"];
    }

    // Install root dependencies
    await execa(command, args, {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Check for monorepo workspaces and install their dependencies
    const packageJsonPath = path.join(projectDir, "package.json");
    if (await this.fileExists(packageJsonPath)) {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );

      if (packageJson.workspaces) {
        console.log(chalk.gray("  Installing workspace dependencies..."));
        // Workspace dependencies are usually installed with root install
      }
    }
  }

  /**
   * Get repository name from URL
   */
  private getRepoName(repoUrl: string): string {
    // Handle different Git URL formats
    const match = repoUrl.match(/([^/]+?)(?:\.git)?$/);
    return match ? match[1]! : "repository";
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up temporary directory
   */
  private async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(
          chalk.yellow("Warning: Failed to clean up temporary directory"),
        );
      }
    }
  }

  /**
   * Deploy from GitHub URL with automatic parsing
   */
  async deployFromGitHub(
    githubUrl: string,
    options: Partial<GitDeployOptions> = {},
  ): Promise<GitDeployResult> {
    // Parse GitHub URL
    const urlPattern =
      /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?$/;
    const match = githubUrl.match(urlPattern);

    if (!match) {
      throw new Error("Invalid GitHub URL");
    }

    const [, owner, repo, branch] = match;
    const gitUrl = `https://github.com/${owner}/${repo}.git`;

    return this.deployFromGit({
      repository: gitUrl,
      branch: branch || "main",
      ...options,
    });
  }

  /**
   * Create deployment from template
   */
  async deployFromTemplate(
    template: string,
    _projectName: string,
    options: Partial<GitDeployOptions> = {},
  ): Promise<GitDeployResult> {
    // Template repository URLs
    const templates: Record<string, string> = {
      "nextjs-express":
        "https://github.com/cloudexpress/template-nextjs-express",
      "react-fastify": "https://github.com/cloudexpress/template-react-fastify",
      "vue-django": "https://github.com/cloudexpress/template-vue-django",
      "angular-rails": "https://github.com/cloudexpress/template-angular-rails",
      "fullstack-ts":
        "https://github.com/cloudexpress/template-fullstack-typescript",
    };

    const templateUrl = templates[template];
    if (!templateUrl) {
      throw new Error(
        `Unknown template: ${template}. Available templates: ${Object.keys(templates).join(", ")}`,
      );
    }

    console.log(chalk.blue(`\n📋 Using template: ${template}`));

    return this.deployFromGit({
      repository: templateUrl,
      ...options,
    });
  }
}
