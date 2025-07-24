/**
 * Shared Infrastructure Deployer
 * Handles fast deployments to multi-tenant shared infrastructure
 */

import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs/promises";
import { execSync } from "child_process";
import crypto from "crypto";
import { ServiceInfo } from "./fullstack-analyzer";
import {
  ECRClient,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import {
  ECSClient,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  UpdateServiceCommand,
  DescribeServicesCommand,
  DeleteServiceCommand,
  ListServicesCommand,
} from "@aws-sdk/client-ecs";
import {
  ElasticLoadBalancingV2Client,
  CreateTargetGroupCommand,
  CreateRuleCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DescribeRulesCommand,
  DescribeTargetGroupsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

export interface SharedInfrastructureConfig {
  vpcId: string;
  subnetIds: string[];
  clusterName: string;
  clusterArn: string;
  ecrRepositoryUri: string;
  albArn: string;
  albDnsName: string;
  httpListenerArn: string;
  httpsListenerArn: string;
  taskExecutionRoleArn: string;
  logGroupName: string;
}

export interface SharedDeploymentOptions {
  projectId: string;
  environment?: string;
  cpu?: number;
  memory: number;
  desiredCount?: number;
  healthCheckPath?: string;
  port?: number;
}

export interface SharedDeploymentResult {
  success: boolean;
  projectId: string;
  url: string;
  serviceName: string;
  taskDefinitionArn?: string;
  serviceArn?: string;
  targetGroupArn?: string;
  error?: string;
}

/**
 * Handles deployments to shared multi-tenant infrastructure
 * Provides fast deployments by reusing existing infrastructure
 */
export class SharedDeployer {
  private region: string;
  private config: SharedInfrastructureConfig;
  private ecsClient: ECSClient;
  private ecrClient: ECRClient;
  private elbClient: ElasticLoadBalancingV2Client;

  constructor(region: string = "us-east-1") {
    this.region = region;
    this.ecsClient = new ECSClient({ region });
    this.ecrClient = new ECRClient({ region });
    this.elbClient = new ElasticLoadBalancingV2Client({ region });
    this.config = {} as SharedInfrastructureConfig;
  }

  /**
   * Load shared infrastructure configuration from CDK outputs
   */
  async loadSharedInfrastructure(): Promise<void> {
    try {
      // Try to load from file first
      const outputsPath = path.join(
        process.cwd(),
        "packages",
        "infra",
        "shared.outputs.json"
      );
      const content = await fs.readFile(outputsPath, "utf-8");
      const outputs = JSON.parse(content);
      
      // Extract outputs from the first region stack
      const stackName = Object.keys(outputs)[0];
      if (stackName && outputs[stackName]) {
        const stackOutputs = outputs[stackName];
        this.config = {
          vpcId: stackOutputs.VPCId,
          subnetIds: stackOutputs.SubnetIds.split(','),
          clusterName: stackOutputs.ClusterName,
          clusterArn: stackOutputs.ClusterArn,
          ecrRepositoryUri: stackOutputs.ECRRepositoryUri,
          albArn: stackOutputs.ALBArn,
          albDnsName: stackOutputs.ALBDnsName,
          httpListenerArn: stackOutputs.HttpListenerArn,
          httpsListenerArn: stackOutputs.HttpsListenerArn || stackOutputs.HttpListenerArn,
          taskExecutionRoleArn: stackOutputs.TaskExecutionRoleArn,
          logGroupName: stackOutputs.LogGroupName,
        };
        console.log(chalk.gray("✓ Loaded shared infrastructure configuration"));
        return;
      }
    } catch {
      // File not found or invalid
    }

    // Fallback to environment variables
    const requiredVars = [
      'CYGNI_SHARED_VPC_ID',
      'CYGNI_SHARED_SUBNET_IDS',
      'CYGNI_SHARED_CLUSTER_NAME',
      'CYGNI_SHARED_ECR_URI',
      'CYGNI_SHARED_ALB_DNS',
      'CYGNI_SHARED_HTTP_LISTENER_ARN',
      'CYGNI_SHARED_TASK_EXECUTION_ROLE_ARN',
    ];

    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `Missing shared infrastructure configuration. Please deploy shared infrastructure first or set environment variables: ${missing.join(', ')}`
      );
    }

    this.config = {
      vpcId: process.env.CYGNI_SHARED_VPC_ID!,
      subnetIds: process.env.CYGNI_SHARED_SUBNET_IDS!.split(','),
      clusterName: process.env.CYGNI_SHARED_CLUSTER_NAME!,
      clusterArn: process.env.CYGNI_SHARED_CLUSTER_ARN!,
      ecrRepositoryUri: process.env.CYGNI_SHARED_ECR_URI!,
      albArn: process.env.CYGNI_SHARED_ALB_ARN!,
      albDnsName: process.env.CYGNI_SHARED_ALB_DNS!,
      httpListenerArn: process.env.CYGNI_SHARED_HTTP_LISTENER_ARN!,
      httpsListenerArn: process.env.CYGNI_SHARED_HTTPS_LISTENER_ARN || process.env.CYGNI_SHARED_HTTP_LISTENER_ARN!,
      taskExecutionRoleArn: process.env.CYGNI_SHARED_TASK_EXECUTION_ROLE_ARN!,
      logGroupName: process.env.CYGNI_SHARED_LOG_GROUP || '/ecs/cygni-shared',
    };
  }

  /**
   * Deploy a service to shared infrastructure
   */
  async deployService(
    service: ServiceInfo,
    options: SharedDeploymentOptions
  ): Promise<SharedDeploymentResult> {
    const spinner = ora(`Deploying ${service.name} to shared infrastructure`).start();

    try {
      // 1. Build and push Docker image
      spinner.text = `Building and pushing Docker image...`;
      const imageTag = `${options.projectId}-${Date.now()}`;
      const imageUri = await this.buildAndPushImage(service, imageTag);

      // 2. Create or update task definition
      spinner.text = `Creating task definition...`;
      const taskDefArn = await this.createTaskDefinition(
        options.projectId,
        imageUri,
        options
      );

      // 3. Create target group
      spinner.text = `Creating target group...`;
      const targetGroupArn = await this.createTargetGroup(
        options.projectId,
        options.healthCheckPath || '/health',
        options.port || 3000
      );

      // 4. Create or update ECS service
      spinner.text = `Deploying ECS service...`;
      const serviceName = `${options.projectId}-service`;
      const serviceArn = await this.createOrUpdateService(
        serviceName,
        taskDefArn,
        targetGroupArn,
        options.desiredCount || 1
      );

      // 5. Create ALB listener rule
      spinner.text = `Configuring load balancer routing...`;
      await this.createListenerRule(
        options.projectId,
        targetGroupArn
      );

      // 6. Wait for service to be healthy
      spinner.text = `Waiting for service to be healthy...`;
      await this.waitForServiceHealthy(serviceName);

      spinner.succeed(`Successfully deployed ${service.name}`);

      const url = `http://${this.config.albDnsName}/${options.projectId}`;
      
      return {
        success: true,
        projectId: options.projectId,
        url,
        serviceName,
        taskDefinitionArn: taskDefArn,
        serviceArn,
        targetGroupArn,
      };
    } catch (error: any) {
      spinner.fail(`Failed to deploy ${service.name}: ${error.message}`);
      return {
        success: false,
        projectId: options.projectId,
        url: '',
        serviceName: '',
        error: error.message,
      };
    }
  }

  /**
   * Build and push Docker image to shared ECR repository
   */
  private async buildAndPushImage(
    service: ServiceInfo,
    tag: string
  ): Promise<string> {
    const imageUri = `${this.config.ecrRepositoryUri}:${tag}`;

    // Get ECR login token
    const authResponse = await this.ecrClient.send(
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
    const registryUrl = this.config.ecrRepositoryUri.split("/")[0];

    // Docker login
    execSync(
      `docker login --username ${username} --password-stdin ${registryUrl}`,
      {
        input: password,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Create Dockerfile if it doesn't exist
    const dockerfilePath = path.join(service.path, "Dockerfile");
    try {
      await fs.access(dockerfilePath);
    } catch {
      await this.createDefaultDockerfile(service);
    }

    // Build and push image
    execSync(`docker build -t ${imageUri} .`, {
      cwd: service.path,
      stdio: ["pipe", "pipe", "pipe"],
    });

    execSync(`docker push ${imageUri}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    return imageUri;
  }

  /**
   * Create a default Dockerfile for services without one
   */
  private async createDefaultDockerfile(service: ServiceInfo): Promise<void> {
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production || npm install --production

# Copy application code
COPY . .

# Build if needed
RUN npm run build || true

# Expose port
EXPOSE ${service.port || 3000}

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s \\
  CMD node -e "require('http').get('http://localhost:${service.port || 3000}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"]
`;

    await fs.writeFile(path.join(service.path, "Dockerfile"), dockerfile);
  }

  /**
   * Create ECS task definition
   */
  private async createTaskDefinition(
    projectId: string,
    imageUri: string,
    options: SharedDeploymentOptions
  ): Promise<string> {
    const taskDefFamily = `${projectId}-task`;

    const response = await this.ecsClient.send(
      new RegisterTaskDefinitionCommand({
        family: taskDefFamily,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: String(options.cpu || 256),
        memory: String(options.memory || 512),
        executionRoleArn: this.config.taskExecutionRoleArn,
        containerDefinitions: [
          {
            name: projectId,
            image: imageUri,
            portMappings: [
              {
                containerPort: options.port || 3000,
                protocol: "tcp",
              },
            ],
            environment: [
              { name: "NODE_ENV", value: options.environment || "production" },
              { name: "PORT", value: String(options.port || 3000) },
              { name: "PROJECT_ID", value: projectId },
            ],
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": this.config.logGroupName,
                "awslogs-region": this.region,
                "awslogs-stream-prefix": projectId,
              },
            },
            healthCheck: {
              command: [
                "CMD-SHELL",
                `curl -f http://localhost:${options.port || 3000}${options.healthCheckPath || '/health'} || exit 1`,
              ],
              interval: 30,
              timeout: 5,
              retries: 3,
              startPeriod: 60,
            },
          },
        ],
        tags: [
          { key: "Project", value: projectId },
          { key: "Tier", value: "shared" },
          { key: "ManagedBy", value: "Cygni" },
        ],
      })
    );

    return response.taskDefinition!.taskDefinitionArn!;
  }

  /**
   * Create target group for the service
   */
  private async createTargetGroup(
    projectId: string,
    healthCheckPath: string,
    port: number
  ): Promise<string> {
    // First, check if target group already exists
    try {
      const existing = await this.elbClient.send(
        new DescribeTargetGroupsCommand({
          Names: [`${projectId}-tg`],
        })
      );

      const targetGroups = existing.TargetGroups;
      if (targetGroups && targetGroups.length > 0 && targetGroups[0]) {
        const targetGroupArn = targetGroups[0].TargetGroupArn;
        if (targetGroupArn) {
          return targetGroupArn;
        }
      }
    } catch {
      // Target group doesn't exist, create it
    }

    const response = await this.elbClient.send(
      new CreateTargetGroupCommand({
        Name: `${projectId}-tg`,
        Protocol: "HTTP",
        Port: port,
        VpcId: this.config.vpcId,
        TargetType: "ip",
        HealthCheckEnabled: true,
        HealthCheckPath: healthCheckPath,
        HealthCheckProtocol: "HTTP",
        HealthCheckIntervalSeconds: 30,
        HealthCheckTimeoutSeconds: 5,
        HealthyThresholdCount: 2,
        UnhealthyThresholdCount: 3,
        Matcher: {
          HttpCode: "200,404", // Accept 404 as healthy for apps without health endpoint
        },
        Tags: [
          { Key: "Project", Value: projectId },
          { Key: "Tier", Value: "shared" },
          { Key: "ManagedBy", Value: "Cygni" },
        ],
      })
    );

    if (response.TargetGroups?.[0]?.TargetGroupArn) {
      return response.TargetGroups[0].TargetGroupArn;
    }
    throw new Error("Failed to create target group");
  }

  /**
   * Create or update ECS service
   */
  private async createOrUpdateService(
    serviceName: string,
    taskDefinitionArn: string,
    targetGroupArn: string,
    desiredCount: number
  ): Promise<string> {
    // Check if service exists
    try {
      const existing = await this.ecsClient.send(
        new DescribeServicesCommand({
          cluster: this.config.clusterName,
          services: [serviceName],
        })
      );

      const services = existing.services;
      if (services && services.length > 0 && services[0]) {
        const service = services[0];
        if (service && service.status === "ACTIVE" && service.serviceArn) {
          // Update existing service
          const response = await this.ecsClient.send(
            new UpdateServiceCommand({
              cluster: this.config.clusterName,
              service: serviceName,
              taskDefinition: taskDefinitionArn,
              desiredCount,
              forceNewDeployment: true,
            })
          );
          if (response.service?.serviceArn) {
            return response.service.serviceArn;
          }
          throw new Error("Failed to update service");
        }
      }
    } catch {
      // Service doesn't exist
    }

    // Create new service
    const response = await this.ecsClient.send(
      new CreateServiceCommand({
        cluster: this.config.clusterName,
        serviceName,
        taskDefinition: taskDefinitionArn,
        desiredCount,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: this.config.subnetIds,
            assignPublicIp: "ENABLED", // Required for public subnets
          },
        },
        loadBalancers: [
          {
            targetGroupArn,
            containerName: serviceName.replace('-service', ''),
            containerPort: 3000,
          },
        ],
        healthCheckGracePeriodSeconds: 60,
        tags: [
          { key: "Project", value: serviceName.replace('-service', '') },
          { key: "Tier", value: "shared" },
          { key: "ManagedBy", value: "Cygni" },
        ],
      })
    );

    if (response.service?.serviceArn) {
      return response.service.serviceArn;
    }
    throw new Error("Failed to create service");
  }

  /**
   * Create ALB listener rule for path-based routing
   */
  private async createListenerRule(
    projectId: string,
    targetGroupArn: string
  ): Promise<void> {
    // First, check if rule already exists and delete it
    try {
      const existingRules = await this.elbClient.send(
        new DescribeRulesCommand({
          ListenerArn: this.config.httpListenerArn,
        })
      );

      const projectRule = existingRules.Rules?.find((rule: any) =>
        rule.Conditions?.some((c: any) =>
          c.PathPatternConfig?.Values?.some((v: any) => v.startsWith(`/${projectId}`))
        )
      );

      if (projectRule) {
        await this.elbClient.send(
          new DeleteRuleCommand({
            RuleArn: projectRule.RuleArn,
          })
        );
      }
    } catch {
      // No existing rule
    }

    // Create new rule with unique priority
    const priority = this.generatePriority(projectId);

    await this.elbClient.send(
      new CreateRuleCommand({
        ListenerArn: this.config.httpListenerArn,
        Priority: priority,
        Conditions: [
          {
            Field: "path-pattern",
            PathPatternConfig: {
              Values: [`/${projectId}`, `/${projectId}/*`],
            },
          },
        ],
        Actions: [
          {
            Type: "forward",
            TargetGroupArn: targetGroupArn,
          },
        ],
        Tags: [
          { Key: "Project", Value: projectId },
          { Key: "Tier", Value: "shared" },
        ],
      })
    );

    // Also create HTTPS rule if HTTPS listener exists
    if (this.config.httpsListenerArn && this.config.httpsListenerArn !== this.config.httpListenerArn) {
      try {
        await this.elbClient.send(
          new CreateRuleCommand({
            ListenerArn: this.config.httpsListenerArn,
            Priority: priority,
            Conditions: [
              {
                Field: "path-pattern",
                PathPatternConfig: {
                  Values: [`/${projectId}`, `/${projectId}/*`],
                },
              },
            ],
            Actions: [
              {
                Type: "forward",
                TargetGroupArn: targetGroupArn,
              },
            ],
            Tags: [
              { Key: "Project", Value: projectId },
              { Key: "Tier", Value: "shared" },
            ],
          })
        );
      } catch {
        // HTTPS listener might not be configured
      }
    }
  }

  /**
   * Generate a unique priority for ALB rules based on project ID
   */
  private generatePriority(projectId: string): number {
    // Generate a hash from project ID and convert to number between 1-50000
    const hash = crypto.createHash('md5').update(projectId).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return (num % 49999) + 1; // Priority must be between 1-50000
  }

  /**
   * Wait for service to be healthy
   */
  private async waitForServiceHealthy(
    serviceName: string,
    maxAttempts: number = 30
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.ecsClient.send(
        new DescribeServicesCommand({
          cluster: this.config.clusterName,
          services: [serviceName],
        })
      );

      const service = response.services?.[0];
      if (service && service.deployments) {
        const deployment = service.deployments.find(
          d => d.status === "PRIMARY"
        );
        
        if (
          deployment &&
          deployment.runningCount === deployment.desiredCount &&
          service.runningCount === service.desiredCount
        ) {
          return; // Service is healthy
        }
      }

      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    throw new Error("Service failed to become healthy within timeout");
  }

  /**
   * Remove a project from shared infrastructure
   */
  async removeProject(projectId: string): Promise<void> {
    const spinner = ora(`Removing ${projectId} from shared infrastructure`).start();

    try {
      // 1. Delete ALB listener rules
      spinner.text = `Removing load balancer rules...`;
      await this.deleteListenerRules(projectId);

      // 2. Delete ECS service
      spinner.text = `Stopping ECS service...`;
      const serviceName = `${projectId}-service`;
      await this.deleteService(serviceName);

      // 3. Delete target group
      spinner.text = `Removing target group...`;
      await this.deleteTargetGroup(projectId);

      spinner.succeed(`Successfully removed ${projectId}`);
    } catch (error: any) {
      spinner.fail(`Failed to remove ${projectId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete ALB listener rules for a project
   */
  private async deleteListenerRules(projectId: string): Promise<void> {
    // Delete HTTP rules
    const httpRules = await this.elbClient.send(
      new DescribeRulesCommand({
        ListenerArn: this.config.httpListenerArn,
      })
    );

    const projectRules = httpRules.Rules?.filter((rule: any) =>
      rule.Conditions?.some((c: any) =>
        c.PathPatternConfig?.Values?.some((v: any) => v.startsWith(`/${projectId}`))
      )
    ) || [];

    for (const rule of projectRules) {
      if (rule.RuleArn && !rule.IsDefault) {
        await this.elbClient.send(
          new DeleteRuleCommand({
            RuleArn: rule.RuleArn,
          })
        );
      }
    }

    // Delete HTTPS rules if different listener
    if (this.config.httpsListenerArn && this.config.httpsListenerArn !== this.config.httpListenerArn) {
      try {
        const httpsRules = await this.elbClient.send(
          new DescribeRulesCommand({
            ListenerArn: this.config.httpsListenerArn,
          })
        );

        const httpsProjectRules = httpsRules.Rules?.filter((rule: any) =>
          rule.Conditions?.some((c: any) =>
            c.PathPatternConfig?.Values?.some((v: any) => v.startsWith(`/${projectId}`))
          )
        ) || [];

        for (const rule of httpsProjectRules) {
          if (rule.RuleArn && !rule.IsDefault) {
            await this.elbClient.send(
              new DeleteRuleCommand({
                RuleArn: rule.RuleArn,
              })
            );
          }
        }
      } catch {
        // HTTPS listener might not exist
      }
    }
  }

  /**
   * Delete ECS service
   */
  private async deleteService(serviceName: string): Promise<void> {
    try {
      // First update to 0 desired count
      await this.ecsClient.send(
        new UpdateServiceCommand({
          cluster: this.config.clusterName,
          service: serviceName,
          desiredCount: 0,
        })
      );

      // Wait a bit for tasks to stop
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Delete the service
      await this.ecsClient.send(
        new DeleteServiceCommand({
          cluster: this.config.clusterName,
          service: serviceName,
          force: true,
        })
      );
    } catch {
      // Service might not exist
    }
  }

  /**
   * Delete target group
   */
  private async deleteTargetGroup(projectId: string): Promise<void> {
    try {
      const response = await this.elbClient.send(
        new DescribeTargetGroupsCommand({
          Names: [`${projectId}-tg`],
        })
      );

      const targetGroups = response.TargetGroups;
      if (targetGroups && targetGroups.length > 0 && targetGroups[0]) {
        const targetGroupArn = targetGroups[0].TargetGroupArn;
        if (targetGroupArn) {
          await this.elbClient.send(
            new DeleteTargetGroupCommand({
              TargetGroupArn: targetGroupArn,
            })
          );
        }
      }
    } catch {
      // Target group might not exist
    }
  }

  /**
   * List all projects deployed to shared infrastructure
   */
  async listProjects(): Promise<Array<{
    projectId: string;
    serviceName: string;
    status: string;
    url: string;
    runningTasks: number;
    desiredTasks: number;
  }>> {
    const response = await this.ecsClient.send(
      new ListServicesCommand({
        cluster: this.config.clusterName,
        maxResults: 100,
      })
    );

    if (!response.serviceArns?.length) {
      return [];
    }

    const servicesResponse = await this.ecsClient.send(
      new DescribeServicesCommand({
        cluster: this.config.clusterName,
        services: response.serviceArns,
      })
    );

    const projects = servicesResponse.services?.map(service => {
      const projectId = service.serviceName?.replace('-service', '') || '';
      return {
        projectId,
        serviceName: service.serviceName || '',
        status: service.status || 'UNKNOWN',
        url: `http://${this.config.albDnsName}/${projectId}`,
        runningTasks: service.runningCount || 0,
        desiredTasks: service.desiredCount || 0,
      };
    }) || [];

    return projects.filter(p => p.projectId); // Filter out any services without project IDs
  }
}