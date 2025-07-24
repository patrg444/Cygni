"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
// This test runs against real services started by docker-compose
(0, vitest_1.describe)("Real Integration Test - Builder Service", () => {
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
    const API_KEY = "test-api-key";
    let isServicesRunning = false;
    (0, vitest_1.beforeAll)(async () => {
        // Check if services are running
        try {
            await axios_1.default.get(`${API_URL}/health`);
            await axios_1.default.get(`${BUILDER_URL}/health`);
            isServicesRunning = true;
        }
        catch (error) {
            console.log("Services not running. Run docker-compose -f docker-compose.integration.yml up -d first");
            return;
        }
    });
    (0, vitest_1.it)("should create and process a real build through the entire pipeline", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // 1. Create a build via Builder API
        const buildRequest = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            branch: "main",
            commitSha: "test-commit-" + Date.now(),
            dockerfilePath: "Dockerfile",
            buildArgs: {
                NODE_ENV: "production",
                BUILD_TIME: new Date().toISOString(),
            },
        };
        console.log("Creating build via Builder API...");
        const createResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, buildRequest, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(201);
        (0, vitest_1.expect)(createResponse.data).toHaveProperty("id");
        (0, vitest_1.expect)(createResponse.data).toHaveProperty("status");
        (0, vitest_1.expect)(createResponse.data).toHaveProperty("createdAt");
        const buildId = createResponse.data.id;
        console.log(`Build created with ID: ${buildId}`);
        // 2. Verify build has all required fields and correct data
        const getBuildResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        const build = getBuildResponse.data;
        (0, vitest_1.expect)(build).toBeTruthy();
        (0, vitest_1.expect)(build.projectId).toBe("test-project-1");
        (0, vitest_1.expect)(build.commitSha).toBe(buildRequest.commitSha);
        (0, vitest_1.expect)(build.branch).toBe(buildRequest.branch);
        (0, vitest_1.expect)(build.metadata).toBeTruthy();
        (0, vitest_1.expect)(build.metadata).toHaveProperty("repoUrl", buildRequest.repoUrl);
        (0, vitest_1.expect)(build.metadata).toHaveProperty("dockerfilePath", buildRequest.dockerfilePath);
        (0, vitest_1.expect)(build.metadata).toHaveProperty("buildArgs");
        (0, vitest_1.expect)(build.metadata.buildArgs).toEqual(buildRequest.buildArgs);
        // Verify timestamps are properly set
        (0, vitest_1.expect)(new Date(build.createdAt).getTime()).toBeGreaterThan(Date.now() - 10000);
        (0, vitest_1.expect)(new Date(build.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(build.createdAt).getTime());
        // 3. Verify build transitions through states properly
        const stateTransitions = [];
        let previousStatus = build.status;
        stateTransitions.push(previousStatus);
        console.log("Tracking build state transitions...");
        let attempts = 0;
        const maxAttempts = 15; // 15 seconds
        while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": API_KEY },
            });
            const currentStatus = statusResponse.data.status;
            const currentBuild = statusResponse.data;
            // Check if status changed
            if (currentStatus !== previousStatus) {
                stateTransitions.push(currentStatus);
                console.log(`Build ${buildId} transitioned: ${previousStatus} → ${currentStatus}`);
                // Verify updatedAt changed when status changed
                (0, vitest_1.expect)(new Date(currentBuild.updatedAt).getTime()).toBeGreaterThan(new Date(build.updatedAt).getTime());
                previousStatus = currentStatus;
            }
            // Verify logs are being captured (if build failed)
            if (currentStatus === "failed" && currentBuild.logs) {
                (0, vitest_1.expect)(currentBuild.logs).toBeTruthy();
                (0, vitest_1.expect)(currentBuild.logs.length).toBeGreaterThan(0);
                console.log(`Build logs captured: ${currentBuild.logs.length} characters`);
                // Logs should contain error information
                (0, vitest_1.expect)(currentBuild.logs.toLowerCase()).toMatch(/error|failed|exception/);
                break;
            }
            // Stop if build is in terminal state
            if (["success", "failed", "cancelled"].includes(currentStatus)) {
                break;
            }
            attempts++;
        }
        // Verify we saw expected state transitions
        (0, vitest_1.expect)(stateTransitions.length).toBeGreaterThanOrEqual(1); // At least one state
        // Build might start as pending or running depending on queue speed
        (0, vitest_1.expect)(["pending", "running"]).toContain(stateTransitions[0]);
        // Verify final state is terminal
        const finalStatus = stateTransitions[stateTransitions.length - 1];
        (0, vitest_1.expect)(["failed", "success", "cancelled"]).toContain(finalStatus);
        console.log(`State transitions: ${stateTransitions.join(" → ")}`);
        // 4. Test build logs endpoint
        const logsResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}/logs`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(logsResponse.status).toBe(200);
        (0, vitest_1.expect)(logsResponse.data).toHaveProperty("logs");
        (0, vitest_1.expect)(logsResponse.data).toHaveProperty("status");
        // 5. Verify health endpoints report accurate information
        const builderHealth = await axios_1.default.get(`${BUILDER_URL}/health`);
        (0, vitest_1.expect)(builderHealth.status).toBe(200);
        (0, vitest_1.expect)(builderHealth.data).toHaveProperty("status", "ok");
        (0, vitest_1.expect)(builderHealth.data).toHaveProperty("timestamp");
        const builderReady = await axios_1.default.get(`${BUILDER_URL}/ready`);
        (0, vitest_1.expect)(builderReady.status).toBe(200);
        (0, vitest_1.expect)(builderReady.data).toHaveProperty("status", "ready");
        (0, vitest_1.expect)(builderReady.data.checks).toHaveProperty("database", "healthy");
        (0, vitest_1.expect)(builderReady.data.checks).toHaveProperty("redis", "healthy");
        (0, vitest_1.expect)(builderReady.data.checks).toHaveProperty("worker");
        // If build failed, verify error details
        if (finalStatus === "failed") {
            const failedBuild = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": API_KEY },
            });
            // Failed builds should have logs (might be empty string if build fails immediately)
            (0, vitest_1.expect)(failedBuild.data).toHaveProperty("logs");
            // Log the actual failure reason for debugging
            console.log(`Build failed with logs: ${failedBuild.data.logs || "(empty)"}`);
        }
    }, 60000); // 1 minute timeout
    (0, vitest_1.it)("should handle concurrent builds correctly", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        const numberOfBuilds = 5;
        const baseTimestamp = Date.now();
        // Create builds with unique identifiers
        const buildRequests = Array.from({ length: numberOfBuilds }, (_, i) => ({
            projectId: "test-project-1",
            repoUrl: `https://github.com/test/repo-${i}`,
            branch: `concurrent-branch-${i}`,
            commitSha: `concurrent-${baseTimestamp}-${i}`,
            dockerfilePath: "Dockerfile",
            buildArgs: {
                BUILD_NUMBER: String(i),
                CONCURRENT_TEST: "true",
            },
        }));
        console.log(`Creating ${numberOfBuilds} concurrent builds...`);
        const startTime = Date.now();
        // Create builds concurrently
        const buildPromises = buildRequests.map((req) => axios_1.default.post(`${BUILDER_URL}/api/builds`, req, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        }));
        const responses = await Promise.all(buildPromises);
        const createDuration = Date.now() - startTime;
        console.log(`Created ${numberOfBuilds} builds in ${createDuration}ms`);
        // All should return 201 and have unique IDs
        const buildIds = new Set();
        responses.forEach((response, index) => {
            (0, vitest_1.expect)(response.status).toBe(201);
            (0, vitest_1.expect)(response.data).toHaveProperty("id");
            (0, vitest_1.expect)(response.data).toHaveProperty("status");
            (0, vitest_1.expect)(response.data).toHaveProperty("createdAt");
            // Verify no duplicate IDs
            (0, vitest_1.expect)(buildIds.has(response.data.id)).toBe(false);
            buildIds.add(response.data.id);
        });
        // Verify all builds were created with correct data
        const buildDetailsPromises = Array.from(buildIds).map((id) => axios_1.default.get(`${BUILDER_URL}/api/builds/${id}`, {
            headers: { "X-API-Key": API_KEY },
        }));
        const buildDetails = await Promise.all(buildDetailsPromises);
        // Create a map to verify each build has its correct data
        const buildsByCommitSha = new Map();
        buildDetails.forEach((response) => {
            const build = response.data;
            buildsByCommitSha.set(build.commitSha, build);
        });
        // Verify each build request resulted in a correctly stored build
        buildRequests.forEach((request, index) => {
            const build = buildsByCommitSha.get(request.commitSha);
            (0, vitest_1.expect)(build).toBeTruthy();
            (0, vitest_1.expect)(build.branch).toBe(request.branch);
            (0, vitest_1.expect)(build.metadata.repoUrl).toBe(request.repoUrl);
            (0, vitest_1.expect)(build.metadata.buildArgs).toEqual(request.buildArgs);
        });
        // Wait a bit for queue processing
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Check how builds are being processed
        const statusCheckPromises = Array.from(buildIds).map((id) => axios_1.default.get(`${BUILDER_URL}/api/builds/${id}`, {
            headers: { "X-API-Key": API_KEY },
        }));
        const statusResponses = await Promise.all(statusCheckPromises);
        // Count builds by status
        const statusCounts = {
            pending: 0,
            running: 0,
            failed: 0,
            success: 0,
            cancelled: 0,
        };
        statusResponses.forEach((response) => {
            const status = response.data.status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log("Build status distribution after 2s:", statusCounts);
        // At least some builds should have progressed beyond pending
        const processingBuilds = statusCounts.running + statusCounts.failed + statusCounts.success;
        (0, vitest_1.expect)(processingBuilds).toBeGreaterThan(0);
        // Verify list endpoint returns all our builds
        const listResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=100`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(listResponse.data.builds).toBeInstanceOf(Array);
        (0, vitest_1.expect)(listResponse.data.total).toBeGreaterThanOrEqual(numberOfBuilds);
        // Verify our builds are in the list with correct data
        const listedBuilds = listResponse.data.builds;
        buildIds.forEach((buildId) => {
            const foundBuild = listedBuilds.find((b) => b.id === buildId);
            (0, vitest_1.expect)(foundBuild).toBeTruthy();
        });
        // Test pagination
        const pageSize = 2;
        const firstPageResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=${pageSize}&offset=0`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(firstPageResponse.data.builds.length).toBeLessThanOrEqual(pageSize);
        (0, vitest_1.expect)(firstPageResponse.data).toHaveProperty("total");
        (0, vitest_1.expect)(firstPageResponse.data).toHaveProperty("limit", pageSize);
        (0, vitest_1.expect)(firstPageResponse.data).toHaveProperty("offset", 0);
        // If there are more builds, test second page
        if (firstPageResponse.data.total > pageSize) {
            const secondPageResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=${pageSize}&offset=${pageSize}`, {
                headers: { "X-API-Key": API_KEY },
            });
            (0, vitest_1.expect)(secondPageResponse.data.builds.length).toBeGreaterThan(0);
            // Ensure no overlap between pages
            const firstPageIds = new Set(firstPageResponse.data.builds.map((b) => b.id));
            secondPageResponse.data.builds.forEach((build) => {
                (0, vitest_1.expect)(firstPageIds.has(build.id)).toBe(false);
            });
        }
    });
    (0, vitest_1.it)("should validate required fields and handle errors properly", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Test 1: Missing required fields
        const invalidRequests = [
            {
                name: "missing projectId",
                data: {
                    repoUrl: "https://github.com/test/repo",
                    commitSha: "abc123",
                    branch: "main",
                },
            },
            {
                name: "missing repoUrl",
                data: {
                    projectId: "test-project-1",
                    commitSha: "abc123",
                    branch: "main",
                },
            },
            {
                name: "missing commitSha",
                data: {
                    projectId: "test-project-1",
                    repoUrl: "https://github.com/test/repo",
                    branch: "main",
                },
            },
        ];
        for (const testCase of invalidRequests) {
            console.log(`Testing ${testCase.name}...`);
            const response = await axios_1.default.post(`${BUILDER_URL}/api/builds`, testCase.data, {
                headers: {
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
                validateStatus: () => true, // Don't throw on error status
            });
            (0, vitest_1.expect)(response.status).toBe(400);
            (0, vitest_1.expect)(response.data).toHaveProperty("error");
            console.log(`${testCase.name}: ${response.data.error}`);
        }
        // Test 2: Invalid project ID
        const invalidProjectResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "non-existent-project",
            repoUrl: "https://github.com/test/repo",
            commitSha: "abc123",
            branch: "main",
        }, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(invalidProjectResponse.status).toBe(404);
        (0, vitest_1.expect)(invalidProjectResponse.data).toHaveProperty("error", "Project not found");
        // Test 3: Invalid build ID for get
        const invalidBuildResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/invalid-build-id`, {
            headers: { "X-API-Key": API_KEY },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(invalidBuildResponse.status).toBe(404);
        (0, vitest_1.expect)(invalidBuildResponse.data).toHaveProperty("error", "Build not found");
        // Test 4: Cancel non-existent build
        const cancelInvalidResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds/invalid-build-id/cancel`, {}, {
            headers: { "X-API-Key": API_KEY },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(cancelInvalidResponse.status).toBe(404);
        (0, vitest_1.expect)(cancelInvalidResponse.data).toHaveProperty("error", "Build not found");
        // Test 5: Cancel already completed build
        // First create a build and wait for it to complete
        const buildResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: `cancel-test-${Date.now()}`,
            branch: "main",
        }, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        const buildId = buildResponse.data.id;
        // Wait for build to complete
        let buildStatus = "pending";
        for (let i = 0; i < 10 && ["pending", "running"].includes(buildStatus); i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusCheck = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": API_KEY },
            });
            buildStatus = statusCheck.data.status;
        }
        // Now try to cancel the completed build
        const cancelCompletedResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds/${buildId}/cancel`, {}, {
            headers: { "X-API-Key": API_KEY },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(cancelCompletedResponse.status).toBe(400);
        (0, vitest_1.expect)(cancelCompletedResponse.data).toHaveProperty("error", "Build cannot be cancelled");
        (0, vitest_1.expect)(cancelCompletedResponse.data).toHaveProperty("status", buildStatus);
    });
    (0, vitest_1.it)("should enforce API authentication and authorization", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Test 1: No API key
        const noAuthResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: "auth-test",
            branch: "main",
        }, {
            headers: {
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(noAuthResponse.status).toBe(401);
        (0, vitest_1.expect)(noAuthResponse.data).toHaveProperty("error");
        // Test 2: Invalid API key
        const invalidAuthResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: "auth-test-2",
            branch: "main",
        }, {
            headers: {
                "X-API-Key": "invalid-api-key-12345",
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
        (0, vitest_1.expect)(invalidAuthResponse.status).toBe(401);
        (0, vitest_1.expect)(invalidAuthResponse.data).toHaveProperty("error");
        // Test 3: Valid API key works
        const validAuthResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: `auth-test-valid-${Date.now()}`,
            branch: "main",
        }, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(validAuthResponse.status).toBe(201);
        (0, vitest_1.expect)(validAuthResponse.data).toHaveProperty("id");
    });
    (0, vitest_1.it)("should handle large payloads and edge cases", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Test 1: Large build args
        const largeBuildArgs = {};
        for (let i = 0; i < 100; i++) {
            largeBuildArgs[`ARG_${i}`] = `value_${i}_`.padEnd(100, "x");
        }
        const largePayloadResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: `large-payload-${Date.now()}`,
            branch: "main",
            dockerfilePath: "Dockerfile",
            buildArgs: largeBuildArgs,
        }, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(largePayloadResponse.status).toBe(201);
        const largeBuildId = largePayloadResponse.data.id;
        // Verify large payload was stored correctly
        const getResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds/${largeBuildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(getResponse.data.metadata.buildArgs).toEqual(largeBuildArgs);
        // Test 2: Unicode and special characters
        const unicodeBuild = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            commitSha: `unicode-${Date.now()}`,
            branch: "测试分支-🚀",
            dockerfilePath: "Dockerfile",
            buildArgs: {
                中文参数: "测试值",
                emoji_param: "🚀🎉💻",
                special_chars: "!@#$%^&*(){}[]|\\:;\"'<>,.?/~`",
            },
        };
        const unicodeResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, unicodeBuild, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(unicodeResponse.status).toBe(201);
        // Test 3: Extremely long strings
        const longString = "a".repeat(10000);
        const longStringBuild = {
            projectId: "test-project-1",
            repoUrl: `https://github.com/test/${longString.substring(0, 100)}`,
            commitSha: `long-${Date.now()}`,
            branch: "main",
            dockerfilePath: longString.substring(0, 255), // Reasonable limit
            buildArgs: {
                LONG_VALUE: longString,
            },
        };
        const longStringResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, longStringBuild, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
        // Should either succeed or fail gracefully with proper error
        (0, vitest_1.expect)([201, 400, 413]).toContain(longStringResponse.status);
    });
    (0, vitest_1.it)("should properly track metrics and performance", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        const startTime = Date.now();
        const testBuilds = 10;
        const builds = [];
        // Create multiple builds to measure throughput
        for (let i = 0; i < testBuilds; i++) {
            const response = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
                projectId: "test-project-1",
                repoUrl: "https://github.com/test/repo",
                commitSha: `perf-test-${Date.now()}-${i}`,
                branch: "main",
                dockerfilePath: "Dockerfile",
                buildArgs: {
                    PERF_TEST: "true",
                    INDEX: String(i),
                },
            }, {
                headers: {
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
            });
            builds.push({
                id: response.data.id,
                createdAt: response.data.createdAt,
            });
        }
        const createDuration = Date.now() - startTime;
        const avgCreateTime = createDuration / testBuilds;
        console.log(`Created ${testBuilds} builds in ${createDuration}ms (avg: ${avgCreateTime.toFixed(1)}ms)`);
        // Performance expectations
        (0, vitest_1.expect)(avgCreateTime).toBeLessThan(1000); // Less than 1s per build create
        // Measure list performance with pagination
        const listStartTime = Date.now();
        const listResponse = await axios_1.default.get(`${BUILDER_URL}/api/builds?projectId=test-project-1&limit=50`, {
            headers: { "X-API-Key": API_KEY },
        });
        const listDuration = Date.now() - listStartTime;
        console.log(`Listed builds in ${listDuration}ms`);
        (0, vitest_1.expect)(listDuration).toBeLessThan(500); // List should be fast
        // Check queue metrics
        const readyResponse = await axios_1.default.get(`${BUILDER_URL}/ready`);
        const queueStats = readyResponse.data.queueStats;
        console.log("Queue performance metrics:", {
            active: queueStats.active,
            waiting: queueStats.waiting,
            completed: queueStats.completed,
            failed: queueStats.failed,
        });
        // Verify queue is processing
        (0, vitest_1.expect)(queueStats.completed + queueStats.failed).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=real-integration.test.js.map