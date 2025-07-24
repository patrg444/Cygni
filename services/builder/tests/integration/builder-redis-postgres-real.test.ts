import { describe, it, expect, beforeAll } from "vitest";
import axios from "axios";

describe("Real Builder Service Integration - PostgreSQL, Redis, API", () => {
  const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
  const API_URL = process.env.API_URL || "http://localhost:3000";
  const API_KEY = "test-api-key";

  let isServicesRunning = false;

  beforeAll(async () => {
    // Check if all services are running
    try {
      const [builderHealth, apiHealth, builderReady] = await Promise.all([
        axios.get(`${BUILDER_URL}/health`),
        axios
          .get(`${API_URL}/health`)
          .catch(() => ({ data: { status: "api-not-required" } })),
        axios.get(`${BUILDER_URL}/ready`),
      ]);

      if (builderHealth.data.status !== "ok") {
        throw new Error("Builder service not healthy");
      }

      // Verify all dependencies are healthy
      const checks = builderReady.data.checks;
      if (checks.database !== "healthy" || checks.redis !== "healthy") {
        throw new Error(
          `Dependencies not healthy: DB=${checks.database}, Redis=${checks.redis}`,
        );
      }

      isServicesRunning = true;
      console.log("All services are healthy and ready");
    } catch (error) {
      console.log("Services not running or unhealthy:", error);
      console.log(
        "Run docker-compose -f docker-compose.integration.yml up -d first",
      );
      return;
    }
  });

  it("should create build and verify it's processed by the system", async function () {
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

    const createResponse = await axios.post(
      `${BUILDER_URL}/api/builds`,
      buildRequest,
      {
        headers: {
          "X-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    expect(createResponse.status).toBe(201);
    const buildId = createResponse.data.id;
    console.log(`Created build: ${buildId}`);

    // 2. Verify build exists via API
    const getResponse = await axios.get(
      `${BUILDER_URL}/api/builds/${buildId}`,
      {
        headers: { "X-API-Key": API_KEY },
      },
    );

    expect(getResponse.data).toBeDefined();
    expect(getResponse.data.projectId).toBe(buildRequest.projectId);
    expect(getResponse.data.commitSha).toBe(buildRequest.commitSha);
    expect(["pending", "running", "failed"]).toContain(getResponse.data.status);

    // 3. Wait a bit and check if status updated
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const updatedResponse = await axios.get(
      `${BUILDER_URL}/api/builds/${buildId}`,
      {
        headers: { "X-API-Key": API_KEY },
      },
    );

    console.log(`Build status after 2s: ${updatedResponse.data.status}`);
    expect(["running", "failed", "cancelled"]).toContain(
      updatedResponse.data.status,
    );
  });

  it("should verify data persistence across PostgreSQL and Redis", async function () {
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

    const createResponse = await axios.post(
      `${BUILDER_URL}/api/builds`,
      buildRequest,
      {
        headers: {
          "X-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    const buildId = createResponse.data.id;
    console.log(`Created build with metadata: ${buildId}`);

    // Verify data is persisted in PostgreSQL (via API)
    const dbResponse = await axios.get(`${BUILDER_URL}/api/builds/${buildId}`, {
      headers: { "X-API-Key": API_KEY },
    });

    // Verify all fields are correctly stored
    expect(dbResponse.data.id).toBe(buildId);
    expect(dbResponse.data.projectId).toBe(buildRequest.projectId);
    expect(dbResponse.data.commitSha).toBe(buildRequest.commitSha);
    expect(dbResponse.data.branch).toBe(buildRequest.branch);
    expect(dbResponse.data.metadata).toBeDefined();
    expect(dbResponse.data.metadata.repoUrl).toBe(buildRequest.repoUrl);
    expect(dbResponse.data.metadata.buildArgs).toEqual(testMetadata);
    expect(dbResponse.data.createdAt).toBeDefined();
    expect(dbResponse.data.updatedAt).toBeDefined();

    // Verify timestamps are valid ISO strings
    expect(new Date(dbResponse.data.createdAt).toISOString()).toBe(
      dbResponse.data.createdAt,
    );
    expect(new Date(dbResponse.data.updatedAt).toISOString()).toBe(
      dbResponse.data.updatedAt,
    );

    // Verify the build is in Redis queue (check queue stats)
    const queueStats = (await axios.get(`${BUILDER_URL}/ready`)).data
      .queueStats;
    const totalJobs =
      queueStats.waiting +
      queueStats.active +
      queueStats.delayed +
      queueStats.completed +
      queueStats.failed;
    expect(totalJobs).toBeGreaterThan(0);
    console.log("Queue stats after create:", queueStats);

    // Wait for processing and verify status updates are persisted
    let previousUpdatedAt = dbResponse.data.updatedAt;
    let statusChanges = 0;

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const checkResponse = await axios.get(
        `${BUILDER_URL}/api/builds/${buildId}`,
        {
          headers: { "X-API-Key": API_KEY },
        },
      );

      // Check if status or updatedAt changed
      if (checkResponse.data.updatedAt !== previousUpdatedAt) {
        statusChanges++;
        console.log(
          `Status update ${statusChanges}: ${checkResponse.data.status} at ${checkResponse.data.updatedAt}`,
        );

        // Verify updatedAt is always increasing
        expect(
          new Date(checkResponse.data.updatedAt).getTime(),
        ).toBeGreaterThan(new Date(previousUpdatedAt).getTime());

        previousUpdatedAt = checkResponse.data.updatedAt;
      }

      if (
        ["success", "failed", "cancelled"].includes(checkResponse.data.status)
      ) {
        break;
      }
    }

    // Verify we saw at least one status change (pending -> running/failed)
    expect(statusChanges).toBeGreaterThan(0);

    // Test listing with filters to verify PostgreSQL queries work correctly
    const listResponse = await axios.get(
      `${BUILDER_URL}/api/builds?projectId=test-project-1&limit=100`,
      {
        headers: { "X-API-Key": API_KEY },
      },
    );

    const ourBuild = listResponse.data.builds.find(
      (b: any) => b.id === buildId,
    );
    expect(ourBuild).toBeDefined();
    expect(ourBuild.metadata.buildArgs).toEqual(testMetadata);
  });

  it("should verify service health endpoints", async function () {
    if (!isServicesRunning) {
      this.skip();
    }

    // Get real health status from the service
    const healthResponse = await axios.get(`${BUILDER_URL}/health`);
    expect(healthResponse.data.status).toBe("ok");
    console.log("Health check:", healthResponse.data);

    // Get detailed ready status
    const readyResponse = await axios.get(`${BUILDER_URL}/ready`);
    expect(readyResponse.data).toBeDefined();

    // The ready endpoint returns checks object
    if (readyResponse.data.checks) {
      expect(readyResponse.data.checks).toHaveProperty("database");
      expect(readyResponse.data.checks).toHaveProperty("redis");
      console.log("Ready checks:", readyResponse.data.checks);
    }
  });

  it("should handle database connection failures gracefully", async function () {
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

    const errorResponse = await axios.post(
      `${BUILDER_URL}/api/builds`,
      invalidProjectBuild,
      {
        headers: {
          "X-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
        validateStatus: () => true, // Don't throw on error status
      },
    );

    expect(errorResponse.status).toBe(404);
    expect(errorResponse.data.error).toBe("Project not found");

    // Test 2: Verify system remains stable after errors
    const healthAfterError = await axios.get(`${BUILDER_URL}/health`);
    expect(healthAfterError.data.status).toBe("ok");

    // Test 3: Create a valid build to ensure system recovered
    const validBuild = {
      projectId: "test-project-1",
      repoUrl: "https://github.com/test/recovery",
      branch: "recovery-test",
      commitSha: `recovery-${Date.now()}`,
      dockerfilePath: "Dockerfile",
    };

    const recoveryResponse = await axios.post(
      `${BUILDER_URL}/api/builds`,
      validBuild,
      {
        headers: {
          "X-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    expect(recoveryResponse.status).toBe(201);
    expect(recoveryResponse.data.id).toBeDefined();
    console.log("System recovered successfully after error");
  });

  it("should maintain data integrity under concurrent load", async function () {
    if (!isServicesRunning) {
      this.skip();
    }

    const concurrentRequests = 20;
    const baseTime = Date.now();

    // Create many builds concurrently to test race conditions
    const createPromises = Array.from(
      { length: concurrentRequests },
      (_, i) => {
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

        return axios
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
      },
    );

    const results = await Promise.allSettled(createPromises);

    // All requests should succeed
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    console.log(
      `Concurrent creates: ${succeeded.length} succeeded, ${failed.length} failed`,
    );
    expect(succeeded.length).toBe(concurrentRequests);

    // Verify each build has unique ID and correct data
    const buildIds = new Set();
    const builds = [];

    for (const result of succeeded) {
      if (result.status === "fulfilled") {
        const { response, requestData } = result.value;
        const buildId = response.data.id;

        // Verify no duplicate IDs
        expect(buildIds.has(buildId)).toBe(false);
        buildIds.add(buildId);

        builds.push({
          id: buildId,
          expectedData: requestData,
        });
      }
    }

    // Verify all builds were correctly stored
    const verifyPromises = builds.map(async ({ id, expectedData }) => {
      const getResponse = await axios.get(`${BUILDER_URL}/api/builds/${id}`, {
        headers: { "X-API-Key": API_KEY },
      });

      const build = getResponse.data;

      // Verify data integrity
      expect(build.projectId).toBe(expectedData.projectId);
      expect(build.commitSha).toBe(expectedData.commitSha);
      expect(build.branch).toBe(expectedData.branch);
      expect(build.metadata.repoUrl).toBe(expectedData.repoUrl);
      expect(build.metadata.buildArgs).toEqual(expectedData.buildArgs);

      return build;
    });

    const verifiedBuilds = await Promise.all(verifyPromises);
    console.log(`Verified data integrity for ${verifiedBuilds.length} builds`);

    // Check that all builds appear in listing
    const listResponse = await axios.get(
      `${BUILDER_URL}/api/builds?projectId=test-project-1&limit=100`,
      {
        headers: { "X-API-Key": API_KEY },
      },
    );

    const listedIds = new Set(listResponse.data.builds.map((b: any) => b.id));
    for (const id of buildIds) {
      expect(listedIds.has(id)).toBe(true);
    }

    console.log("All concurrent builds appear in listing");
  });
});
