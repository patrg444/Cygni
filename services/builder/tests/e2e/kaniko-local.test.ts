import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as k8s from "@kubernetes/client-node";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

describe("E2E - Kaniko Build with Kind Cluster", () => {
  const API_URL = process.env.API_URL || "http://localhost:3000";
  const REGISTRY_URL = "localhost:5000";
  let k8sApi: k8s.BatchV1Api;
  let coreApi: k8s.CoreV1Api;
  let kc: k8s.KubeConfig;

  beforeAll(async () => {
    // Initialize Kubernetes client
    kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    
    // Ensure we're using the Kind cluster
    const contexts = kc.getContexts();
    const kindContext = contexts.find(ctx => ctx.name === "kind-cygni-test");
    if (!kindContext) {
      throw new Error("Kind cluster 'cygni-test' not found. Run ./scripts/setup-kind-cluster.sh first");
    }
    
    kc.setCurrentContext("kind-cygni-test");
    k8sApi = kc.makeApiClient(k8s.BatchV1Api);
    coreApi = kc.makeApiClient(k8s.CoreV1Api);

    // Verify cluster is accessible
    try {
      await coreApi.listNamespacedPod("cygni-builds");
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        // Namespace doesn't exist, create it
        await coreApi.createNamespace({
          metadata: { name: "cygni-builds" }
        });
      }
    }
  });

  it("should successfully build and push image using Kaniko", async () => {
    const buildId = `test-build-${uuidv4().substring(0, 8)}`;
    const imageName = `${REGISTRY_URL}/cygni-test:${buildId}`;

    // Create Kaniko job
    const job: k8s.V1Job = {
      metadata: {
        name: `kaniko-${buildId}`,
        namespace: "cygni-builds",
        labels: {
          "app": "cygni-builder",
          "build-id": buildId
        }
      },
      spec: {
        ttlSecondsAfterFinished: 300,
        activeDeadlineSeconds: 300,
        template: {
          spec: {
            restartPolicy: "Never",
            containers: [{
              name: "kaniko",
              image: "gcr.io/kaniko-project/executor:latest",
              args: [
                "--dockerfile=Dockerfile",
                "--context=git://github.com/GoogleContainerTools/kaniko.git#refs/heads/main",
                "--context-sub-path=integration/dockerfiles/simple",
                `--destination=${imageName}`,
                "--insecure",
                "--skip-tls-verify",
                "--cache=true",
                `--cache-repo=${REGISTRY_URL}/cache`
              ],
              resources: {
                requests: {
                  memory: "512Mi",
                  cpu: "500m"
                },
                limits: {
                  memory: "1Gi",
                  cpu: "1"
                }
              }
            }]
          }
        }
      }
    };

    console.log(`Creating Kaniko job for build ${buildId}...`);
    await k8sApi.createNamespacedJob("cygni-builds", job);

    // Wait for job to complete
    let jobStatus: k8s.V1Job | undefined;
    const startTime = Date.now();
    const timeout = 120000; // 2 minutes

    while (Date.now() - startTime < timeout) {
      const response = await k8sApi.readNamespacedJob(`kaniko-${buildId}`, "cygni-builds");
      jobStatus = response.body;

      if (jobStatus.status?.succeeded === 1) {
        console.log(`Build ${buildId} completed successfully`);
        break;
      } else if (jobStatus.status?.failed && jobStatus.status.failed > 0) {
        // Get pod logs for debugging
        const pods = await coreApi.listNamespacedPod(
          "cygni-builds",
          undefined,
          undefined,
          undefined,
          undefined,
          `job-name=kaniko-${buildId}`
        );
        
        if (pods.body.items.length > 0) {
          const podName = pods.body.items[0].metadata!.name!;
          try {
            const logs = await coreApi.readNamespacedPodLog(podName, "cygni-builds");
            console.error(`Build failed. Logs:\n${logs.body}`);
          } catch (e) {
            console.error("Could not retrieve pod logs");
          }
        }
        
        throw new Error(`Build ${buildId} failed`);
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    expect(jobStatus?.status?.succeeded).toBe(1);

    // Verify image exists in registry
    console.log(`Verifying image ${imageName} in registry...`);
    const { stdout } = await execAsync(`docker pull ${imageName}`);
    expect(stdout).toContain("Pull complete");

    // Run the image to verify it works
    const runResult = await execAsync(`docker run --rm ${imageName} echo "Hello from Kaniko build"`);
    expect(runResult.stdout).toContain("Hello from Kaniko build");

    // Cleanup
    await k8sApi.deleteNamespacedJob(`kaniko-${buildId}`, "cygni-builds");
  }, 180000); // 3 minute timeout

  it("should handle build failures gracefully", async () => {
    const buildId = `fail-build-${uuidv4().substring(0, 8)}`;

    // Create a job that will fail (invalid Dockerfile)
    const failJob: k8s.V1Job = {
      metadata: {
        name: `kaniko-${buildId}`,
        namespace: "cygni-builds"
      },
      spec: {
        ttlSecondsAfterFinished: 60,
        activeDeadlineSeconds: 60,
        template: {
          spec: {
            restartPolicy: "Never",
            containers: [{
              name: "kaniko",
              image: "gcr.io/kaniko-project/executor:latest",
              args: [
                "--dockerfile=Dockerfile.nonexistent",
                "--context=git://github.com/invalid/repo.git",
                "--destination=localhost:5000/fail:latest"
              ]
            }]
          }
        }
      }
    };

    await k8sApi.createNamespacedJob("cygni-builds", failJob);

    // Wait for job to fail
    let failed = false;
    const startTime = Date.now();
    const timeout = 60000;

    while (Date.now() - startTime < timeout) {
      const response = await k8sApi.readNamespacedJob(`kaniko-${buildId}`, "cygni-builds");
      
      if (response.body.status?.failed && response.body.status.failed > 0) {
        failed = true;
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    expect(failed).toBe(true);

    // Cleanup
    await k8sApi.deleteNamespacedJob(`kaniko-${buildId}`, "cygni-builds");
  });
});

describe("E2E - Builder Service with Kaniko Integration", () => {
  const API_URL = process.env.API_URL || "http://localhost:3000";
  
  beforeAll(async () => {
    // Wait for API to be ready
    await waitForService(API_URL + "/api/health");
  });

  it("should process build request through full pipeline", async () => {
    // Submit a real build request
    const buildRequest = {
      projectId: "e2e-kaniko-test",
      branch: "main",
      commitSha: "abc123",
      dockerfilePath: "integration/dockerfiles/simple/Dockerfile",
      buildArgs: {
        BUILD_DATE: new Date().toISOString()
      },
      repoUrl: "https://github.com/GoogleContainerTools/kaniko.git"
    };

    const response = await axios.post(
      `${API_URL}/api/builds`,
      buildRequest,
      {
        headers: {
          "X-API-Key": process.env.API_KEY || "test-api-key",
          "Content-Type": "application/json"
        }
      }
    );

    expect(response.status).toBe(202);
    const buildId = response.data.id;

    // Poll for completion
    let status = "pending";
    const startTime = Date.now();
    const timeout = 180000; // 3 minutes

    while (["pending", "queued", "running"].includes(status) && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await axios.get(
        `${API_URL}/api/builds/${buildId}`,
        {
          headers: { "X-API-Key": process.env.API_KEY || "test-api-key" }
        }
      );

      status = statusResponse.data.status;
      console.log(`Build ${buildId} status: ${status}`);
    }

    expect(["success", "completed"]).toContain(status);
  }, 240000); // 4 minute timeout
});

async function waitForService(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(url);
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Service at ${url} did not become ready`);
}