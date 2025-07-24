/**
 * Multi-Service Deployer
 * Handles deploying multiple services with proper orchestration
 */

import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs/promises";
import axios from "axios";
import { ServiceInfo } from "./fullstack-analyzer";
import { execSync } from "child_process";
import {
  ECRClient,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import {
  ECSClient,
  UpdateServiceCommand,
  DescribeServicesCommand,
  RegisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import * as mime from "mime-types";

/**
 * CDK Stack outputs for AWS deployment
 * @interface CDKOutputs
 */
export interface CDKOutputs {
  /** ECR repository URI for backend Docker images */
  ECRRepositoryUri: string;
  /** ECS cluster name */
  ECSClusterName: string;
  /** ECS service name */
  ECSServiceName: string;
  /** S3 bucket name for frontend assets */
  FrontendBucketName: string;
  /** CloudFront distribution ID */
  CloudFrontDistributionId: string;
  /** CloudFront URL for accessing the application */
  CloudFrontUrl: string;
  /** Load balancer URL for backend API */
  LoadBalancerUrl: string;
  /** Database endpoint */
  DatabaseEndpoint?: string;
  /** Database secret ARN */
  DatabaseSecretArn?: string;
}

/**
 * Configuration for deployment target.
 * @interface DeploymentTarget
 */
export interface DeploymentTarget {
  /** Deployment provider */
  provider: "cloudexpress" | "aws" | "vercel" | "netlify";
  /** Target region for deployment */
  region?: string;
  /** Deployment environment */
  environment?: "development" | "staging" | "production";
}

/**
 * Tracks the deployment status of a single service.
 * @interface ServiceDeployment
 */
export interface ServiceDeployment {
  /** Service being deployed */
  service: ServiceInfo;
  /** Deployed URL once available */
  url?: string;
  /** Current deployment status */
  status: "pending" | "deploying" | "deployed" | "failed";
  /** Error message if deployment failed */
  error?: string;
  /** Deployment start timestamp */
  startTime?: number;
  /** Deployment end timestamp */
  endTime?: number;
}

/**
 * Overall result of deploying multiple services.
 * @interface DeploymentResult
 */
export interface DeploymentResult {
  /** Whether all deployments succeeded */
  success: boolean;
  /** Individual deployment results */
  deployments: ServiceDeployment[];
  /** Deployed service URLs */
  urls: {
    /** Frontend service URL */
    frontend?: string;
    /** Backend service URL */
    backend?: string;
    /** API endpoint URL */
    api?: string;
  };
  /** Total deployment duration in milliseconds */
  duration: number;
}

/**
 * Orchestrates deployment of multiple services with proper dependency management.
 * Deploys backend services first, then injects their URLs into frontend deployments.
 *
 * @example
 * ```typescript
 * const deployer = new MultiServiceDeployer(services);
 * const result = await deployer.deploy({
 *   provider: 'cloudexpress',
 *   environment: 'production'
 * });
 *
 * console.log('Frontend URL:', result.urls.frontend);
 * console.log('Backend URL:', result.urls.backend);
 * ```
 *
 * @class MultiServiceDeployer
 */
export class MultiServiceDeployer {
  private services: ServiceInfo[];
  private deployments: Map<string, ServiceDeployment> = new Map();
  private apiBaseUrl: string;
  private currentEnvironment?: string;
  private cdkOutputs?: CDKOutputs;

  /**
   * Creates a new MultiServiceDeployer instance.
   * @param {ServiceInfo[]} services - Services to deploy
   * @param {string} [apiBaseUrl] - Optional API base URL (defaults to CloudExpress API)
   */
  constructor(services: ServiceInfo[], apiBaseUrl?: string) {
    this.services = services;
    // Use test server URL if available (for testing), otherwise use production
    this.apiBaseUrl =
      apiBaseUrl ||
      process.env.CLOUDEXPRESS_API_URL ||
      "https://api.cloudexpress.io";
  }

  /**
   * Loads the build manifest if available.
   * The manifest contains build artifacts and metadata from the build phase.
   *
   * @returns {Promise<void>}
   */
  async loadBuildManifest(): Promise<void> {
    try {
      const manifestPath = path.join(process.cwd(), "build-manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      JSON.parse(content); // Just validate it's valid JSON
    } catch {
      // No manifest available
    }
  }

  /**
   * Loads CDK outputs from deployment.
   * Reads outputs from either cdk.outputs.json or environment variables.
   *
   * @returns {Promise<void>}
   */
  async loadCDKOutputs(): Promise<void> {
    // First try to read from cdk.outputs.json
    try {
      const outputsPath = path.join(
        process.cwd(),
        "packages",
        "infra",
        "cdk.outputs.json"
      );
      const content = await fs.readFile(outputsPath, "utf-8");
      const outputs = JSON.parse(content);
      
      // Extract outputs from the CDK format
      const stackName = Object.keys(outputs)[0];
      if (stackName && outputs[stackName]) {
        this.cdkOutputs = outputs[stackName];
        console.log(chalk.gray("✓ Loaded CDK outputs from cdk.outputs.json"));
        return;
      }
    } catch {
      // File not found or invalid format
    }

    // Fallback to environment variables
    if (
      process.env.CYGNI_ECR_REPO &&
      process.env.CYGNI_ECS_CLUSTER &&
      process.env.CYGNI_FRONTEND_BUCKET
    ) {
      this.cdkOutputs = {
        ECRRepositoryUri: process.env.CYGNI_ECR_REPO,
        ECSClusterName: process.env.CYGNI_ECS_CLUSTER,
        ECSServiceName: process.env.CYGNI_ECS_SERVICE || "",
        FrontendBucketName: process.env.CYGNI_FRONTEND_BUCKET,
        CloudFrontDistributionId: process.env.CYGNI_CLOUDFRONT_ID || "",
        CloudFrontUrl: process.env.CYGNI_CLOUDFRONT_URL || "",
        LoadBalancerUrl: process.env.CYGNI_LOAD_BALANCER_URL || "",
        DatabaseEndpoint: process.env.CYGNI_DATABASE_ENDPOINT,
        DatabaseSecretArn: process.env.CYGNI_DATABASE_SECRET_ARN,
      };
      console.log(chalk.gray("✓ Loaded CDK outputs from environment variables"));
    }
  }

  /**
   * Deploys all services in the correct order.
   * Backend services are deployed first, then their URLs are injected into frontend deployments.
   *
   * @param {DeploymentTarget} target - Deployment configuration
   * @returns {Promise<DeploymentResult>} Complete deployment results
   */
  async deploy(target: DeploymentTarget): Promise<DeploymentResult> {
    const startTime = Date.now();
    await this.loadBuildManifest();

    // Load CDK outputs if deploying to AWS
    if (target.provider === "aws") {
      await this.loadCDKOutputs();
      if (!this.cdkOutputs) {
        throw new Error(
          "AWS deployment requires CDK outputs. Please deploy the infrastructure stack first or set environment variables."
        );
      }
    }

    // Store the environment for use in deployment
    this.currentEnvironment = target.environment;

    console.log(chalk.bold("\n🚀 Deploying services...\n"));

    // Initialize deployments
    for (const service of this.services) {
      this.deployments.set(service.name, {
        service,
        status: "pending",
      });
    }

    // Deploy backend first, then frontend
    const backendServices = this.services.filter((s) => s.type === "backend");
    const frontendServices = this.services.filter((s) => s.type === "frontend");
    const fullstackServices = this.services.filter(
      (s) => s.type === "fullstack",
    );

    // Deploy in order
    const deployOrder = [
      ...backendServices,
      ...fullstackServices,
      ...frontendServices,
    ];

    // Track deployed backend URLs for frontend env injection
    const backendUrls: Record<string, string> = {};

    for (const service of deployOrder) {
      const deployment = this.deployments.get(service.name)!;
      deployment.status = "deploying";
      deployment.startTime = Date.now();

      try {
        // Inject backend URLs into frontend deployments
        const envVars: Record<string, string> = {};
        if (
          service.type === "frontend" &&
          Object.keys(backendUrls).length > 0
        ) {
          // Find the primary backend URL
          const primaryBackend = backendServices[0]?.name;
          if (primaryBackend && backendUrls[primaryBackend]) {
            envVars.API_URL = backendUrls[primaryBackend];

            // Framework-specific env vars
            const envPrefix = this.getEnvPrefix(service.framework);
            if (envPrefix) {
              envVars[`${envPrefix}API_URL`] = backendUrls[primaryBackend];
            }
          }
        }

        const url = await this.deployService(service, target, envVars);

        deployment.status = "deployed";
        deployment.url = url;
        deployment.endTime = Date.now();

        // Store backend URL for frontend use
        if (service.type === "backend" || service.type === "fullstack") {
          backendUrls[service.name] = url;
        }

        console.log(chalk.green(`✓ ${service.name} deployed to ${url}`));
      } catch (error: any) {
        deployment.status = "failed";
        deployment.error = error.message;
        deployment.endTime = Date.now();

        console.error(
          chalk.red(`✗ ${service.name} deployment failed: ${error.message}`),
        );
      }
    }

    // Generate result
    const deploymentsList = Array.from(this.deployments.values());
    const successCount = deploymentsList.filter(
      (d) => d.status === "deployed",
    ).length;
    const failedCount = deploymentsList.filter(
      (d) => d.status === "failed",
    ).length;

    // Determine URLs
    const frontendDeployment = deploymentsList.find(
      (d) => d.service.type === "frontend" && d.url,
    );
    const backendDeployment = deploymentsList.find(
      (d) => d.service.type === "backend" && d.url,
    );

    const result: DeploymentResult = {
      success: failedCount === 0,
      deployments: deploymentsList,
      urls: {
        frontend: frontendDeployment?.url,
        backend: backendDeployment?.url,
        api: backendDeployment?.url,
      },
      duration: Date.now() - startTime,
    };

    // Summary
    console.log(chalk.bold("\n📊 Deployment Summary:"));
    console.log(
      chalk.green(`  ✓ ${successCount} services deployed successfully`),
    );
    if (failedCount > 0) {
      console.log(chalk.red(`  ✗ ${failedCount} services failed to deploy`));
    }

    if (result.urls.frontend || result.urls.backend) {
      console.log(chalk.bold("\n🌐 Live URLs:"));
      if (result.urls.frontend) {
        console.log(`  Frontend: ${chalk.cyan(result.urls.frontend)}`);
      }
      if (result.urls.backend) {
        console.log(`  Backend:  ${chalk.cyan(result.urls.backend)}`);
      }
    }

    // Save deployment manifest
    await this.saveDeploymentManifest(result);

    return result;
  }

  /**
   * Deploys a single service to the specified provider.
   * Handles provider-specific deployment logic.
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {DeploymentTarget} target - Deployment target configuration
   * @param {Record<string, string>} envVars - Environment variables to inject
   * @returns {Promise<string>} The deployed service URL
   */
  private async deployService(
    service: ServiceInfo,
    target: DeploymentTarget,
    envVars: Record<string, string> = {},
  ): Promise<string> {
    const spinner = ora(
      `Deploying ${service.name} to ${target.provider}`,
    ).start();

    try {
      // Simulate deployment based on provider
      // In real implementation, this would call actual deployment APIs

      if (target.provider === "cloudexpress") {
        // CloudExpress deployment
        return await this.deployToCloudExpress(service, envVars);
      } else if (target.provider === "aws") {
        // AWS deployment
        return await this.deployToAWS(service, envVars);
      } else if (target.provider === "vercel" && service.type === "frontend") {
        // Vercel deployment
        return await this.deployToVercel(service, envVars);
      } else if (target.provider === "netlify" && service.type === "frontend") {
        // Netlify deployment
        return await this.deployToNetlify(service, envVars);
      }

      throw new Error(`Unsupported deployment target: ${target.provider}`);
    } finally {
      spinner.stop();
    }
  }

  /**
   * Deploys a service to CloudExpress.
   * Uses the CloudExpress API for real deployments in test mode.
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<string>} The deployed service URL
   */
  private async deployToCloudExpress(
    service: ServiceInfo,
    envVars: Record<string, string>,
  ): Promise<string> {
    try {
      // First, check if we're in test mode
      const isTestMode =
        this.apiBaseUrl.includes("localhost") ||
        this.apiBaseUrl.includes("127.0.0.1");

      if (isTestMode) {
        // Use the new CloudExpress deployment API
        return await this.deployViaCloudExpressAPI(service, envVars);
      } else {
        // Fallback to simulation for non-test environments
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const subdomain = service.type === "frontend" ? "app" : "api";
        return `https://${subdomain}-${Math.random().toString(36).substr(2, 9)}.cloudexpress.io`;
      }
    } catch (error: any) {
      throw new Error(`CloudExpress deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploys via the CloudExpress API.
   * Used when connected to a real CloudExpress backend (test server).
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<string>} The deployed service URL
   * @throws {Error} If deployment fails or times out
   */
  private async deployViaCloudExpressAPI(
    service: ServiceInfo,
    envVars: Record<string, string>,
  ): Promise<string> {
    // Load cloudexpress.yaml
    const configPath = path.join(process.cwd(), "cloudexpress.yaml");
    const configContent = await fs.readFile(configPath, "utf-8");
    const cloudexpressConfig = this.parseYaml(configContent);

    // Create deployment if this is the first service
    if (!this.currentDeploymentId) {
      const response = await axios.post(`${this.apiBaseUrl}/deployments`, {
        cloudexpressConfig,
        environment: this.currentEnvironment || "production",
        provider: "cloudexpress",
      });

      this.currentDeploymentId = response.data.deploymentId;
    }

    // Upload artifacts (simulate)
    await axios.post(
      `${this.apiBaseUrl}/deployments/${this.currentDeploymentId}/artifacts`,
      {
        serviceName: service.name,
        artifacts: {
          buildPath: path.join(service.path, "build"),
          envVars,
        },
      },
    );

    // Poll for completion
    const maxAttempts = 20;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const statusResponse = await axios.get(
        `${this.apiBaseUrl}/deployments/${this.currentDeploymentId}/status`,
      );
      const deployment = statusResponse.data;

      const serviceStatus = deployment.services.find(
        (s: any) => s.name === service.name,
      );

      if (serviceStatus?.status === "completed" && serviceStatus.url) {
        return serviceStatus.url;
      } else if (serviceStatus?.status === "failed") {
        throw new Error(serviceStatus.error || "Deployment failed");
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Deployment timed out");
  }

  private currentDeploymentId?: string;

  /**
   * Simple YAML parser for cloudexpress.yaml.
   * Parses basic YAML structure for deployment configuration.
   *
   * @private
   * @param {string} content - YAML content to parse
   * @returns {any} Parsed configuration object
   */
  private parseYaml(content: string): any {
    // Very basic YAML parsing - in production use a proper YAML parser
    const lines = content.split("\n");
    const result: any = { services: [] };
    let currentService: any = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("version:")) {
        result.version =
          trimmed.split(":")[1]?.trim().replace(/['"]/g, "") || "1.0";
      } else if (trimmed.startsWith("- name:")) {
        if (currentService) result.services.push(currentService);
        currentService = { name: trimmed.split(":")[1]?.trim() || "" };
      } else if (currentService && trimmed.startsWith("type:")) {
        currentService.type = trimmed.split(":")[1]?.trim() || "";
      } else if (currentService && trimmed.startsWith("path:")) {
        currentService.path = trimmed.split(":")[1]?.trim() || "";
      }
    }

    if (currentService) result.services.push(currentService);
    return result;
  }

  /**
   * Deploys a service to AWS.
   * Handles both frontend (S3/CloudFront) and backend (ECS) deployments.
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<string>} The deployed service URL
   */
  private async deployToAWS(
    service: ServiceInfo,
    envVars: Record<string, string>,
  ): Promise<string> {
    if (!this.cdkOutputs) {
      throw new Error("CDK outputs not loaded");
    }

    if (service.type === "backend" || service.type === "fullstack") {
      return await this.deployBackendToECS(service, envVars);
    } else if (service.type === "frontend") {
      return await this.deployFrontendToS3CloudFront(service, envVars);
    } else {
      throw new Error(`Unsupported service type: ${service.type}`);
    }
  }

  /**
   * Deploys a backend service to ECS.
   * Builds Docker image, pushes to ECR, and updates ECS service.
   *
   * @private
   * @param {ServiceInfo} service - Backend service to deploy
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<string>} The load balancer URL
   */
  private async deployBackendToECS(
    service: ServiceInfo,
    envVars: Record<string, string>,
  ): Promise<string> {
    const spinner = ora(`Deploying ${service.name} to ECS`).start();

    try {
      // 1. Build and push Docker image to ECR
      spinner.text = `Building Docker image for ${service.name}`;
      const imageUri = await this.buildAndPushDockerImage(service);

      // 2. Update ECS service with new image
      spinner.text = `Updating ECS service for ${service.name}`;
      await this.updateECSService(imageUri, envVars);

      spinner.succeed(`Successfully deployed ${service.name} to ECS`);
      return this.cdkOutputs!.LoadBalancerUrl;
    } catch (error: any) {
      spinner.fail(`Failed to deploy ${service.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Builds and pushes a Docker image to ECR.
   *
   * @private
   * @param {ServiceInfo} service - Service to build
   * @returns {Promise<string>} The ECR image URI with tag
   */
  private async buildAndPushDockerImage(service: ServiceInfo): Promise<string> {
    const region = process.env.AWS_REGION || "us-east-1";
    const repoUri = this.cdkOutputs!.ECRRepositoryUri;
    const tag = `deploy-${Date.now()}`;
    const imageUri = `${repoUri}:${tag}`;

    // Get ECR login token
    const ecrClient = new ECRClient({ region });
    const authResponse = await ecrClient.send(
      new GetAuthorizationTokenCommand({})
    );
    
    if (!authResponse.authorizationData?.[0]?.authorizationToken) {
      throw new Error("Failed to get ECR authorization token");
    }

    const authToken = Buffer.from(
      authResponse.authorizationData[0].authorizationToken,
      "base64"
    ).toString("utf-8");
    const [username, password] = authToken.split(":");
    const registryUrl = repoUri.split("/")[0];

    // Docker login to ECR
    console.log(chalk.gray("  → Logging in to ECR"));
    execSync(
      `docker login --username ${username} --password-stdin ${registryUrl}`,
      {
        input: password,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Check if Dockerfile exists
    const dockerfilePath = path.join(service.path, "Dockerfile");
    try {
      await fs.access(dockerfilePath);
    } catch {
      // Create a default Dockerfile if it doesn't exist
      await this.createDefaultDockerfile(service);
    }

    // Build Docker image
    console.log(chalk.gray(`  → Building Docker image: ${imageUri}`));
    execSync(`docker build -t ${imageUri} .`, {
      cwd: service.path,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Push to ECR
    console.log(chalk.gray(`  → Pushing image to ECR`));
    execSync(`docker push ${imageUri}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    return imageUri;
  }

  /**
   * Creates a default Dockerfile for Node.js services.
   *
   * @private
   * @param {ServiceInfo} service - Service needing a Dockerfile
   * @returns {Promise<void>}
   */
  private async createDefaultDockerfile(service: ServiceInfo): Promise<void> {
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build if needed
RUN npm run build || true

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
`;

    await fs.writeFile(path.join(service.path, "Dockerfile"), dockerfile);
    console.log(chalk.gray("  → Created default Dockerfile"));
  }

  /**
   * Updates ECS service with new Docker image.
   *
   * @private
   * @param {string} imageUri - ECR image URI
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<void>}
   */
  private async updateECSService(
    imageUri: string,
    envVars: Record<string, string>,
  ): Promise<void> {
    const region = process.env.AWS_REGION || "us-east-1";
    const ecsClient = new ECSClient({ region });
    
    // Get current task definition
    const describeResponse = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: this.cdkOutputs!.ECSClusterName,
        services: [this.cdkOutputs!.ECSServiceName],
      })
    );

    const service = describeResponse.services?.[0];
    if (!service || !service.taskDefinition) {
      throw new Error("Failed to get current task definition");
    }

    // Get task definition details
    const taskDefResponse = await ecsClient.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: service.taskDefinition,
      })
    );

    const taskDef = taskDefResponse.taskDefinition;
    if (!taskDef) {
      throw new Error("Failed to get task definition details");
    }

    // Update container definition with new image and env vars
    const containerDef = taskDef.containerDefinitions?.[0];
    if (!containerDef) {
      throw new Error("No container definitions found");
    }

    containerDef.image = imageUri;
    containerDef.environment = [
      ...(containerDef.environment || []),
      ...Object.entries(envVars).map(([name, value]) => ({ name, value })),
    ];

    // Register new task definition
    const registerResponse = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        family: taskDef.family,
        taskRoleArn: taskDef.taskRoleArn,
        executionRoleArn: taskDef.executionRoleArn,
        networkMode: taskDef.networkMode,
        containerDefinitions: taskDef.containerDefinitions,
        requiresCompatibilities: taskDef.requiresCompatibilities,
        cpu: taskDef.cpu,
        memory: taskDef.memory,
      })
    );

    if (!registerResponse.taskDefinition) {
      throw new Error("Failed to register new task definition");
    }

    // Update service to use new task definition
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: this.cdkOutputs!.ECSClusterName,
        service: this.cdkOutputs!.ECSServiceName,
        taskDefinition: registerResponse.taskDefinition.taskDefinitionArn,
        forceNewDeployment: true,
      })
    );

    console.log(chalk.gray("  → ECS service updated successfully"));
  }

  /**
   * Deploys a frontend to S3 and CloudFront.
   *
   * @private
   * @param {ServiceInfo} service - Frontend service to deploy
   * @param {Record<string, string>} envVars - Environment variables
   * @returns {Promise<string>} The CloudFront URL
   */
  private async deployFrontendToS3CloudFront(
    service: ServiceInfo,
    _envVars: Record<string, string>,
  ): Promise<string> {
    const spinner = ora(`Deploying ${service.name} to S3/CloudFront`).start();

    try {
      // 1. Upload build artifacts to S3
      spinner.text = `Uploading ${service.name} to S3`;
      await this.uploadToS3(service);

      // 2. Invalidate CloudFront cache
      spinner.text = `Invalidating CloudFront cache`;
      await this.invalidateCloudFront();

      spinner.succeed(`Successfully deployed ${service.name} to CloudFront`);
      return this.cdkOutputs!.CloudFrontUrl;
    } catch (error: any) {
      spinner.fail(`Failed to deploy ${service.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Uploads frontend build artifacts to S3.
   *
   * @private
   * @param {ServiceInfo} service - Frontend service
   * @returns {Promise<void>}
   */
  private async uploadToS3(service: ServiceInfo): Promise<void> {
    const region = process.env.AWS_REGION || "us-east-1";
    const s3Client = new S3Client({ region });
    const bucketName = this.cdkOutputs!.FrontendBucketName;

    // Find build directory
    const buildDirs = ["dist", "build", "out", ".next/static"];
    let buildDir: string | null = null;
    
    for (const dir of buildDirs) {
      const fullPath = path.join(service.path, dir);
      try {
        await fs.access(fullPath);
        buildDir = fullPath;
        break;
      } catch {
        // Directory doesn't exist
      }
    }

    if (!buildDir) {
      throw new Error("No build directory found. Please build the frontend first.");
    }

    // Upload all files
    await this.uploadDirectory(buildDir, bucketName, "", s3Client);
    console.log(chalk.gray("  → Frontend uploaded to S3"));
  }

  /**
   * Recursively uploads a directory to S3.
   *
   * @private
   * @param {string} dirPath - Local directory path
   * @param {string} bucketName - S3 bucket name
   * @param {string} prefix - S3 key prefix
   * @param {S3Client} s3Client - S3 client instance
   * @returns {Promise<void>}
   */
  private async uploadDirectory(
    dirPath: string,
    bucketName: string,
    prefix: string,
    s3Client: S3Client,
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.uploadDirectory(fullPath, bucketName, key, s3Client);
      } else {
        const fileContent = await fs.readFile(fullPath);
        const contentType = mime.lookup(fullPath) || "application/octet-stream";

        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fileContent,
            ContentType: contentType,
            CacheControl: key.match(/\.(js|css|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot)$/)
              ? "public, max-age=31536000, immutable"
              : "public, max-age=0, must-revalidate",
          })
        );
      }
    }
  }

  /**
   * Invalidates CloudFront distribution cache.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async invalidateCloudFront(): Promise<void> {
    const region = process.env.AWS_REGION || "us-east-1";
    const cloudFrontClient = new CloudFrontClient({ region });

    await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: this.cdkOutputs!.CloudFrontDistributionId,
        InvalidationBatch: {
          CallerReference: `deploy-${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ["/*"],
          },
        },
      })
    );

    console.log(chalk.gray("  → CloudFront cache invalidated"));
  }

  /**
   * Deploys a frontend service to Vercel.
   * Currently simulates deployment for demonstration.
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {Record<string, string>} _envVars - Environment variables (unused in simulation)
   * @returns {Promise<string>} The simulated Vercel URL
   */
  private async deployToVercel(
    service: ServiceInfo,
    _envVars: Record<string, string>,
  ): Promise<string> {
    // Simulate Vercel deployment
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return `https://${service.name}-${Math.random().toString(36).substr(2, 9)}.vercel.app`;
  }

  /**
   * Deploys a frontend service to Netlify.
   * Currently simulates deployment for demonstration.
   *
   * @private
   * @param {ServiceInfo} service - Service to deploy
   * @param {Record<string, string>} _envVars - Environment variables (unused in simulation)
   * @returns {Promise<string>} The simulated Netlify URL
   */
  private async deployToNetlify(
    service: ServiceInfo,
    _envVars: Record<string, string>,
  ): Promise<string> {
    // Simulate Netlify deployment
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return `https://${service.name}-${Math.random().toString(36).substr(2, 9)}.netlify.app`;
  }

  /**
   * Gets the environment variable prefix for a specific framework.
   * Frontend frameworks require specific prefixes for build-time env vars.
   *
   * @private
   * @param {string} framework - The framework name
   * @returns {string | null} The env var prefix or null
   */
  private getEnvPrefix(framework: string): string | null {
    const prefixes: Record<string, string> = {
      react: "REACT_APP_",
      vue: "VUE_APP_",
      nextjs: "NEXT_PUBLIC_",
      gatsby: "GATSBY_",
      angular: "NG_",
    };
    return prefixes[framework] || null;
  }

  /**
   * Saves deployment results to a manifest file.
   * Useful for tracking deployments and debugging.
   *
   * @private
   * @param {DeploymentResult} result - Deployment results to save
   * @returns {Promise<void>}
   */
  private async saveDeploymentManifest(
    result: DeploymentResult,
  ): Promise<void> {
    const manifest = {
      timestamp: new Date().toISOString(),
      success: result.success,
      duration: result.duration,
      urls: result.urls,
      deployments: result.deployments.map((d) => ({
        service: d.service.name,
        type: d.service.type,
        framework: d.service.framework,
        status: d.status,
        url: d.url,
        duration: d.endTime && d.startTime ? d.endTime - d.startTime : 0,
        error: d.error,
      })),
    };

    const manifestPath = path.join(process.cwd(), "deployment-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(
      chalk.green(`\n✓ Deployment manifest written to ${manifestPath}`),
    );
  }

  /**
   * Generates manual deployment instructions for each service.
   * Provides platform-specific commands for deploying services manually.
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * const deployer = new MultiServiceDeployer(services);
   * await deployer.generateDeploymentInstructions();
   * // Prints step-by-step instructions for each service
   * ```
   */
  async generateDeploymentInstructions(): Promise<void> {
    console.log(chalk.bold("\n📝 Manual Deployment Instructions:\n"));

    for (const service of this.services) {
      console.log(chalk.cyan(`\n${service.name} (${service.type}):`));

      if (service.type === "frontend") {
        console.log("  1. Build the frontend:");
        console.log(`     cd ${path.relative(process.cwd(), service.path)}`);
        console.log(`     npm run build`);
        console.log("  2. Deploy to static hosting:");
        console.log(`     - Vercel: vercel --prod`);
        console.log(`     - Netlify: netlify deploy --prod`);
        console.log(`     - AWS S3: aws s3 sync ./dist s3://your-bucket`);
      } else if (service.type === "backend") {
        console.log("  1. Build the backend:");
        console.log(`     cd ${path.relative(process.cwd(), service.path)}`);
        console.log(`     npm run build`);
        console.log("  2. Deploy to server:");
        console.log(`     - Heroku: git push heroku main`);
        console.log(`     - AWS ECS: ecs-cli compose up`);
        console.log(`     - Docker: docker build -t app . && docker push`);
      }

      if (service.envVars && service.envVars.length > 0) {
        console.log("  3. Set environment variables:");
        service.envVars.forEach((v) => {
          console.log(`     ${v}=<value>`);
        });
      }
    }
  }
}
