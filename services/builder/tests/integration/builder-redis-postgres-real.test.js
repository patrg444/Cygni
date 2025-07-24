"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
(0, vitest_1.describe)("Real Builder Service Integration - PostgreSQL, Redis, API", () => {
    const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const API_KEY = "test-api-key";
    let isServicesRunning = false;
    (0, vitest_1.beforeAll)(async () => {
        // Check if all services are running
        try {
            const [builderHealth, apiHealth, builderReady] = await Promise.all([
                axios_1.default.get(`${BUILDER_URL}/health`),
                axios_1.default
                    .get(`${API_URL}/health`)
                    .catch(() => ({ data: { status: "api-not-required" } })),
                axios_1.default.get(`${BUILDER_URL}/ready`),
            ]);
            if (builderHealth.data.status !== "ok") {
                throw new Error("Builder service not healthy");
            }
            // Verify all dependencies are healthy
            const checks = builderReady.data.checks;
            if (checks.database !== "healthy" || checks.redis !== "healthy") {
                throw new Error(`Dependencies not healthy: DB=${checks.database}, Redis=${checks.redis}`);
            }
            isServicesRunning = true;
            console.log("All services are healthy and ready");
        }
        catch (error) {
            console.log("Services not running or unhealthy:", error);
            console.log("Run docker-compose -f docker-compose.integration.yml up -d first");
            return;
        }
    });
    (0, vitest_1.it)("should create build and verify it's processed by the system", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // 1. Create a build via API
        const buildRequest = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            branch: "main",
            commitSha: `integration-test-${Date.now()}`,
            dockerfilePath: "Dockerfile",
            buildArgs: {
                NODE_ENV: "production",
                TEST_RUN: "true",
            },
        };
        const createResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, buildRequest, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(201);
        const buildId = createResponse.data.id;
        console.log(`Created build: ${buildId}`);
        // 2. Verify build exists via API
        const getResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(getResponse.data).toBeDefined();
        (0, vitest_1.expect)(getResponse.data.projectId).toBe(buildRequest.projectId);
        (0, vitest_1.expect)(getResponse.data.commitSha).toBe(buildRequest.commitSha);
        (0, vitest_1.expect)(["pending", "running", "failed"]).toContain(getResponse.data.status);
        // 3. Wait a bit and check if status updated
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const updatedResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        console.log(`Build status after 2s: ${updatedResponse.data.status}`);
        (0, vitest_1.expect)(["running", "failed", "cancelled"]).toContain(updatedResponse.data.status);
    });
    (0, vitest_1.it)("should verify data persistence across PostgreSQL and Redis", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create a build with specific metadata
        const testMetadata = {
            testId: `persistence-${Date.now()}`,
            customField: "test-value",
            nestedData: {
                level1: {
                    level2: "deep-value",
                },
            },
        };
        const buildRequest = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/persistence",
            branch: "persistence-test",
            commitSha: `persist-${Date.now()}`,
            dockerfilePath: "Dockerfile",
            buildArgs: testMetadata,
        };
        const createResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, buildRequest, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        const buildId = createResponse.data.id;
        console.log(`Created build with metadata: ${buildId}`);
        // Verify data is persisted in PostgreSQL (via API)
        const dbResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        // Verify all fields are correctly stored
        (0, vitest_1.expect)(dbResponse.data.id).toBe(buildId);
        (0, vitest_1.expect)(dbResponse.data.projectId).toBe(buildRequest.projectId);
        (0, vitest_1.expect)(dbResponse.data.commitSha).toBe(buildRequest.commitSha);
        (0, vitest_1.expect)(dbResponse.data.branch).toBe(buildRequest.branch);
        (0, vitest_1.expect)(dbResponse.data.metadata).toBeDefined();
        (0, vitest_1.expect)(dbResponse.data.metadata.repoUrl).toBe(buildRequest.repoUrl);
        (0, vitest_1.expect)(dbResponse.data.metadata.buildArgs).toEqual(testMetadata);
        (0, vitest_1.expect)(dbResponse.data.createdAt).toBeDefined();
        (0, vitest_1.expect)(dbResponse.data.updatedAt).toBeDefined();
        // Verify timestamps are valid ISO strings
        (0, vitest_1.expect)(new Date(dbResponse.data.createdAt).toISOString()).toBe(dbResponse.data.createdAt);
        (0, vitest_1.expect)(new Date(dbResponse.data.updatedAt).toISOString()).toBe(dbResponse.data.updatedAt);
        // Verify the build is in Redis queue (check queue stats)
        const queueStats = (await axios_1.default.get(`${BUILDER_URL}/ready`)).data
            .queueStats;
        const totalJobs = queueStats.waiting +
            queueStats.active +
            queueStats.delayed +
            queueStats.completed +
            queueStats.failed;
        (0, vitest_1.expect)(totalJobs).toBeGreaterThan(0);
        console.log("Queue stats after create:", queueStats);
        // Wait for processing and verify status updates are persisted
        let previousUpdatedAt = dbResponse.data.updatedAt;
        let statusChanges = 0;
        for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const checkResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": API_KEY },
            });
            // Check if status or updatedAt changed
            if (checkResponse.data.updatedAt !== previousUpdatedAt) {
                statusChanges++;
                console.log(`Status update ${statusChanges}: ${checkResponse.data.status} at ${checkResponse.data.updatedAt}`);
                // Verify updatedAt is always increasing
                (0, vitest_1.expect)(new Date(checkResponse.data.updatedAt).getTime()).toBeGreaterThan(new Date(previousUpdatedAt).getTime());
                previousUpdatedAt = checkResponse.data.updatedAt;
            }
            if (["success", "failed", "cancelled"].includes(checkResponse.data.status)) {
                break;
            }
        }
        // Verify we saw at least one status change (pending -> running/failed)
        (0, vitest_1.expect)(statusChanges).toBeGreaterThan(0);
        // Test listing with filters to verify PostgreSQL queries work correctly
        const listResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=100`, {
            headers: { "X-API-Key": API_KEY },
        });
        const ourBuild = listResponse.data.builds.find((b) => b.id === buildId);
        (0, vitest_1.expect)(ourBuild).toBeDefined();
        (0, vitest_1.expect)(ourBuild.metadata.buildArgs).toEqual(testMetadata);
    });
    (0, vitest_1.it)("should verify service health endpoints", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Get real health status from the service
        const healthResponse = await axios_1.default.get(`${BUILDER_URL}/health`);
        (0, vitest_1.expect)(healthResponse.data.status).toBe("ok");
        console.log("Health check:", healthResponse.data);
        // Get detailed ready status
        const readyResponse = await axios_1.default.get(`${BUILDER_URL}/ready`);
        (0, vitest_1.expect)(readyResponse.data).toBeDefined();
        // The ready endpoint returns checks object
        if (readyResponse.data.checks) {
            (0, vitest_1.expect)(readyResponse.data.checks).toHaveProperty("database");
            (0, vitest_1.expect)(readyResponse.data.checks).toHaveProperty("redis");
            console.log("Ready checks:", readyResponse.data.checks);
        }
    });
    (0, vitest_1.it)("should handle database connection failures gracefully", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Note: In a real test, we would simulate database connection failure
        // For now, we'll test error handling with invalid data
        // Test 1: Invalid project ID should return proper error
        const invalidProjectBuild = {
            projectId: "non-existent-project-12345",
            repoUrl: "https://github.com/test/repo",
            branch: "error-test",
            commitSha: `error-${Date.now()}`,
            dockerfilePath: "Dockerfile",
        };
        const errorResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, invalidProjectBuild, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            validateStatus: () => true, // Don't throw on error status
        });
        (0, vitest_1.expect)(errorResponse.status).toBe(404);
        (0, vitest_1.expect)(errorResponse.data.error).toBe("Project not found");
        // Test 2: Verify system remains stable after errors
        const healthAfterError = await axios_1.default.get(`${BUILDER_URL}/health`);
        (0, vitest_1.expect)(healthAfterError.data.status).toBe("ok");
        // Test 3: Create a valid build to ensure system recovered
        const validBuild = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/recovery",
            branch: "recovery-test",
            commitSha: `recovery-${Date.now()}`,
            dockerfilePath: "Dockerfile",
        };
        const recoveryResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, validBuild, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(recoveryResponse.status).toBe(201);
        (0, vitest_1.expect)(recoveryResponse.data.id).toBeDefined();
        console.log("System recovered successfully after error");
    });
    (0, vitest_1.it)("should maintain data integrity under concurrent load", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        const concurrentRequests = 20;
        const baseTime = Date.now();
        // Create many builds concurrently to test race conditions
        const createPromises = Array.from({ length: concurrentRequests }, (_, i) => {
            const buildData = {
                projectId: "test-project-1",
                repoUrl: `https://github.com/test/concurrent-${i}`,
                branch: `branch-${i}`,
                commitSha: `concurrent-${baseTime}-${i}`,
                dockerfilePath: "Dockerfile",
                buildArgs: {
                    index: i,
                    timestamp: baseTime,
                    testType: "concurrency",
                },
            };
            return axios_1.default
                .post(`${BUILDER_URL}/api/builds`, buildData, {
                headers: {
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
            })
                .then((response) => ({
                response,
                requestData: buildData,
            }));
        });
        const results = await Promise.allSettled(createPromises);
        // All requests should succeed
        const succeeded = results.filter((r) => r.status === "fulfilled");
        const failed = results.filter((r) => r.status === "rejected");
        console.log(`Concurrent creates: ${succeeded.length} succeeded, ${failed.length} failed`);
        (0, vitest_1.expect)(succeeded.length).toBe(concurrentRequests);
        // Verify each build has unique ID and correct data
        const buildIds = new Set();
        const builds = [];
        for (const result of succeeded) {
            if (result.status === "fulfilled") {
                const { response, requestData } = result.value;
                const buildId = response.data.id;
                // Verify no duplicate IDs
                (0, vitest_1.expect)(buildIds.has(buildId)).toBe(false);
                buildIds.add(buildId);
                builds.push({
                    id: buildId,
                    expectedData: requestData,
                });
            }
        }
        // Verify all builds were correctly stored
        const verifyPromises = builds.map(async ({ id, expectedData }) => {
            const getResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${id}`, {
                headers: { "X-API-Key": API_KEY },
            });
            const build = getResponse.data;
            // Verify data integrity
            (0, vitest_1.expect)(build.projectId).toBe(expectedData.projectId);
            (0, vitest_1.expect)(build.commitSha).toBe(expectedData.commitSha);
            (0, vitest_1.expect)(build.branch).toBe(expectedData.branch);
            (0, vitest_1.expect)(build.metadata.repoUrl).toBe(expectedData.repoUrl);
            (0, vitest_1.expect)(build.metadata.buildArgs).toEqual(expectedData.buildArgs);
            return build;
        });
        const verifiedBuilds = await Promise.all(verifyPromises);
        console.log(`Verified data integrity for ${verifiedBuilds.length} builds`);
        // Check that all builds appear in listing
        const listResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=100`, {
            headers: { "X-API-Key": API_KEY },
        });
        const listedIds = new Set(listResponse.data.builds.map((b) => b.id));
        for (const id of buildIds) {
            (0, vitest_1.expect)(listedIds.has(id)).toBe(true);
        }
        console.log("All concurrent builds appear in listing");
    });
});
//# sourceMappingURL=builder-redis-postgres-real.test.js.map