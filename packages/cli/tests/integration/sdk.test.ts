import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestApiServer } from "../services/test-api-server";
import {
  configureApi,
  DeploymentsService,
  CreateDeploymentRequest,
} from "../../../sdk/dist";

describe("Cygni SDK Integration", () => {
  let apiServer: TestApiServer;
  let apiPort: number;

  beforeAll(async () => {
    // Start test API server
    apiServer = new TestApiServer();
    apiPort = await apiServer.start();

    // Configure SDK to use test server
    configureApi({
      baseUrl: `http://localhost:${apiPort}`,
    });
  });

  afterAll(async () => {
    await apiServer.stop();
  });

  it("should create a deployment and monitor status", async () => {
    // Create deployment request
    const request: CreateDeploymentRequest = {
      cloudexpressConfig: {
        version: "1.0",
        services: [
          {
            name: "test-backend",
            type: "backend",
            path: "./backend",
          },
          {
            name: "test-frontend",
            type: "frontend",
            path: "./frontend",
          },
        ],
      },
      environment: "production",
      provider: "cloudexpress",
    };

    // Create deployment
    const createResponse = await DeploymentsService.postDeployments(request);

    expect(createResponse).toBeDefined();
    expect(createResponse.deploymentId).toBeDefined();
    expect(createResponse.status).toBe("pending");

    // Get deployment status
    const statusResponse = await DeploymentsService.getDeploymentsStatus(
      createResponse.deploymentId,
    );

    expect(statusResponse).toBeDefined();
    expect(statusResponse.id).toBe(createResponse.deploymentId);
    expect(statusResponse.services).toHaveLength(2);

    // Wait for deployment to progress
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check status again
    const updatedStatus = await DeploymentsService.getDeploymentsStatus(
      createResponse.deploymentId,
    );

    // Should have progressed
    expect(updatedStatus.status).not.toBe("pending");
  });

  it("should list project deployments", async () => {
    // Add some test deployments
    apiServer.addDeployment("test-project", {
      id: "deploy-1",
      projectId: "test-project",
      environment: "production",
      version: "1.0.0",
      commitSha: "abc123",
      status: "completed",
      url: "https://test.app",
      createdAt: new Date().toISOString(),
      healthStatus: "healthy",
      strategy: "rolling",
    });

    // List deployments
    const response = await DeploymentsService.getProjectsDeployments(
      "test-project",
      undefined,
      10,
    );

    expect(response.deployments).toBeDefined();
    expect(response.deployments!.length).toBeGreaterThan(0);
    expect(response.deployments![0].id).toBe("deploy-1");
  });
});
