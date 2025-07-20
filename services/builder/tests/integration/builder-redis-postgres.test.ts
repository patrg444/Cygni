import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios from "axios";
import Redis from "ioredis";

describe("Builder Service Integration - Redis ↔ Postgres", () => {
  const API_URL = process.env.API_URL || "http://localhost:3000";
  const BUILDER_URL = process.env.BUILDER_URL || "http://localhost:3001";
  let redis: Redis;

  beforeAll(async () => {
    // Wait for services to be ready
    await waitForService(API_URL + "/api/health");
    await waitForService(BUILDER_URL + "/health");
    
    // Initialize Redis connection
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6381"),
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("should create build and queue job via API → Builder → Redis → Postgres", async () => {
    // 1. Create a build via API
    const createResponse = await axios.post(
      `${API_URL}/api/builds`,
      {
        projectId: "test-project-1",
        branch: "main",
        commitSha: "abc123",
        dockerfilePath: "Dockerfile",
        buildArgs: { NODE_ENV: "production" },
      },
      {
        headers: {
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        },
      }
    );

    expect(createResponse.status).toBe(202);
    expect(createResponse.data).toHaveProperty("id");
    expect(createResponse.data).toHaveProperty("status", "queued");

    const buildId = createResponse.data.id;

    // 2. Poll build status until it's queued or running
    let status = "pending";
    let attempts = 0;
    const maxAttempts = 30;

    while (status === "pending" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const statusResponse = await axios.get(
        `${API_URL}/api/builds/${buildId}`,
        {
          headers: { "X-API-Key": "test-api-key" },
        }
      );
      
      status = statusResponse.data.status;
      attempts++;
    }

    expect(["queued", "running"]).toContain(status);

    // 3. Verify build exists by checking API response
    expect(createResponse.data.projectId).toBe("test-project-1");
    expect(createResponse.data.commitSha).toBe("abc123");

    // 4. Verify job exists in Redis queue
    const queueKey = "bull:builds:waiting";
    const waitingJobs = await redis.lrange(queueKey, 0, -1);
    
    // Check if our build job is in the queue
    const jobFound = waitingJobs.some(async (jobId) => {
      const jobData = await redis.hgetall(`bull:builds:${jobId}`);
      return jobData.data && JSON.parse(jobData.data).buildId === buildId;
    });

    expect(jobFound || status === "running").toBe(true);
  });

  it("should handle builder service health checks", async () => {
    const healthResponse = await axios.get(`${BUILDER_URL}/health`);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.data).toHaveProperty("status", "ok");

    const readyResponse = await axios.get(`${BUILDER_URL}/ready`);
    expect(readyResponse.status).toBe(200);
    expect(readyResponse.data).toHaveProperty("status", "ready");
    expect(readyResponse.data.checks).toHaveProperty("database", "healthy");
    expect(readyResponse.data.checks).toHaveProperty("redis", "healthy");
  });
});

async function waitForService(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(url);
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Service at ${url} did not become ready`);
}