import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import { existsSync } from "fs";
import { detectRuntime } from "../lib/runtime-validator";
import { AWSDeployer } from "../lib/aws-deploy";
import { exec } from "child_process";
import { promisify } from "util";
import { validateAwsResourceName, validateAwsRegion } from "../utils/aws-validation";

const execAsync = promisify(exec);

export const deployAwsCommand = new Command("deploy:aws")
  .description("Deploy your application to AWS (demo mode)")
  .option("--rollback", "Rollback to previous deployment")
  .option("-n, --name <name>", "Application name (required)")
  .option("-r, --region <region>", "AWS region", "us-east-1")
  .option("-w, --watch", "Watch deployment logs")
  .action(async (options) => {
    if (options.rollback) {
      return handleAWSRollback(options);
    }

    try {
      // Validate app name
      if (!options.name) {
        console.error(
          chalk.red("Error: --name is required for AWS deployment"),
        );
        console.log("\nExample: cx deploy:aws --name my-app");
        process.exit(1);
      }

      // Strict AWS resource name validation
      const nameValidation = validateAwsResourceName(options.name);
      
      if (!nameValidation.isValid) {
        console.error(chalk.red("Error: Invalid app name"));
        console.error(chalk.red(`  App name ${nameValidation.errors.join(", ")}`));
        console.log("\nAWS resource naming requirements:");
        console.log("  • 3-63 characters long");
        console.log("  • Start with lowercase letter or number");
        console.log("  • Contain only lowercase letters, numbers, and hyphens");
        console.log("  • No consecutive hyphens or trailing hyphen");
        console.log("  • No AWS reserved prefixes (aws, amazon, s3, etc.)");
        console.log("\nExample: cx deploy:aws --name my-app-prod-v2");
        process.exit(1);
      }
      
      const appName = nameValidation.sanitized;
      
      // Validate region if provided
      if (options.region && !validateAwsRegion(options.region)) {
        console.error(chalk.red(`Error: Invalid AWS region "${options.region}"`));
        console.log("\nValid regions include:");
        console.log("  • us-east-1, us-west-2 (US regions)");
        console.log("  • eu-west-1, eu-central-1 (EU regions)");
        console.log("  • ap-southeast-1, ap-northeast-1 (Asia Pacific)");
        console.log("\nExample: cx deploy:aws --name my-app --region us-west-2");
        process.exit(1);
      }

      console.log(chalk.blue.bold(`\n🚀 Deploying ${appName} to AWS\n`));

      // Check for AWS credentials
      const credsSpinner = ora("Checking AWS credentials").start();
      try {
        await execAsync("aws sts get-caller-identity");
        credsSpinner.succeed("AWS credentials found");
      } catch (error) {
        credsSpinner.fail("AWS credentials not found");
        console.log("\nPlease configure AWS credentials:");
        console.log(chalk.cyan("  aws configure"));
        console.log("\nOr use environment variables:");
        console.log(chalk.cyan("  export AWS_ACCESS_KEY_ID=..."));
        console.log(chalk.cyan("  export AWS_SECRET_ACCESS_KEY=..."));
        process.exit(1);
      }

      // Detect runtime
      const runtimeSpinner = ora("Detecting application runtime").start();
      const runtime = await detectRuntime(process.cwd());

      if (!runtime) {
        runtimeSpinner.fail("Unsupported application type");
        console.log("\nSupported frameworks for v0.1:");
        console.log("  • Express (Node.js)");
        console.log("  • Next.js");
        process.exit(1);
      }

      runtimeSpinner.succeed(`Detected ${runtime.name} application`);

      // Check for Dockerfile or create one
      const dockerfilePath = path.join(process.cwd(), "Dockerfile");
      if (!existsSync(dockerfilePath)) {
        const dockerSpinner = ora("Creating Dockerfile").start();
        await createDockerfile(runtime.name, dockerfilePath);
        dockerSpinner.succeed("Dockerfile created");
      }

      // Initialize AWS deployer
      const deployer = new AWSDeployer(options.region);

      // Subscribe to events for progress updates
      let currentSpinner: any = null;

      deployer.on("step", (message: string) => {
        if (currentSpinner) currentSpinner.succeed();
        currentSpinner = ora(message).start();
      });

      deployer.on("log", (message: string) => {
        if (currentSpinner) {
          currentSpinner.text = message;
        } else {
          console.log(chalk.gray(`  ${message}`));
        }
      });

      deployer.on("build-output", (output: string) => {
        // Filter and format Docker build output
        const lines = output.split("\n").filter((line) => line.trim());
        for (const line of lines) {
          if (line.includes("Step") || line.includes("----->")) {
            process.stdout.write(chalk.gray(`  ${line.trim()}\n`));
          } else if (line.includes("Successfully")) {
            process.stdout.write(chalk.green(`  ✓ ${line.trim()}\n`));
          }
        }
      });

      deployer.on("stack-status", (status: string) => {
        if (currentSpinner) {
          currentSpinner.text = `CloudFormation: ${status}`;
        }
      });

      // Deploy
      const startTime = Date.now();
      const result = await deployer.deploy({
        appName,
        servicePort: runtime.run.port,
        healthCheckPath: runtime.health?.path || "/health",
        hostedZoneId: process.env.CX_HOSTED_ZONE_ID,
        certificateArn: process.env.CX_CERTIFICATE_ARN,
      });

      if (currentSpinner) currentSpinner.succeed();

      const duration = Math.round((Date.now() - startTime) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      // Success!
      console.log("\n" + chalk.green.bold("✅ Deployment complete!"));
      console.log("\nYour app is available at:");
      console.log(chalk.cyan.bold(`  ${result.url}`));
      console.log(chalk.gray(`\n✨ Finished in ${timeStr}`));

      // Additional info
      console.log("\nUseful commands:");
      console.log(
        chalk.gray(
          `  cx deploy:aws --name ${appName} --rollback    # Rollback`,
        ),
      );
      console.log(
        chalk.gray(
          `  cx logs ${appName} --aws                      # View logs`,
        ),
      );
      console.log(
        chalk.gray(
          `  cx status ${appName} --aws                    # Check status`,
        ),
      );

      // Store deployment info for later commands
      await storeDeploymentInfo(appName, result);
    } catch (error: any) {
      console.error(chalk.red("\nDeployment failed:"), error.message);
      if (error.stack && process.env.DEBUG) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

async function handleAWSRollback(options: any) {
  if (!options.name) {
    console.error(chalk.red("Error: --name is required for rollback"));
    process.exit(1);
  }

  // Apply same validation as deploy command
  const nameValidation = validateAwsResourceName(options.name);
  
  if (!nameValidation.isValid) {
    console.error(chalk.red("Error: Invalid app name"));
    console.error(chalk.red(`  App name ${nameValidation.errors.join(", ")}`));
    process.exit(1);
  }
  
  const appName = nameValidation.sanitized;
  
  // Validate region if provided
  if (options.region && !validateAwsRegion(options.region)) {
    console.error(chalk.red(`Error: Invalid AWS region "${options.region}"`));
    process.exit(1);
  }

  console.log(chalk.blue(`Rolling back ${appName}...\n`));

  try {
    const deployer = new AWSDeployer(options.region);
    await deployer.rollback(appName);

    console.log("\n" + chalk.green.bold("✅ Rollback complete!"));
    console.log(chalk.gray("\n✨ Reverted to previous version successfully"));
  } catch (error: any) {
    console.error(chalk.red("Rollback failed:"), error.message);
    process.exit(1);
  }
}

async function createDockerfile(runtime: string, filePath: string) {
  const { writeFileSync } = await import("fs");

  let content = "";

  if (runtime.startsWith("node")) {
    content = `FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./
COPY yarn.lock* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile --prod; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --production; \
    else \
      npm ci --only=production; \
    fi

# Copy application files
COPY . .

# Build if needed
RUN if [ -f "tsconfig.json" ]; then \
      npm run build || true; \
    fi

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
`;
  } else if (runtime === "nextjs-14") {
    content = `FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./
COPY yarn.lock* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# Copy application files
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
`;
  }

  writeFileSync(filePath, content);
}

async function storeDeploymentInfo(appName: string, result: any) {
  const { writeFileSync, mkdirSync } = await import("fs");
  const configDir = path.join(process.env.HOME || "", ".cygni");

  try {
    mkdirSync(configDir, { recursive: true });

    const deploymentInfo = {
      appName,
      ...result,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(
      path.join(configDir, `${appName}.deployment.json`),
      JSON.stringify(deploymentInfo, null, 2),
    );
  } catch (error) {
    // Non-critical, just log
    console.debug("Failed to store deployment info:", error);
  }
}
