import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as k8s from "@kubernetes/client-node";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

describe("End-to-End - Kaniko Build Cycle", () => {
  const API_URL = process.env.API_URL || "http://localhost:3000";
  const REGISTRY_URL = process.env.REGISTRY_URL || "localhost:5000";
  let k8sClient: k8s.BatchV1Api;

  beforeAll(async () => {
    // Initialize Kubernetes client
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    k8sClient = kc.makeApiClient(k8s.BatchV1Api);

    // Ensure local registry is running
    try {
      await execAsync("docker run -d -p 5000:5000 --name registry registry:2");
    } catch (error) {
      // Registry might already be running
    }

    // Wait for API to be ready
    await waitForService(API_URL + "/api/health");
  });

  afterAll(async () => {
    // Cleanup
    try {
      await execAsync("docker stop registry && docker rm registry");
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should build and push a simple Docker image via Kaniko", async () => {
    // 1. Submit build request for a simple hello-world app
    const buildRequest = {
      projectId: "e2e-test-project",
      branch: "main",
      commitSha: "e2e123",
      dockerfilePath: "Dockerfile",
      buildArgs: {
        NODE_ENV: "production",
      },
      repoUrl: "https://github.com/GoogleContainerTools/kaniko.git",
      // Use a simple test Dockerfile
      metadata: {
        dockerfileContent: `
FROM alpine:latest
RUN echo "Hello from Cygni E2E test" > /hello.txt
CMD ["cat", "/hello.txt"]
        `.trim(),
      },
    };

    const createResponse = await axios.post(
      `${API_URL}/api/builds`,
      buildRequest,
      {
        headers: {
          "X-API-Key": process.env.API_KEY || "test-api-key",
          "Content-Type": "application/json",
        },
      }
    );

    expect(createResponse.status).toBe(202);
    const buildId = createResponse.data.id;

    // 2. Poll build status until completed or failed
    let status = "pending";
    let imageUrl: string | null = null;
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds timeout

    while (
      ["pending", "queued", "running"].includes(status) &&
      Date.now() - startTime < timeout
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await axios.get(
        `${API_URL}/api/builds/${buildId}`,
        {
          headers: { "X-API-Key": process.env.API_KEY || "test-api-key" },
        }
      );

      status = statusResponse.data.status;
      imageUrl = statusResponse.data.imageUrl;

      console.log(`Build ${buildId} status: ${status}`);
    }

    // 3. Verify build completed successfully
    expect(status).toBe("completed");
    expect(imageUrl).toBeTruthy();
    expect(imageUrl).toContain(REGISTRY_URL);

    // 4. Verify image exists in registry
    const imageName = imageUrl!.split("/").pop()!.split(":")[0];
    const imageTag = imageUrl!.split(":").pop() || "latest";

    const registryResponse = await axios.get(
      `http://${REGISTRY_URL}/v2/${imageName}/tags/list`
    );

    expect(registryResponse.status).toBe(200);
    expect(registryResponse.data.tags).toContain(imageTag);

    // 5. Pull and run the image to verify it works
    const { stdout } = await execAsync(
      `docker pull ${imageUrl} && docker run --rm ${imageUrl}`
    );

    expect(stdout).toContain("Hello from Cygni E2E test");
  }, 60000); // 60 second timeout for the entire test

  it("should handle build failures gracefully", async () => {
    // Submit a build that will fail
    const failedBuildRequest = {
      projectId: "e2e-fail-test",
      branch: "main",
      commitSha: "fail123",
      dockerfilePath: "Dockerfile.nonexistent",
      repoUrl: "https://github.com/invalid/repo",
    };

    const createResponse = await axios.post(
      `${API_URL}/api/builds`,
      failedBuildRequest,
      {
        headers: {
          "X-API-Key": process.env.API_KEY || "test-api-key",
          "Content-Type": "application/json",
        },
      }
    );

    expect(createResponse.status).toBe(202);
    const buildId = createResponse.data.id;

    // Wait for build to fail
    let status = "pending";
    const startTime = Date.now();
    const timeout = 30000;

    while (status === "pending" && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await axios.get(
        `${API_URL}/api/builds/${buildId}`,
        {
          headers: { "X-API-Key": process.env.API_KEY || "test-api-key" },
        }
      );

      status = statusResponse.data.status;
    }

    expect(status).toBe("failed");
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