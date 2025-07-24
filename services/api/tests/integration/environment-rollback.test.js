"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
(0, vitest_1.describe)("Environment Variables and Rollback Scenarios", () => {
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const prisma = new client_1.PrismaClient();
    let isServicesRunning = false;
    let authToken;
    let projectId;
    let organizationId;
    let deploymentIds = [];
    (0, vitest_1.beforeAll)(async () => {
        // Check if services are running
        try {
            const health = await axios_1.default.get(`${API_URL}/health`);
            isServicesRunning = health.status === 200;
        }
        catch {
            isServicesRunning = false;
        }
        if (isServicesRunning) {
            // Create test user and project
            const testEmail = `env-test-${Date.now()}@example.com`;
            const signupResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
                email: testEmail,
                password: "TestPassword123!",
                name: "Env Test User",
                organizationName: "Env Test Org",
            });
            authToken = signupResponse.data.token;
            organizationId = signupResponse.data.organization.id;
            // Create a project
            const projectResponse = await axios_1.default.post(`${API_URL}/api/projects`, {
                name: "Environment Test Project",
                slug: "env-test",
                repository: "https://github.com/test/env-project",
                environments: [
                    { name: "production", slug: "prod" },
                    { name: "staging", slug: "staging" },
                    { name: "development", slug: "dev" },
                ],
            }, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            projectId = projectResponse.data.id;
        }
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup
        if (isServicesRunning && organizationId) {
            try {
                await prisma.deployment.deleteMany({
                    where: { projectId },
                });
                await prisma.secret.deleteMany({
                    where: { projectId },
                });
                await prisma.project.deleteMany({
                    where: { organizationId },
                });
                await prisma.user.deleteMany({
                    where: { organizationId },
                });
                await prisma.organization.delete({
                    where: { id: organizationId },
                });
            }
            catch (error) {
                console.error("Cleanup error:", error);
            }
        }
        await prisma.$disconnect();
    });
    (0, vitest_1.it)("should manage environment-specific variables", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Create production variables
        const prodVars = await axios_1.default.post(`${API_URL}/api/projects/${projectId}/secrets/bulk`, {
            environment: "production",
            secrets: [
                { key: "DATABASE_URL", value: "postgresql://prod-db:5432/app" },
                { key: "API_ENDPOINT", value: "https://api.production.com" },
                { key: "LOG_LEVEL", value: "error" },
            ],
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(prodVars.status).toBe(200);
        (0, vitest_1.expect)(prodVars.data.created).toBe(3);
        // Create staging variables with some overlap
        const stagingVars = await axios_1.default.post(`${API_URL}/api/projects/${projectId}/secrets/bulk`, {
            environment: "staging",
            secrets: [
                { key: "DATABASE_URL", value: "postgresql://staging-db:5432/app" },
                { key: "API_ENDPOINT", value: "https://api.staging.com" },
                { key: "LOG_LEVEL", value: "debug" },
                { key: "ENABLE_DEBUG", value: "true" },
            ],
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(stagingVars.status).toBe(200);
        (0, vitest_1.expect)(stagingVars.data.created).toBe(4);
    });
    (0, vitest_1.it)("should list environment-specific secrets", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Get production secrets
        const prodSecrets = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(prodSecrets.status).toBe(200);
        (0, vitest_1.expect)(prodSecrets.data.length).toBe(3);
        const prodDbUrl = prodSecrets.data.find((s) => s.key === "DATABASE_URL");
        (0, vitest_1.expect)(prodDbUrl).toBeDefined();
        (0, vitest_1.expect)(prodDbUrl.environment).toBe("production");
        // Get staging secrets
        const stagingSecrets = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets?environment=staging`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(stagingSecrets.status).toBe(200);
        (0, vitest_1.expect)(stagingSecrets.data.length).toBe(4);
        const enableDebug = stagingSecrets.data.find((s) => s.key === "ENABLE_DEBUG");
        (0, vitest_1.expect)(enableDebug).toBeDefined();
        (0, vitest_1.expect)(enableDebug.environment).toBe("staging");
    });
    (0, vitest_1.it)("should update environment variables and trigger redeploy", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Get a secret to update
        const secrets = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const secretToUpdate = secrets.data.find((s) => s.key === "LOG_LEVEL");
        // Update the secret
        const updateResponse = await axios_1.default.patch(`${API_URL}/api/projects/${projectId}/secrets/${secretToUpdate.id}`, {
            value: "warning",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(updateResponse.status).toBe(200);
        // In a real scenario, this might trigger a redeployment
        // Check if deployment was triggered (if implemented)
    });
    (0, vitest_1.it)("should create multiple deployments for rollback testing", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Create several deployments to have rollback history
        const deploymentPromises = [];
        for (let i = 0; i < 3; i++) {
            deploymentPromises.push(axios_1.default.post(`${API_URL}/api/deployments`, {
                projectId,
                environment: "production",
                buildId: `test-build-${i}`,
                version: `v1.0.${i}`,
                triggeredBy: "api",
                metadata: {
                    commit: `abc${i}${i}${i}`,
                    message: `Deployment ${i}`,
                },
            }, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            }));
            // Small delay between deployments
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const deploymentResponses = await Promise.all(deploymentPromises);
        deploymentResponses.forEach((response, index) => {
            (0, vitest_1.expect)(response.status).toBe(201);
            (0, vitest_1.expect)(response.data.version).toBe(`v1.0.${index}`);
            deploymentIds.push(response.data.id);
        });
    });
    (0, vitest_1.it)("should rollback to previous deployment", async function () {
        if (!isServicesRunning ||
            !authToken ||
            !projectId ||
            deploymentIds.length < 2) {
            this.skip();
        }
        // Perform rollback
        const rollbackResponse = await axios_1.default.post(`${API_URL}/api/rollback`, {
            projectId,
            environment: "production",
            reason: "Found critical bug in latest deployment",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(rollbackResponse.status).toBe(200);
        (0, vitest_1.expect)(rollbackResponse.data).toHaveProperty("deployment");
        (0, vitest_1.expect)(rollbackResponse.data.deployment.isRollback).toBe(true);
        (0, vitest_1.expect)(rollbackResponse.data.deployment.rollbackFromId).toBe(deploymentIds[deploymentIds.length - 1]);
        // Should rollback to the second-to-last deployment
        (0, vitest_1.expect)(rollbackResponse.data.deployment.metadata?.originalDeploymentId).toBeDefined();
    });
    (0, vitest_1.it)("should rollback to specific deployment version", async function () {
        if (!isServicesRunning ||
            !authToken ||
            !projectId ||
            deploymentIds.length < 3) {
            this.skip();
        }
        // Rollback to first deployment
        const rollbackResponse = await axios_1.default.post(`${API_URL}/api/rollback`, {
            projectId,
            environment: "production",
            targetDeploymentId: deploymentIds[0],
            reason: "Rolling back to stable version",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(rollbackResponse.status).toBe(200);
        (0, vitest_1.expect)(rollbackResponse.data.deployment.isRollback).toBe(true);
        (0, vitest_1.expect)(rollbackResponse.data.deployment.version).toContain("v1.0.0");
    });
    (0, vitest_1.it)("should handle rollback when no previous deployment exists", async function () {
        if (!isServicesRunning || !authToken) {
            this.skip();
        }
        // Create a new project with no deployments
        const newProjectResponse = await axios_1.default.post(`${API_URL}/api/projects`, {
            name: "Empty Project",
            slug: "empty-project",
            repository: "https://github.com/test/empty",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const emptyProjectId = newProjectResponse.data.id;
        // Try to rollback
        try {
            await axios_1.default.post(`${API_URL}/api/rollback`, {
                projectId: emptyProjectId,
                environment: "production",
                reason: "Testing rollback on empty project",
            }, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            vitest_1.expect.fail("Expected rollback to fail with no deployments");
        }
        catch (error) {
            (0, vitest_1.expect)(error.response?.status).toBe(404);
            (0, vitest_1.expect)(error.response?.data?.error).toContain("No previous deployment found");
        }
        // Cleanup
        await axios_1.default.delete(`${API_URL}/api/projects/${emptyProjectId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
    });
    (0, vitest_1.it)("should preserve environment variables during rollback", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Get current secrets
        const secretsBefore = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const secretCount = secretsBefore.data.length;
        // Perform a rollback
        const rollbackResponse = await axios_1.default.post(`${API_URL}/api/rollback`, {
            projectId,
            environment: "production",
            reason: "Testing secret preservation",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(rollbackResponse.status).toBe(200);
        // Check secrets after rollback
        const secretsAfter = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        // Secrets should be preserved
        (0, vitest_1.expect)(secretsAfter.data.length).toBe(secretCount);
    });
    (0, vitest_1.it)("should handle environment-specific deployments", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Deploy to staging
        const stagingDeploy = await axios_1.default.post(`${API_URL}/api/deployments`, {
            projectId,
            environment: "staging",
            buildId: "staging-build-1",
            version: "v2.0.0-staging",
            triggeredBy: "api",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(stagingDeploy.status).toBe(201);
        (0, vitest_1.expect)(stagingDeploy.data.environment).toBe("staging");
        // Deploy to development
        const devDeploy = await axios_1.default.post(`${API_URL}/api/deployments`, {
            projectId,
            environment: "development",
            buildId: "dev-build-1",
            version: "v2.1.0-dev",
            triggeredBy: "api",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(devDeploy.status).toBe(201);
        (0, vitest_1.expect)(devDeploy.data.environment).toBe("development");
        // List deployments by environment
        const prodDeployments = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/deployments?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const stagingDeployments = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/deployments?environment=staging`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        // Verify environment isolation
        (0, vitest_1.expect)(prodDeployments.data.deployments.every((d) => d.environment === "production")).toBe(true);
        (0, vitest_1.expect)(stagingDeployments.data.deployments.every((d) => d.environment === "staging")).toBe(true);
    });
    (0, vitest_1.it)("should handle preview environment lifecycle", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            this.skip();
        }
        // Create a preview environment deployment (simulating PR)
        const previewDeploy = await axios_1.default.post(`${API_URL}/api/deployments`, {
            projectId,
            environment: "preview-pr-123",
            buildId: "preview-build-123",
            version: "pr-123",
            triggeredBy: "webhook",
            metadata: {
                pullRequest: {
                    number: 123,
                    title: "Add new feature",
                    branch: "feature/new-feature",
                },
            },
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(previewDeploy.status).toBe(201);
        (0, vitest_1.expect)(previewDeploy.data.environment).toBe("preview-pr-123");
        // List all deployments including preview
        const allDeployments = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/deployments`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const previewDeployment = allDeployments.data.deployments.find((d) => d.environment === "preview-pr-123");
        (0, vitest_1.expect)(previewDeployment).toBeDefined();
        (0, vitest_1.expect)(previewDeployment.metadata.pullRequest).toBeDefined();
    });
});
//# sourceMappingURL=environment-rollback.test.js.map