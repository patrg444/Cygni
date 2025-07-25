import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { loadConfig } from "../utils/config";
import { validateAwsRegion } from "../utils/aws-validation";
import { detectFramework } from "../utils/framework-detector";
import { getApiClient } from "../lib/api-client";

const execAsync = promisify(exec);

interface DiagnosticCheck {
  name: string;
  description: string;
  category: "environment" | "aws" | "project" | "network" | "dependencies";
  check: () => Promise<{ success: boolean; message: string; fix?: string }>;
}

export const doctorCommand = new Command("doctor")
  .description("Run pre-deployment diagnostics and suggest fixes")
  .option("-p, --project <project>", "Project name or ID")
  .option("--fix", "Attempt to automatically fix issues")
  .option("--category <category>", "Run only specific category of checks")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    const spinner = ora("Running diagnostics...").start();
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
      },
    };

    try {
      const config = await loadConfig().catch(() => null);
      
      // Define all diagnostic checks
      const checks: DiagnosticCheck[] = [
        // Environment checks
        {
          name: "Node.js Version",
          description: "Check Node.js version compatibility",
          category: "environment",
          check: async () => {
            const { stdout } = await execAsync("node --version");
            const version = stdout.trim();
            const versionParts = version.split(".");
            const major = parseInt(versionParts[0]?.replace("v", "") || "0");
            
            if (major >= 18) {
              return { success: true, message: `Node.js ${version} (supported)` };
            } else if (major >= 16) {
              return { 
                success: true, 
                message: `Node.js ${version} (supported but consider upgrading to 18+)` 
              };
            } else {
              return { 
                success: false, 
                message: `Node.js ${version} is too old`,
                fix: "Install Node.js 18 or higher: https://nodejs.org" 
              };
            }
          },
        },
        
        {
          name: "Docker",
          description: "Check if Docker is installed and running",
          category: "environment",
          check: async () => {
            try {
              const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'");
              return { success: true, message: `Docker ${stdout.trim()} is running` };
            } catch (error) {
              return { 
                success: false, 
                message: "Docker is not running or not installed",
                fix: "Install Docker Desktop: https://www.docker.com/products/docker-desktop" 
              };
            }
          },
        },

        // AWS checks
        {
          name: "AWS CLI",
          description: "Check AWS CLI installation",
          category: "aws",
          check: async () => {
            try {
              const { stdout } = await execAsync("aws --version");
              return { success: true, message: stdout.trim() };
            } catch (error) {
              return { 
                success: false, 
                message: "AWS CLI not installed",
                fix: "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" 
              };
            }
          },
        },

        {
          name: "AWS Credentials",
          description: "Check AWS credentials configuration",
          category: "aws",
          check: async () => {
            try {
              const { stdout } = await execAsync("aws sts get-caller-identity");
              const identity = JSON.parse(stdout);
              return { 
                success: true, 
                message: `Authenticated as ${identity.Arn}` 
              };
            } catch (error) {
              return { 
                success: false, 
                message: "AWS credentials not configured",
                fix: "Run 'aws configure' or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables" 
              };
            }
          },
        },

        {
          name: "AWS Region",
          description: "Check AWS region configuration",
          category: "aws",
          check: async () => {
            try {
              const { stdout } = await execAsync("aws configure get region");
              const region = stdout.trim();
              
              if (!region) {
                return { 
                  success: false, 
                  message: "No default region configured",
                  fix: "Run 'aws configure set region us-east-1' or set AWS_DEFAULT_REGION" 
                };
              }
              
              if (!validateAwsRegion(region)) {
                return { 
                  success: false, 
                  message: `Invalid region: ${region}`,
                  fix: "Set a valid AWS region" 
                };
              }
              
              return { success: true, message: `Default region: ${region}` };
            } catch (error) {
              return { 
                success: false, 
                message: "Could not determine AWS region",
                fix: "Configure AWS region" 
              };
            }
          },
        },

        {
          name: "AWS Service Quotas",
          description: "Check critical AWS service quotas",
          category: "aws",
          check: async () => {
            try {
              // Check ECS task quota
              const { stdout } = await execAsync(
                "aws service-quotas get-service-quota --service-code ecs --quota-code L-E0F9C6B5 2>/dev/null || echo '{}'"
              );
              
              const quota = stdout.trim() ? JSON.parse(stdout) : null;
              if (quota && quota.Quota) {
                const limit = quota.Quota.Value;
                return { 
                  success: true, 
                  message: `ECS task limit: ${limit} (sufficient for most deployments)` 
                };
              }
              
              return { 
                success: true, 
                message: "Service quotas accessible (limits vary by account)" 
              };
            } catch (error) {
              return { 
                success: true, 
                message: "Unable to check quotas (requires permissions)" 
              };
            }
          },
        },

        // Project checks
        {
          name: "Project Configuration",
          description: "Check Cygni project configuration",
          category: "project",
          check: async () => {
            if (!config) {
              return { 
                success: false, 
                message: "No Cygni configuration found",
                fix: "Run 'cx init' to initialize a project" 
              };
            }
            
            if (!config.projectId) {
              return { 
                success: false, 
                message: "No project ID in configuration",
                fix: "Run 'cx init' to set up project" 
              };
            }
            
            return { 
              success: true, 
              message: `Project configured: ${config.projectId}` 
            };
          },
        },

        {
          name: "Framework Detection",
          description: "Detect and validate project framework",
          category: "project",
          check: async () => {
            try {
              const framework = await detectFramework(process.cwd());
              
              if (!framework) {
                return { 
                  success: false, 
                  message: "No supported framework detected",
                  fix: "Ensure package.json exists with valid framework dependencies" 
                };
              }
              
              return { 
                success: true, 
                message: `Detected framework: ${(framework as any).name} (${(framework as any).language})` 
              };
            } catch (error) {
              return { 
                success: false, 
                message: "Error detecting framework",
                fix: "Check package.json is valid" 
              };
            }
          },
        },

        {
          name: "Build Configuration",
          description: "Check build script configuration",
          category: "project",
          check: async () => {
            try {
              const packageJsonPath = path.join(process.cwd(), "package.json");
              const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
              
              if (!packageJson.scripts) {
                return { 
                  success: false, 
                  message: "No scripts section in package.json",
                  fix: "Add a 'build' script to package.json" 
                };
              }
              
              if (!packageJson.scripts.build && !packageJson.scripts.start) {
                return { 
                  success: false, 
                  message: "No build or start script found",
                  fix: "Add 'build' and/or 'start' scripts to package.json" 
                };
              }
              
              return { 
                success: true, 
                message: "Build configuration found" 
              };
            } catch (error) {
              return { 
                success: false, 
                message: "No package.json found",
                fix: "Ensure you're in a valid Node.js project directory" 
              };
            }
          },
        },

        // Network checks
        {
          name: "API Connectivity",
          description: "Check connection to Cygni API",
          category: "network",
          check: async () => {
            try {
              const api = await getApiClient();
              const { data } = await api.get("/health");
              return { 
                success: true, 
                message: `API healthy: ${data.status}` 
              };
            } catch (error) {
              return { 
                success: false, 
                message: "Cannot connect to Cygni API",
                fix: "Check internet connection and API status at https://status.cygni.dev" 
              };
            }
          },
        },

        {
          name: "DNS Resolution",
          description: "Check DNS resolution for deployment domains",
          category: "network",
          check: async () => {
            try {
              await execAsync("nslookup cx-apps.com");
              return { success: true, message: "DNS resolution working" };
            } catch (error) {
              return { 
                success: false, 
                message: "DNS resolution issues detected",
                fix: "Check your network DNS settings" 
              };
            }
          },
        },

        // Dependencies checks
        {
          name: "Git Repository",
          description: "Check Git repository status",
          category: "dependencies",
          check: async () => {
            try {
              const { stdout: isRepo } = await execAsync("git rev-parse --is-inside-work-tree");
              
              if (isRepo.trim() !== "true") {
                return { 
                  success: false, 
                  message: "Not a Git repository",
                  fix: "Initialize with 'git init'" 
                };
              }
              
              const { stdout: gitStatus } = await execAsync("git status --porcelain");
              
              if (gitStatus.trim()) {
                return { 
                  success: true, 
                  message: "Git repository has uncommitted changes (this is okay)" 
                };
              }
              
              return { success: true, message: "Git repository clean" };
            } catch (error) {
              return { 
                success: false, 
                message: "Git not installed or not a repository",
                fix: "Install Git and run 'git init'" 
              };
            }
          },
        },

        {
          name: "Disk Space",
          description: "Check available disk space",
          category: "environment",
          check: async () => {
            try {
              const { stdout } = await execAsync("df -h . | tail -1");
              const parts = stdout.trim().split(/\s+/);
              const available = parts[3] || "unknown";
              const percentage = parseInt(parts[4] || "0");
              
              if (percentage > 90) {
                return { 
                  success: false, 
                  message: `Only ${available} available (${percentage}% used)`,
                  fix: "Free up disk space for Docker images" 
                };
              }
              
              return { 
                success: true, 
                message: `${available} available (${percentage}% used)` 
              };
            } catch (error) {
              return { success: true, message: "Unable to check disk space" };
            }
          },
        },
      ];

      // Filter checks by category if specified
      const checksToRun = options.category
        ? checks.filter(c => c.category === options.category)
        : checks;

      // Run all checks
      for (const check of checksToRun) {
        spinner.text = `Checking ${check.name}...`;
        
        try {
          const result = await check.check();
          
          results.checks.push({
            name: check.name,
            description: check.description,
            category: check.category,
            ...result,
          });
          
          results.summary.total++;
          if (result.success) {
            results.summary.passed++;
          } else {
            results.summary.failed++;
          }
        } catch (error: any) {
          results.checks.push({
            name: check.name,
            description: check.description,
            category: check.category,
            success: false,
            message: error.message || "Check failed",
          });
          
          results.summary.total++;
          results.summary.failed++;
        }
      }

      spinner.stop();

      // Output results
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Display formatted results
      console.log(chalk.bold("\n🩺 Cygni Doctor - Pre-deployment Diagnostics\n"));

      // Group results by category
      const categories = ["environment", "aws", "project", "network", "dependencies"];
      
      for (const category of categories) {
        const categoryChecks = results.checks.filter((c: any) => c.category === category);
        
        if (categoryChecks.length === 0) continue;
        
        console.log(chalk.bold.blue(`\n${category.charAt(0).toUpperCase() + category.slice(1)}:`));
        
        for (const check of categoryChecks) {
          const icon = check.success ? chalk.green("✓") : chalk.red("✗");
          const name = check.success ? chalk.green(check.name) : chalk.red(check.name);
          
          console.log(`  ${icon} ${name}`);
          console.log(chalk.gray(`    ${check.message}`));
          
          if (!check.success && check.fix) {
            console.log(chalk.yellow(`    → Fix: ${check.fix}`));
          }
        }
      }

      // Summary
      console.log(chalk.bold("\n📊 Summary:"));
      console.log(`  Total checks: ${results.summary.total}`);
      console.log(chalk.green(`  Passed: ${results.summary.passed}`));
      
      if (results.summary.failed > 0) {
        console.log(chalk.red(`  Failed: ${results.summary.failed}`));
      }

      // Overall status
      console.log("");
      if (results.summary.failed === 0) {
        console.log(chalk.green.bold("✅ All checks passed! You're ready to deploy."));
        console.log(chalk.gray("\nRun 'cx deploy' to deploy your application."));
      } else if (results.summary.failed <= 2) {
        console.log(chalk.yellow.bold("⚠️  Minor issues detected."));
        console.log(chalk.gray("\nYou can still deploy, but fixing these issues is recommended."));
      } else {
        console.log(chalk.red.bold("❌ Multiple issues detected."));
        console.log(chalk.gray("\nPlease fix the issues above before deploying."));
        
        if (options.fix) {
          console.log(chalk.yellow("\n🔧 Auto-fix was requested but not all issues can be fixed automatically."));
        }
      }

      // Quick actions
      console.log(chalk.bold("\n🚀 Next Steps:"));
      
      if (!config) {
        console.log(chalk.cyan("  1. Initialize project: cx init"));
        console.log(chalk.cyan("  2. Configure AWS: cx setup aws"));
        console.log(chalk.cyan("  3. Deploy: cx deploy"));
      } else if (results.summary.failed === 0) {
        console.log(chalk.cyan("  • Deploy your app: cx deploy"));
        console.log(chalk.cyan("  • Preview costs: cx deploy --preview"));
      } else {
        console.log(chalk.cyan("  • Fix the issues above"));
        console.log(chalk.cyan("  • Run 'cx doctor' again to verify"));
        console.log(chalk.cyan("  • Deploy when ready: cx deploy"));
      }

      // Exit with appropriate code
      process.exit(results.summary.failed > 2 ? 1 : 0);
      
    } catch (error: any) {
      spinner.stop();
      console.error(chalk.red("Error running diagnostics:"), error.message);
      process.exit(1);
    }
  });