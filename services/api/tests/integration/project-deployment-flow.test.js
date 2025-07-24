"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
const client_api_1 = require("@prisma/client-api");
(0, vitest_1.describe)("Project Creation and Deployment Flow", () => {
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
    const prisma = new client_api_1.PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL ||
                    "postgresql://postgres:postgres@localhost:5434/postgres",
            },
        },
    });
    let isServicesRunning = false;
    let authToken;
    let organizationId;
    let projectId;
    let buildId;
    let deploymentId;
    (0, vitest_1.beforeAll)(async () => {
        // Check if services are running
        try {
            const [apiHealth, builderHealth] = await Promise.all([
                axios_1.default.get(`${API_URL}/health`),
                axios_1.default.get(`${BUILDER_URL}/health`),
            ]);
            isServicesRunning =
                apiHealth.status === 200 && builderHealth.status === 200;
        }
        catch {
            isServicesRunning = false;
        }
        if (isServicesRunning) {
            // Create test user and get auth token
            const testEmail = `project-test-${Date.now()}@example.com`;
            const signupResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
                email: testEmail,
                password: "TestPassword123!",
                name: "Project Test User",
                organizationName: "Project Test Org",
            });
            authToken = signupResponse.data.token;
            organizationId = signupResponse.data.organization.id;
        }
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup test data
        if (isServicesRunning && organizationId) {
            try {
                await prisma.deployment.deleteMany({
                    where: { projectId },
                });
                await prisma.build.deleteMany({
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
    (0, vitest_1.it)("should create a new project", async function () {
        if (!isServicesRunning || !authToken) {
            return;
        }
        const projectResponse = await axios_1.default.post(`${API_URL}/api/projects/organizations/${organizationId}/projects`, {
            name: "Test Node.js App",
            repository: "https://github.com/test/nodejs-app",
            framework: "node",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(projectResponse.status).toBe(201);
        (0, vitest_1.expect)(projectResponse.data).toHaveProperty("id");
        (0, vitest_1.expect)(projectResponse.data.name).toBe("Test Node.js App");
        (0, vitest_1.expect)(projectResponse.data).toHaveProperty("slug");
        (0, vitest_1.expect)(projectResponse.data.organizationId).toBe(organizationId);
        projectId = projectResponse.data.id;
    });
    (0, vitest_1.it)("should list projects for organization", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const listResponse = await axios_1.default.get(`${API_URL}/api/projects/organizations/${organizationId}/projects`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(listResponse.data)).toBe(true);
        (0, vitest_1.expect)(listResponse.data.length).toBeGreaterThan(0);
        const project = listResponse.data.find((p) => p.id === projectId);
        (0, vitest_1.expect)(project).toBeDefined();
        (0, vitest_1.expect)(project.name).toBe("Test Node.js App");
    });
    (0, vitest_1.it)("should get project details", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const projectResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(projectResponse.status).toBe(200);
        (0, vitest_1.expect)(projectResponse.data.id).toBe(projectId);
        (0, vitest_1.expect)(projectResponse.data.environments).toBeDefined();
        (0, vitest_1.expect)(Array.isArray(projectResponse.data.environments)).toBe(true);
    });
    (0, vitest_1.it)("should update project settings", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const updateResponse = await axios_1.default.patch(`${API_URL}/api/projects/${projectId}`, {
            buildCommand: "npm run build:prod",
            environmentVariables: {
                NODE_ENV: "production",
                API_URL: "https://api.example.com",
            },
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(updateResponse.status).toBe(200);
        (0, vitest_1.expect)(updateResponse.data.buildCommand).toBe("npm run build:prod");
    });
    (0, vitest_1.it)("should create and manage secrets", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        // Create a secret
        const createResponse = await axios_1.default.post(`${API_URL}/api/projects/${projectId}/secrets`, {
            key: "DATABASE_URL",
            value: "postgresql://user:pass@localhost/db",
            environment: "production",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(201);
        (0, vitest_1.expect)(createResponse.data).toHaveProperty("id");
        (0, vitest_1.expect)(createResponse.data.key).toBe("DATABASE_URL");
        (0, vitest_1.expect)(createResponse.data.value).toBeUndefined(); // Should not return value
        const secretId = createResponse.data.id;
        // List secrets
        const listResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/secrets`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(listResponse.data)).toBe(true);
        (0, vitest_1.expect)(listResponse.data.length).toBeGreaterThan(0);
        const secret = listResponse.data.find((s) => s.id === secretId);
        (0, vitest_1.expect)(secret).toBeDefined();
        (0, vitest_1.expect)(secret.key).toBe("DATABASE_URL");
        (0, vitest_1.expect)(secret.value).toBeUndefined(); // Should not return value
        // Update secret
        const updateResponse = await axios_1.default.patch(`${API_URL}/api/projects/${projectId}/secrets/${secretId}`, {
            value: "postgresql://newuser:newpass@localhost/db",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(updateResponse.status).toBe(200);
        // Delete secret
        const deleteResponse = await axios_1.default.delete(`${API_URL}/api/projects/${projectId}/secrets/${secretId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(deleteResponse.status).toBe(204);
    });
    (0, vitest_1.it)("should create bulk secrets", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const bulkResponse = await axios_1.default.post(`${API_URL}/api/projects/${projectId}/secrets/bulk`, {
            environment: "production",
            secrets: [
                { key: "API_KEY", value: "secret-api-key" },
                { key: "REDIS_URL", value: "redis://localhost:6379" },
                { key: "JWT_SECRET", value: "super-secret-jwt" },
            ],
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(bulkResponse.status).toBe(200);
        (0, vitest_1.expect)(bulkResponse.data.created).toBe(3);
        (0, vitest_1.expect)(bulkResponse.data.updated).toBe(0);
    });
    (0, vitest_1.it)("should trigger a build", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const buildResponse = await axios_1.default.post(`${API_URL}/api/builds`, {
            projectId,
            branch: "main",
            commitSha: "abc123def456",
            commitMessage: "Test build",
            triggeredBy: "api",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(buildResponse.status).toBe(201);
        (0, vitest_1.expect)(buildResponse.data).toHaveProperty("id");
        (0, vitest_1.expect)(buildResponse.data.status).toBe("pending");
        (0, vitest_1.expect)(buildResponse.data.projectId).toBe(projectId);
        buildId = buildResponse.data.id;
    });
    (0, vitest_1.it)("should get build status", async function () {
        if (!isServicesRunning || !authToken || !buildId) {
            return;
        }
        // Wait a moment for build to start
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const buildResponse = await axios_1.default.get(`${API_URL}/api/builds/${buildId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(buildResponse.status).toBe(200);
        (0, vitest_1.expect)(buildResponse.data.id).toBe(buildId);
        (0, vitest_1.expect)(["pending", "running", "success", "failed"]).toContain(buildResponse.data.status);
    });
    (0, vitest_1.it)("should list builds for project", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const listResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/builds`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(listResponse.data).toHaveProperty("builds");
        (0, vitest_1.expect)(listResponse.data).toHaveProperty("total");
        (0, vitest_1.expect)(Array.isArray(listResponse.data.builds)).toBe(true);
        if (buildId) {
            const build = listResponse.data.builds.find((b) => b.id === buildId);
            (0, vitest_1.expect)(build).toBeDefined();
        }
    });
    (0, vitest_1.it)("should handle pagination for builds", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const paginatedResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/builds?limit=5&offset=0`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(paginatedResponse.status).toBe(200);
        (0, vitest_1.expect)(paginatedResponse.data.builds.length).toBeLessThanOrEqual(5);
        (0, vitest_1.expect)(paginatedResponse.data).toHaveProperty("limit", 5);
        (0, vitest_1.expect)(paginatedResponse.data).toHaveProperty("offset", 0);
    });
    (0, vitest_1.it)("should create a deployment", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        // For testing, we'll create a deployment even if build isn't complete
        const deployResponse = await axios_1.default.post(`${API_URL}/api/deployments`, {
            projectId,
            environment: "production",
            buildId: buildId || "test-build-id",
            triggeredBy: "api",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(deployResponse.status).toBe(201);
        (0, vitest_1.expect)(deployResponse.data).toHaveProperty("id");
        (0, vitest_1.expect)(deployResponse.data.status).toBe("pending");
        (0, vitest_1.expect)(deployResponse.data.environment).toBe("production");
        deploymentId = deployResponse.data.id;
    });
    (0, vitest_1.it)("should list deployments for project", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const listResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/deployments`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(listResponse.data).toHaveProperty("deployments");
        (0, vitest_1.expect)(Array.isArray(listResponse.data.deployments)).toBe(true);
        if (deploymentId) {
            const deployment = listResponse.data.deployments.find((d) => d.id === deploymentId);
            (0, vitest_1.expect)(deployment).toBeDefined();
        }
    });
    (0, vitest_1.it)("should get latest deployment for environment", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const latestResponse = await axios_1.default.get(`${API_URL}/api/projects/${projectId}/deployments/latest?environment=production`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(latestResponse.status).toBe(200);
        if (latestResponse.data) {
            (0, vitest_1.expect)(latestResponse.data.environment).toBe("production");
        }
    });
    (0, vitest_1.it)("should handle rollback requests", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        // First create another deployment to have something to rollback to
        const secondDeploy = await axios_1.default.post(`${API_URL}/api/deployments`, {
            projectId,
            environment: "production",
            buildId: buildId || "test-build-id-2",
            triggeredBy: "api",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(secondDeploy.status).toBe(201);
        // Now attempt rollback
        const rollbackResponse = await axios_1.default.post(`${API_URL}/api/rollback`, {
            projectId,
            environment: "production",
            reason: "Testing rollback functionality",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(rollbackResponse.status).toBe(200);
        (0, vitest_1.expect)(rollbackResponse.data).toHaveProperty("deployment");
        (0, vitest_1.expect)(rollbackResponse.data.deployment.isRollback).toBe(true);
    });
    (0, vitest_1.it)("should handle project deletion", async function () {
        if (!isServicesRunning || !authToken || !projectId) {
            return;
        }
        const deleteResponse = await axios_1.default.delete(`${API_URL}/api/projects/${projectId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(deleteResponse.status).toBe(204);
        // Verify project is deleted
        try {
            await axios_1.default.get(`${API_URL}/api/projects/${projectId}`, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            vitest_1.expect.fail("Expected 404 for deleted project");
        }
        catch (error) {
            const axiosError = error;
            (0, vitest_1.expect)(axiosError.response?.status).toBe(404);
        }
    });
    (0, vitest_1.it)("should enforce project access control", async function () {
        if (!isServicesRunning) {
            return;
        }
        // Create another user
        const otherEmail = `other-${Date.now()}@example.com`;
        const otherUserResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
            email: otherEmail,
            password: "TestPassword123!",
            name: "Other User",
            organizationName: "Other Org",
        });
        const otherToken = otherUserResponse.data.token;
        // Create a project with first user
        const projectResponse = await axios_1.default.post(`${API_URL}/api/projects/organizations/${organizationId}/projects`, {
            name: "Private Project",
            repository: "https://github.com/test/private",
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const privateProjectId = projectResponse.data.id;
        // Try to access with other user - should fail
        try {
            await axios_1.default.get(`${API_URL}/api/projects/${privateProjectId}`, {
                headers: {
                    Authorization: `Bearer ${otherToken}`,
                },
            });
            vitest_1.expect.fail("Expected 404 for unauthorized project access");
        }
        catch (error) {
            const axiosError = error;
            (0, vitest_1.expect)(axiosError.response?.status).toBe(404);
        }
        // Cleanup
        await axios_1.default.delete(`${API_URL}/api/projects/${privateProjectId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
    });
});
//# sourceMappingURL=project-deployment-flow.test.js.map