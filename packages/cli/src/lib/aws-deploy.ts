import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  Stack,
} from "@aws-sdk/client-cloudformation";
import {
  ECRClient,
  CreateRepositoryCommand,
  GetAuthorizationTokenCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import {
  ECSClient,
  UpdateServiceCommand,
  DescribeServicesCommand,
} from "@aws-sdk/client-ecs";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { EventEmitter } from "events";
import ora from "ora";

const execAsync = promisify(exec);

export interface DeployOptions {
  appName: string;
  region?: string;
  dockerfilePath?: string;
  buildContext?: string;
  servicePort?: number;
  healthCheckPath?: string;
  hostedZoneId?: string;
  certificateArn?: string;
}

export interface DeployResult {
  url: string;
  stackId: string;
  serviceArn: string;
  taskDefinitionArn: string;
}

export class AWSDeployer extends EventEmitter {
  private cfClient: CloudFormationClient;
  private ecrClient: ECRClient;
  private ecsClient: ECSClient;
  private stsClient: STSClient;
  private region: string;
  private accountId?: string;

  constructor(region: string = "us-east-1") {
    super();
    this.region = region;
    const config = { region: this.region };
    this.cfClient = new CloudFormationClient(config);
    this.ecrClient = new ECRClient(config);
    this.ecsClient = new ECSClient(config);
    this.stsClient = new STSClient(config);
  }

  async deploy(options: DeployOptions): Promise<DeployResult> {
    const {
      appName,
      dockerfilePath = "Dockerfile",
      buildContext = ".",
      servicePort = 3000,
      healthCheckPath = "/health",
      hostedZoneId,
      certificateArn,
    } = options;

    // Validate app name
    if (!/^[a-z0-9-]+$/.test(appName)) {
      throw new Error("App name must be lowercase alphanumeric with hyphens");
    }

    // Get AWS account ID
    await this.getAccountId();

    // 1. Create or get ECR repository
    this.emit("step", "Setting up container registry");
    const repoUri = await this.ensureECRRepository(appName);

    // 2. Build and push Docker image
    this.emit("step", "Building application image");
    const imageUri = await this.buildAndPushImage(
      repoUri,
      dockerfilePath,
      buildContext,
      appName
    );

    // 3. Deploy CloudFormation stack
    this.emit("step", "Creating infrastructure");
    const stackResult = await this.deployStack({
      appName,
      imageUri,
      servicePort,
      healthCheckPath,
      hostedZoneId: hostedZoneId || process.env.CX_HOSTED_ZONE_ID || "",
      certificateArn: certificateArn || process.env.CX_CERTIFICATE_ARN || "",
    });

    return stackResult;
  }

  async rollback(appName: string): Promise<void> {
    const spinner = ora("Getting current deployment info").start();

    try {
      // Get current service info
      const services = await this.ecsClient.send(
        new DescribeServicesCommand({
          cluster: `${appName}-cluster`,
          services: [`${appName}-service`],
        })
      );

      if (!services.services || services.services.length === 0) {
        throw new Error("Service not found");
      }

      const service = services.services[0];
      const currentTaskDef = service?.taskDefinition;

      if (!currentTaskDef) {
        throw new Error("No task definition found");
      }

      // Get task definition family and revision
      const match = currentTaskDef.match(/(.+):(\d+)$/);
      if (!match) {
        throw new Error("Invalid task definition format");
      }

      const [, family, revision] = match;
      const previousRevision = parseInt(revision!) - 1;

      if (previousRevision < 1) {
        throw new Error("No previous revision to rollback to");
      }

      spinner.text = `Rolling back to revision ${previousRevision}`;

      // Update service with previous task definition
      await this.ecsClient.send(
        new UpdateServiceCommand({
          cluster: `${appName}-cluster`,
          service: `${appName}-service`,
          taskDefinition: `${family!}:${previousRevision}`,
          forceNewDeployment: true,
        })
      );

      spinner.succeed("Rollback initiated successfully");
      this.emit("rollback", { taskDefinition: `${family!}:${previousRevision}` });
    } catch (error) {
      spinner.fail("Rollback failed");
      throw error;
    }
  }

  private async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId;

    const identity = await this.stsClient.send(new GetCallerIdentityCommand({}));
    this.accountId = identity.Account;
    if (!this.accountId) {
      throw new Error("Failed to get AWS account ID");
    }
    return this.accountId;
  }

  private async ensureECRRepository(appName: string): Promise<string> {
    const repoName = `cygni/${appName}`;

    try {
      // Check if repository exists
      const repos = await this.ecrClient.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [repoName],
        })
      );

      if (repos.repositories && repos.repositories.length > 0) {
        const repo = repos.repositories[0];
        if (repo?.repositoryUri) {
          return repo.repositoryUri;
        }
        throw new Error("Repository exists but has no URI");
      }
    } catch (error: any) {
      if (error.name !== "RepositoryNotFoundException") {
        throw error;
      }
    }

    // Create repository
    const createResult = await this.ecrClient.send(
      new CreateRepositoryCommand({
        repositoryName: repoName,
        imageScanningConfiguration: {
          scanOnPush: true,
        },
        imageTagMutability: "MUTABLE",
      })
    );

    if (!createResult.repository?.repositoryUri) {
      throw new Error("Failed to create ECR repository");
    }
    return createResult.repository.repositoryUri;
  }

  private async buildAndPushImage(
    repoUri: string,
    dockerfilePath: string,
    buildContext: string,
    _appName: string
  ): Promise<string> {
    const tag = `${repoUri}:latest`;
    const buildTag = `${repoUri}:build-${Date.now()}`;

    // Get ECR login token
    const authResult = await this.ecrClient.send(
      new GetAuthorizationTokenCommand({})
    );

    if (!authResult.authorizationData || authResult.authorizationData.length === 0) {
      throw new Error("Failed to get ECR authorization");
    }

    const authData = authResult.authorizationData[0];
    if (!authData?.authorizationToken || !authData?.proxyEndpoint) {
      throw new Error("Invalid ECR authorization data");
    }
    const token = Buffer.from(authData.authorizationToken, "base64").toString();
    const [username, password] = token.split(":");

    // Docker login
    this.emit("log", "Authenticating with ECR");
    await execAsync(
      `echo "${password}" | docker login --username ${username} --password-stdin ${authData.proxyEndpoint}`
    );

    // Build image
    this.emit("log", "Building container (this may take a moment)");
    const buildCommand = `docker build -f ${dockerfilePath} -t ${tag} -t ${buildTag} ${buildContext}`;
    const buildProcess = exec(buildCommand);

    // Stream build output
    buildProcess.stdout?.on("data", (data) => {
      this.emit("build-output", data.toString());
    });

    buildProcess.stderr?.on("data", (data) => {
      this.emit("build-output", data.toString());
    });

    await new Promise((resolve, reject) => {
      buildProcess.on("exit", (code) => {
        if (code === 0) resolve(code);
        else reject(new Error(`Docker build failed with code ${code}`));
      });
    });

    // Push image
    this.emit("log", "Pushing image to ECR");
    await execAsync(`docker push ${tag}`);
    await execAsync(`docker push ${buildTag}`);

    return buildTag;
  }

  private async deployStack(params: {
    appName: string;
    imageUri: string;
    servicePort: number;
    healthCheckPath: string;
    hostedZoneId: string;
    certificateArn: string;
  }): Promise<DeployResult> {
    const stackName = `cygni-${params.appName}`;
    const templatePath = path.join(
      __dirname,
      "../../templates/fargate-demo-stack.yaml"
    );

    // Read template
    const { readFileSync } = await import("fs");
    const templateBody = readFileSync(templatePath, "utf8");

    const stackParams = [
      { ParameterKey: "AppName", ParameterValue: params.appName },
      { ParameterKey: "ImageUri", ParameterValue: params.imageUri },
      { ParameterKey: "ServicePort", ParameterValue: params.servicePort.toString() },
      { ParameterKey: "HealthCheckPath", ParameterValue: params.healthCheckPath },
    ];

    if (params.hostedZoneId) {
      stackParams.push({
        ParameterKey: "HostedZoneId",
        ParameterValue: params.hostedZoneId,
      });
    }

    if (params.certificateArn) {
      stackParams.push({
        ParameterKey: "CertificateArn",
        ParameterValue: params.certificateArn,
      });
    }

    try {
      // Check if stack exists
      const stacks = await this.cfClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );

      if (stacks.Stacks && stacks.Stacks.length > 0) {
        // Update existing stack
        this.emit("log", "Updating existing stack");
        await this.cfClient.send(
          new UpdateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Parameters: stackParams,
            Capabilities: ["CAPABILITY_IAM"],
          })
        );
      }
    } catch (error: any) {
      if (error.name === "ValidationError" && error.message.includes("does not exist")) {
        // Create new stack
        this.emit("log", "Creating new stack");
        await this.cfClient.send(
          new CreateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Parameters: stackParams,
            Capabilities: ["CAPABILITY_IAM"],
          })
        );
      } else {
        throw error;
      }
    }

    // Wait for stack to complete
    const result = await this.waitForStack(stackName);

    // Get outputs
    const outputs = result.Outputs || [];
    const getOutput = (key: string) =>
      outputs.find((o) => o.OutputKey === key)?.OutputValue || "";

    return {
      url: getOutput("ApplicationURL"),
      stackId: result.StackId || "",
      serviceArn: getOutput("ServiceArn"),
      taskDefinitionArn: getOutput("TaskDefinitionArn"),
    };
  }

  private async waitForStack(stackName: string): Promise<Stack> {
    const maxAttempts = 120; // 10 minutes
    const delay = 5000; // 5 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.cfClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );

      if (!result.Stacks || result.Stacks.length === 0) {
        throw new Error("Stack not found");
      }

      const stack = result.Stacks[0];
      const status = stack?.StackStatus;

      // Emit status updates
      this.emit("stack-status", status);

      // Check if complete
      if (
        status === "CREATE_COMPLETE" ||
        status === "UPDATE_COMPLETE"
      ) {
        return stack as Stack;
      }

      // Check if failed
      if (
        status?.includes("FAILED") ||
        status?.includes("ROLLBACK_COMPLETE") ||
        status === "DELETE_COMPLETE"
      ) {
        // Get failure reason
        const events = await this.cfClient.send(
          new DescribeStackEventsCommand({ StackName: stackName })
        );
        const failureEvent = events.StackEvents?.find(
          (e) => e.ResourceStatus?.includes("FAILED")
        );
        throw new Error(
          `Stack operation failed: ${failureEvent?.ResourceStatusReason || status}`
        );
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throw new Error("Stack operation timed out");
  }
}