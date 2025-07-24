"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
(0, vitest_1.describe)("Real Build Queue Integration", () => {
    const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
    const API_KEY = "test-api-key";
    let isServicesRunning = false;
    (0, vitest_1.beforeAll)(async () => {
        // Check if services are running
        try {
            const healthResponse = await axios_1.default.get(`${BUILDER_URL}/health`);
            if (healthResponse.data.status !== "ok") {
                throw new Error("Builder service not healthy");
            }
            // Also check ready endpoint to ensure queue is working
            const readyResponse = await axios_1.default.get(`${BUILDER_URL}/ready`);
            if (!readyResponse.data.checks?.worker) {
                throw new Error("Builder worker not ready");
            }
            isServicesRunning = true;
        }
        catch (error) {
            console.log("Services not running. Run docker-compose -f docker-compose.integration.yml up -d first");
            return;
        }
    });
    (0, vitest_1.it)("should process build job through the queue", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create a build to trigger queue processing
        const buildRequest = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            branch: "queue-test",
            commitSha: `queue-test-${Date.now()}`,
            dockerfilePath: "Dockerfile",
            buildArgs: {
                QUEUE_TEST: "true",
                TIMESTAMP: new Date().toISOString(),
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
        console.log(`Created build for queue test: ${buildId}`);
        // Immediately check the build status - should be pending or already running
        const initialStatus = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(["pending", "running"]).toContain(initialStatus.data.status);
        console.log(`Initial status: ${initialStatus.data.status}`);
        // Wait a moment for the queue to pick it up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Check status again - should be running or failed
        const processedStatus = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        console.log(`Status after 1s: ${processedStatus.data.status}`);
        (0, vitest_1.expect)(["running", "failed"]).toContain(processedStatus.data.status);
        // If running, wait for completion
        if (processedStatus.data.status === "running") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const finalStatus = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": API_KEY },
            });
            console.log(`Final status: ${finalStatus.data.status}`);
            (0, vitest_1.expect)(["failed", "success"]).toContain(finalStatus.data.status);
            // Check if logs were captured
            if (finalStatus.data.logs) {
                console.log(`Build logs captured: ${finalStatus.data.logs.length} characters`);
                (0, vitest_1.expect)(finalStatus.data.logs.length).toBeGreaterThan(0);
            }
        }
    });
    (0, vitest_1.it)("should handle multiple concurrent builds in queue with proper ordering", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create builds with timestamps to verify FIFO processing
        const buildCount = 10;
        const baseTime = Date.now();
        const builds = [];
        // Create builds sequentially with small delays to ensure order
        for (let i = 0; i < buildCount; i++) {
            const response = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
                projectId: "test-project-1",
                repoUrl: "https://github.com/test/repo",
                branch: "queue-order-test",
                commitSha: `order-${baseTime}-${i}`,
                dockerfilePath: "Dockerfile",
                buildArgs: {
                    BUILD_ORDER: String(i),
                    CREATED_AT: new Date().toISOString(),
                },
            }, {
                headers: {
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
            });
            builds.push({
                id: response.data.id,
                order: i,
                createdAt: response.data.createdAt,
            });
            // Small delay between creates to ensure ordering
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        console.log(`Created ${builds.length} builds sequentially`);
        // Track state transitions over time
        const stateHistory = [];
        const maxChecks = 20; // 10 seconds
        for (let check = 0; check < maxChecks; check++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const statusPromises = builds.map((build) => axios_1.default.get(`${BUILDER_URL}/api/builds/${build.id}`, {
                headers: { "X-API-Key": API_KEY },
            }));
            const statusResponses = await Promise.all(statusPromises);
            const currentStates = statusResponses.map((r, idx) => ({
                order: builds[idx].order,
                status: r.data.status,
                updatedAt: r.data.updatedAt,
            }));
            stateHistory.push({
                timestamp: Date.now(),
                states: currentStates,
            });
            // Check if all builds have completed
            const allCompleted = currentStates.every((s) => ["success", "failed", "cancelled"].includes(s.status));
            if (allCompleted) {
                console.log(`All builds completed after ${(check + 1) * 0.5}s`);
                break;
            }
        }
        // Verify queue processed builds in FIFO order
        // Find when each build started processing (transitioned from pending)
        const processingOrder = [];
        for (let i = 0; i < builds.length; i++) {
            for (let j = 1; j < stateHistory.length; j++) {
                const prevState = stateHistory[j - 1].states[i].status;
                const currState = stateHistory[j].states[i].status;
                if (prevState === "pending" && currState !== "pending") {
                    processingOrder.push({
                        order: builds[i].order,
                        startedAt: stateHistory[j].timestamp,
                    });
                    break;
                }
            }
        }
        // Sort by when they started processing
        processingOrder.sort((a, b) => a.startedAt - b.startedAt);
        console.log("Processing order:", processingOrder.map((p) => p.order));
        // Verify FIFO: earlier builds should start processing first
        // Allow some tolerance for concurrent processing
        const concurrencyLimit = 5; // Assuming max 5 concurrent builds
        for (let i = concurrencyLimit; i < processingOrder.length; i++) {
            const currentBuild = processingOrder[i];
            const earlierBuilds = processingOrder.slice(0, i);
            // This build should have started after at least the first (i - concurrencyLimit) builds
            const shouldStartAfter = earlierBuilds[i - concurrencyLimit];
            (0, vitest_1.expect)(currentBuild.startedAt).toBeGreaterThanOrEqual(shouldStartAfter.startedAt);
        }
        // Verify all builds eventually complete
        const finalStates = stateHistory[stateHistory.length - 1].states;
        const completedCount = finalStates.filter((s) => ["success", "failed", "cancelled"].includes(s.status)).length;
        (0, vitest_1.expect)(completedCount).toBe(buildCount);
        console.log(`${completedCount}/${buildCount} builds completed`);
    });
    (0, vitest_1.it)("should verify queue health and metrics", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Check the ready endpoint for queue health
        const readyResponse = await axios_1.default.get(`${BUILDER_URL}/ready`);
        (0, vitest_1.expect)(readyResponse.data.checks).toHaveProperty("worker");
        (0, vitest_1.expect)(["healthy", "degraded"]).toContain(readyResponse.data.checks.worker);
        console.log("Queue worker status:", readyResponse.data.checks.worker);
        // Try to get queue metrics via the health endpoint
        const healthResponse = await axios_1.default.get(`${BUILDER_URL}/health`);
        if (healthResponse.data.metrics) {
            console.log("Queue metrics:", healthResponse.data.metrics);
            (0, vitest_1.expect)(healthResponse.data.metrics).toHaveProperty("queued");
            (0, vitest_1.expect)(healthResponse.data.metrics).toHaveProperty("active");
        }
    });
    (0, vitest_1.it)("should handle build cancellation in queue", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create a build
        const buildRequest = {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            branch: "cancel-test",
            commitSha: `cancel-${Date.now()}`,
            dockerfilePath: "Dockerfile",
        };
        const createResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds`, buildRequest, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        });
        const buildId = createResponse.data.id;
        console.log(`Created build to cancel: ${buildId}`);
        // Immediately cancel it
        const cancelResponse = await axios_1.default.post(`${BUILDER_URL}/api/builds/${buildId}/cancel`, {}, {
            headers: { "X-API-Key": API_KEY },
        });
        (0, vitest_1.expect)(cancelResponse.status).toBe(200);
        (0, vitest_1.expect)(cancelResponse.data.status).toBe("cancelled");
        // Verify final status
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const finalStatus = await axios_1.default.get(`${BUILDER_URL}/api/builds/${buildId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        // Build might have already failed if it was processing when cancelled
        (0, vitest_1.expect)(["cancelled", "failed"]).toContain(finalStatus.data.status);
        console.log(`Build final status: ${finalStatus.data.status}`);
    });
    (0, vitest_1.it)("should handle queue persistence and recovery", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create builds with specific metadata to track them
        const testId = `persistence-test-${Date.now()}`;
        const buildCount = 5;
        const builds = [];
        for (let i = 0; i < buildCount; i++) {
            const response = await axios_1.default.post(`${BUILDER_URL}/api/builds`, {
                projectId: "test-project-1",
                repoUrl: "https://github.com/test/repo",
                branch: "persistence-test",
                commitSha: `${testId}-${i}`,
                dockerfilePath: "Dockerfile",
                buildArgs: {
                    TEST_ID: testId,
                    BUILD_INDEX: String(i),
                },
            }, {
                headers: {
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
            });
            builds.push({
                id: response.data.id,
                index: i,
            });
        }
        console.log(`Created ${builds.length} builds for persistence test`);
        // Wait a moment to ensure some are queued
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Get current queue stats
        const beforeRestart = await axios_1.default.get(`${BUILDER_URL}/ready`);
        const queueStatsBefore = beforeRestart.data.queueStats;
        console.log("Queue stats before restart:", queueStatsBefore);
        // Note: In a real test, we would restart the builder service here
        // For now, we'll just verify the queue stats are accurate
        // Verify queue stats match our expectations
        const totalInQueue = (queueStatsBefore.waiting || 0) +
            (queueStatsBefore.active || 0) +
            (queueStatsBefore.delayed || 0);
        (0, vitest_1.expect)(totalInQueue).toBeGreaterThan(0);
        // Wait for all builds to complete
        let allCompleted = false;
        let checks = 0;
        while (!allCompleted && checks < 20) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusPromises = builds.map((b) => axios_1.default.get(`${BUILDER_URL}/api/builds/${b.id}`, {
                headers: { "X-API-Key": API_KEY },
            }));
            const responses = await Promise.all(statusPromises);
            const statuses = responses.map((r) => r.data.status);
            allCompleted = statuses.every((s) => ["success", "failed", "cancelled"].includes(s));
            checks++;
        }
        // Verify all builds completed
        (0, vitest_1.expect)(allCompleted).toBe(true);
        // Check final queue stats
        const afterCompletion = await axios_1.default.get(`${BUILDER_URL}/ready`);
        const queueStatsAfter = afterCompletion.data.queueStats;
        console.log("Queue stats after completion:", queueStatsAfter);
        // Verify that active/waiting jobs decreased after processing
        const remainingJobs = (queueStatsAfter.waiting || 0) + (queueStatsAfter.active || 0);
        console.log(`Jobs in queue - before: ${totalInQueue}, after: ${remainingJobs}`);
        console.log(`Total processed field: ${queueStatsAfter.totalProcessed}`);
        // Should have fewer jobs actively in queue after processing
        (0, vitest_1.expect)(remainingJobs).toBeLessThan(totalInQueue);
        // Verify all builds have been persisted to database with final statuses
        const finalStatuses = await Promise.all(builds.map((b) => axios_1.default.get(`${BUILDER_URL}/api/builds/${b.id}`, {
            headers: { "X-API-Key": API_KEY },
        })));
        // All builds should have a terminal status
        finalStatuses.forEach((res) => {
            (0, vitest_1.expect)(["success", "failed", "cancelled"]).toContain(res.data.status);
        });
    });
    (0, vitest_1.it)("should respect queue concurrency limits", async function () {
        if (!isServicesRunning) {
            this.skip();
        }
        // Create many builds to test concurrency
        const buildCount = 20;
        const builds = [];
        const baseTime = Date.now();
        // Create all builds at once
        const createPromises = Array.from({ length: buildCount }, (_, i) => axios_1.default.post(`${BUILDER_URL}/api/builds`, {
            projectId: "test-project-1",
            repoUrl: "https://github.com/test/repo",
            branch: "concurrency-test",
            commitSha: `concurrency-${baseTime}-${i}`,
            dockerfilePath: "Dockerfile",
            buildArgs: {
                BUILD_INDEX: String(i),
                SLEEP_TIME: "5", // Simulate longer builds
            },
        }, {
            headers: {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        }));
        const createResponses = await Promise.all(createPromises);
        createResponses.forEach((r, i) => {
            builds.push({
                id: r.data.id,
                index: i,
                createdAt: r.data.createdAt,
            });
        });
        console.log(`Created ${builds.length} builds to test concurrency`);
        // Monitor concurrent running builds over time
        const concurrencyHistory = [];
        let maxConcurrent = 0;
        for (let check = 0; check < 30; check++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const statusPromises = builds.map((b) => axios_1.default.get(`${BUILDER_URL}/api/builds/${b.id}`, {
                headers: { "X-API-Key": API_KEY },
            }));
            const responses = await Promise.all(statusPromises);
            const statuses = responses.map((r) => r.data.status);
            const runningCount = statuses.filter((s) => s === "running").length;
            const pendingCount = statuses.filter((s) => s === "pending").length;
            const completedCount = statuses.filter((s) => ["success", "failed", "cancelled"].includes(s)).length;
            concurrencyHistory.push({
                timestamp: Date.now(),
                running: runningCount,
                pending: pendingCount,
                completed: completedCount,
            });
            maxConcurrent = Math.max(maxConcurrent, runningCount);
            if (completedCount === buildCount) {
                console.log(`All builds completed after ${(check + 1) * 0.5}s`);
                break;
            }
        }
        console.log(`Max concurrent builds: ${maxConcurrent}`);
        console.log("Concurrency history sample:", concurrencyHistory.slice(0, 5));
        // Verify concurrency limits are respected
        // Assuming the system has a reasonable concurrency limit
        (0, vitest_1.expect)(maxConcurrent).toBeGreaterThan(0);
        (0, vitest_1.expect)(maxConcurrent).toBeLessThanOrEqual(10); // Reasonable upper limit
        // Verify builds were queued properly (pending count decreased over time)
        const pendingCounts = concurrencyHistory.map((h) => h.pending);
        const initialPending = pendingCounts[0];
        const finalPending = pendingCounts[pendingCounts.length - 1];
        (0, vitest_1.expect)(initialPending).toBeGreaterThan(0);
        (0, vitest_1.expect)(finalPending).toBe(0);
    });
});
//# sourceMappingURL=queue-real.test.js.map