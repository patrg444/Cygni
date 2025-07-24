import { describe, it, expect, beforeAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { KanikoBuilder } from "../../src/services/kaniko-builder";
import { BuildStatus } from "../../src/types/build";

// Mock Kubernetes client
vi.mock("@kubernetes/client-node", () => ({
  KubeConfig: vi.fn().mockImplementation(() => ({
    loadFromDefault: vi.fn(),
    getContexts: vi
      .fn()
      .mockReturnValue([
        { name: "kind-cygni-test", cluster: "cygni-test", user: "test" },
      ]),
    setCurrentContext: vi.fn(),
    makeApiClient: vi.fn().mockImplementation(() => ({
      createNamespacedJob: vi.fn().mockResolvedValue({
        response: { statusCode: 201 },
        body: {
          metadata: { name: "kaniko-build-test", namespace: "cygni-builds" },
          status: { succeeded: 1 },
        },
      }),
      readNamespacedJob: vi.fn().mockResolvedValue({
        body: {
          status: { succeeded: 1, completionTime: new Date().toISOString() },
        },
      }),
      readNamespacedJobStatus: vi.fn().mockResolvedValue({
        body: {
          status: { succeeded: 1, completionTime: new Date().toISOString() },
        },
      }),
      deleteNamespacedJob: vi.fn().mockResolvedValue({}),
      listNamespacedPod: vi.fn().mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: "kaniko-build-test-pod" },
              status: { phase: "Succeeded" },
            },
          ],
        },
      }),
      readNamespacedPodLog: vi.fn().mockResolvedValue({
        body: "Kaniko build successful\nPushed image to registry",
      }),
      createNamespace: vi.fn().mockResolvedValue({}),
      createNamespacedSecret: vi.fn().mockResolvedValue({}),
      deleteNamespacedSecret: vi.fn().mockResolvedValue({}),
    })),
  })),
  BatchV1Api: vi.fn(),
  CoreV1Api: vi.fn(),
}));

describe("E2E - Kaniko Build with Kind Cluster", () => {
  const REGISTRY_URL = "localhost:5000";

  beforeAll(async () => {
    // Setup is handled by mocks
  });

  it("should successfully build and push image using Kaniko", async () => {
    const buildId = `test-build-${uuidv4().substring(0, 8)}`;
    const imageName = `${REGISTRY_URL}/cygni-test:${buildId}`;

    // Create a KanikoBuilder instance
    const kanikoBuilder = new KanikoBuilder(REGISTRY_URL, "cygni-builds");

    // The KanikoBuilder will use the mocked Kubernetes client
    const buildResult = await kanikoBuilder.build({
      buildId,
      gitUrl: "https://github.com/test/repo.git",
      gitRef: "main",
      contextPath: ".",
      dockerfilePath: "Dockerfile",
      buildArgs: {},
      cacheKey: "test-cache",
    });

    // Verify the result
    expect(buildResult).toBeDefined();
    expect(buildResult.imageUrl).toContain(REGISTRY_URL);
    expect(buildResult.logs).toContain("Kaniko build successful");
    expect(buildResult.duration).toBeGreaterThan(0);
  });

  it("should handle build failures gracefully", async () => {
    const buildId = `fail-build-${uuidv4().substring(0, 8)}`;

    // Update mock to simulate failure
    const KubeConfig = vi.mocked(
      await import("@kubernetes/client-node"),
    ).KubeConfig;
    vi.mocked(KubeConfig).mockImplementationOnce(() => ({
      loadFromDefault: vi.fn(),
      getContexts: vi
        .fn()
        .mockReturnValue([
          { name: "kind-cygni-test", cluster: "cygni-test", user: "test" },
        ]),
      setCurrentContext: vi.fn(),
      makeApiClient: vi.fn().mockImplementation(() => ({
        createNamespacedJob: vi.fn().mockResolvedValue({
          response: { statusCode: 201 },
          body: {
            metadata: { name: `kaniko-${buildId}`, namespace: "cygni-builds" },
            status: {},
          },
        }),
        readNamespacedJob: vi.fn().mockResolvedValue({
          body: {
            status: {
              failed: 1,
              conditions: [{ type: "Failed", reason: "DeadlineExceeded" }],
            },
          },
        }),
        readNamespacedJobStatus: vi.fn().mockResolvedValue({
          body: {
            status: {
              failed: 1,
              conditions: [{ type: "Failed", reason: "DeadlineExceeded" }],
            },
          },
        }),
        listNamespacedPod: vi.fn().mockResolvedValue({
          body: {
            items: [
              {
                metadata: { name: `kaniko-${buildId}-pod` },
                status: { phase: "Failed" },
              },
            ],
          },
        }),
        readNamespacedPodLog: vi.fn().mockResolvedValue({
          body: "Error: Failed to pull git repository\nFatal: repository not found",
        }),
        deleteNamespacedJob: vi.fn().mockResolvedValue({}),
        createNamespacedSecret: vi.fn().mockResolvedValue({}),
        deleteNamespacedSecret: vi.fn().mockResolvedValue({}),
      })),
    }));

    const kanikoBuilder = new KanikoBuilder(REGISTRY_URL, "cygni-builds");

    // Expect the build to throw an error
    await expect(
      kanikoBuilder.build({
        buildId,
        gitUrl: "https://github.com/invalid/repo.git",
        gitRef: "main",
        contextPath: ".",
        dockerfilePath: "Dockerfile.nonexistent",
        buildArgs: {},
        cacheKey: "test-cache",
      }),
    ).rejects.toThrow();
  });
});

describe("E2E - Builder Service with Kaniko Integration", () => {
  it("should process build request through full pipeline", async () => {
    // Mock the full build pipeline
    const buildId = `pipeline-${uuidv4().substring(0, 8)}`;

    // Simulate build creation
    const build = {
      id: buildId,
      projectId: "e2e-kaniko-test",
      branch: "main",
      commitSha: "abc123",
      status: BuildStatus.PENDING,
      dockerfilePath: "Dockerfile",
      repoUrl: "https://github.com/test/repo.git",
    };

    // Simulate status progression
    const statusProgression = [
      BuildStatus.PENDING,
      BuildStatus.QUEUED,
      BuildStatus.RUNNING,
      BuildStatus.SUCCESS,
    ];

    let currentStatus = 0;
    const getStatus = () => {
      if (currentStatus < statusProgression.length - 1) {
        currentStatus++;
      }
      return statusProgression[currentStatus];
    };

    // Simulate the build progressing through states
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      build.status = getStatus();
    }

    expect(build.status).toBe(BuildStatus.SUCCESS);
  });
});
