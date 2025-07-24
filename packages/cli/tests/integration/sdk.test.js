"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const dist_1 = require("../../../sdk/dist");
(0, vitest_1.describe)("Cygni SDK Integration", () => {
    let apiServer;
    let apiPort;
    (0, vitest_1.beforeAll)(async () => {
        // Start test API server
        apiServer = new test_api_server_1.TestApiServer();
        apiPort = await apiServer.start();
        // Configure SDK to use test server
        (0, dist_1.configureApi)({
            baseUrl: `http://localhost:${apiPort}`,
        });
    });
    (0, vitest_1.afterAll)(async () => {
        await apiServer.stop();
    });
    (0, vitest_1.it)("should create a deployment and monitor status", async () => {
        // Create deployment request
        const request = {
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
        const createResponse = await dist_1.DeploymentsService.postDeployments(request);
        (0, vitest_1.expect)(createResponse).toBeDefined();
        (0, vitest_1.expect)(createResponse.deploymentId).toBeDefined();
        (0, vitest_1.expect)(createResponse.status).toBe("pending");
        // Get deployment status
        const statusResponse = await dist_1.DeploymentsService.getDeploymentsStatus(createResponse.deploymentId);
        (0, vitest_1.expect)(statusResponse).toBeDefined();
        (0, vitest_1.expect)(statusResponse.id).toBe(createResponse.deploymentId);
        (0, vitest_1.expect)(statusResponse.services).toHaveLength(2);
        // Wait for deployment to progress
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Check status again
        const updatedStatus = await dist_1.DeploymentsService.getDeploymentsStatus(createResponse.deploymentId);
        // Should have progressed
        (0, vitest_1.expect)(updatedStatus.status).not.toBe("pending");
    });
    (0, vitest_1.it)("should list project deployments", async () => {
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
        const response = await dist_1.DeploymentsService.getProjectsDeployments("test-project", undefined, 10);
        (0, vitest_1.expect)(response.deployments).toBeDefined();
        (0, vitest_1.expect)(response.deployments.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(response.deployments[0].id).toBe("deploy-1");
    });
});
//# sourceMappingURL=sdk.test.js.map