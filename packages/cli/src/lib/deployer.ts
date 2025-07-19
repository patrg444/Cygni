import { getApiClient } from "./api-client";
import { BuildResult, BuildConfig } from "./builder";
import chalk from "chalk";
import ora from "ora";

export interface DeploymentOptions {
  config: BuildConfig;
  buildResult: BuildResult;
  environment: string;
  healthGate?: string;
  strategy?: string;
  cachedImageId?: string;
}

export interface Deployment {
  id: string;
  url: string;
  status: string;
  environment: string;
  buildId: string;
}

export async function deployToCloudExpress(
  options: DeploymentOptions,
): Promise<Deployment> {
  const api = await getApiClient();

  // Get or create project
  const project = await ensureProject(api, options.config);

  // Create build
  const buildSpinner = ora("Creating build...").start();
  const build = await api.post("/builds", {
    projectId: project.id,
    commitSha: options.buildResult.commitSha,
    branch: options.buildResult.branch,
    dockerfilePath: options.buildResult.dockerfilePath,
    buildArgs: options.buildResult.buildArgs,
  });
  buildSpinner.succeed(`Build created: ${build.data.id}`);

  // Poll build status
  const buildStatusSpinner = ora("Building container...").start();
  let buildStatus = build.data.status;
  let attempts = 0;
  const maxAttempts = 300; // 5 minutes timeout

  while (buildStatus === "pending" || buildStatus === "running") {
    if (attempts >= maxAttempts) {
      buildStatusSpinner.fail("Build timeout");
      throw new Error("Build took too long");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await api.get(`/builds/${build.data.id}`);
    buildStatus = statusResponse.data.status;
    attempts++;

    if (buildStatus === "running") {
      buildStatusSpinner.text =
        "Building container... (this may take a few minutes)";
    }
  }

  if (buildStatus !== "success") {
    buildStatusSpinner.fail(`Build failed with status: ${buildStatus}`);
    console.log(
      chalk.gray("\nView build logs with: cygni logs --build " + build.data.id),
    );
    throw new Error("Build failed");
  }

  buildStatusSpinner.succeed("Container built successfully!");

  // Create deployment
  const deploySpinner = ora("Creating deployment...").start();
  const deployment = await api.post("/deployments", {
    projectId: project.id,
    buildId: build.data.id,
    environment: options.environment,
  });
  deploySpinner.succeed(`Deployment created: ${deployment.data.id}`);

  // Poll deployment status
  const deployStatusSpinner = ora("Deploying to Cygni...").start();
  let deployStatus = deployment.data.status;
  attempts = 0;

  while (deployStatus === "pending" || deployStatus === "deploying") {
    if (attempts >= maxAttempts) {
      deployStatusSpinner.fail("Deployment timeout");
      throw new Error("Deployment took too long");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await api.get(`/deployments/${deployment.data.id}`);
    deployStatus = statusResponse.data.status;
    attempts++;
  }

  if (deployStatus !== "active") {
    deployStatusSpinner.fail(`Deployment failed with status: ${deployStatus}`);
    console.log(
      chalk.gray(
        "\nView deployment logs with: cygni logs " + deployment.data.id,
      ),
    );
    throw new Error("Deployment failed");
  }

  deployStatusSpinner.succeed("Deployment successful!");

  // Get deployment URL
  const finalDeployment = await api.get(`/deployments/${deployment.data.id}`);

  return {
    id: finalDeployment.data.id,
    url: finalDeployment.data.url,
    status: finalDeployment.data.status,
    environment: finalDeployment.data.environment,
    buildId: build.data.id,
  };
}

async function ensureProject(api: any, config: BuildConfig) {
  // Check if project exists locally
  const projectSlug = config.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  try {
    // Try to get project by slug
    const response = await api.get(`/projects/by-slug/${projectSlug}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // Create new project
      console.log(chalk.blue("Creating new project..."));

      // Get user's organizations
      const orgsResponse = await api.get("/auth/me");
      const organizations = orgsResponse.data.organizations;

      if (organizations.length === 0) {
        throw new Error(
          "No organizations found. Please create an organization first.",
        );
      }

      // Use first organization (in real app, would prompt user)
      const orgId = organizations[0].id;

      const projectResponse = await api.post(
        `/organizations/${orgId}/projects`,
        {
          name: config.name,
          framework: config.framework,
        },
      );

      return projectResponse.data;
    }

    throw error;
  }
}
