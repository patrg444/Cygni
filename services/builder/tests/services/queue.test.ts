import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BuildStatus } from "../../src/types/build";
import { prisma } from "../../src/lib/prisma";
import { logger } from "../../src/lib/logger";

// Mock dependencies
vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    build: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/services/kaniko-builder", () => ({
  KanikoBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn(),
  })),
}));

// Mock Redis
vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
});

// Mock bullmq before any imports
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    add: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
  Job: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

// Import after mocks
import { KanikoBuilder } from "../../src/services/kaniko-builder";
import { Worker } from "bullmq";

describe("Build Queue Worker", () => {
  let mockJob: any;
  let buildWorkerProcessor: (job: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set environment variables needed for tests
    process.env.API_SERVICE_URL = "http://api:3000";
    process.env.INTERNAL_SECRET = "test-secret";

    mockJob = {
      id: "test-job-id",
      data: {
        buildId: "test-build-id",
        projectId: "test-project-id",
        repoUrl: "https://github.com/test/repo",
        commitSha: "abc123",
        branch: "main",
        dockerfilePath: "Dockerfile",
        buildArgs: { NODE_ENV: "production" },
      },
    };

    // Capture the worker processor function when Worker is instantiated
    vi.mocked(Worker).mockImplementation((_name: string, processor: any) => {
      buildWorkerProcessor = processor;
      return {
        on: vi.fn(),
      } as any;
    });

    // Import the queue module to trigger Worker instantiation
    await import("../../src/services/queue");
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should process build job successfully", async () => {
    const mockBuildResult = {
      imageUrl: "registry.example.com/test:abc123",
      imageSha: "sha256:abcdef",
      logs: "Build successful",
      duration: 120,
    };

    // Mock KanikoBuilder to return the expected result
    vi.mocked(KanikoBuilder).mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValueOnce(mockBuildResult),
        }) as any,
    );

    vi.mocked(prisma.build.findUnique).mockResolvedValueOnce({
      id: "test-build-id",
      metadata: { existingData: true },
    } as any);

    vi.mocked(prisma.build.update).mockResolvedValueOnce({} as any);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as any);

    const result = await buildWorkerProcessor(mockJob);

    // Verify build status was updated to running
    expect(prisma.build.update).toHaveBeenCalledWith({
      where: { id: "test-build-id" },
      data: { status: BuildStatus.RUNNING },
    });

    // Verify Kaniko builder was called with correct params
    const kanikoInstance = vi.mocked(KanikoBuilder).mock.results[0].value;
    expect(kanikoInstance.build).toHaveBeenCalledWith({
      buildId: "test-build-id",
      gitUrl: "https://github.com/test/repo",
      gitRef: "abc123",
      contextPath: ".",
      dockerfilePath: "Dockerfile",
      buildArgs: { NODE_ENV: "production" },
      cacheKey: "test-project-id-main",
    });

    // Verify build was updated with success
    expect(prisma.build.update).toHaveBeenCalledWith({
      where: { id: "test-build-id" },
      data: {
        status: BuildStatus.SUCCESS,
        imageUrl: "registry.example.com/test:abc123",
        logs: "Build successful",
        metadata: expect.objectContaining({
          existingData: true,
          imageSha: "sha256:abcdef",
          buildDuration: 120,
        }),
      },
    });

    // Verify API notification
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/internal/builds/complete"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining("test-build-id"),
      }),
    );

    expect(result).toEqual({
      success: true,
      imageUrl: "registry.example.com/test:abc123",
      imageSha: "sha256:abcdef",
    });
  });

  it("should handle build failure", async () => {
    const mockError = new Error("Kaniko build failed");

    // Mock KanikoBuilder to throw error
    vi.mocked(KanikoBuilder).mockImplementation(
      () =>
        ({
          build: vi.fn().mockRejectedValueOnce(mockError),
        }) as any,
    );

    vi.mocked(prisma.build.update).mockResolvedValue({} as any);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as any);

    await expect(buildWorkerProcessor(mockJob)).rejects.toThrow(
      "Kaniko build failed",
    );

    // Verify build was updated with failure
    expect(prisma.build.update).toHaveBeenCalledWith({
      where: { id: "test-build-id" },
      data: {
        status: BuildStatus.FAILED,
        logs: "Kaniko build failed",
      },
    });

    // Verify API notification of failure
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/internal/builds/complete"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("failed"),
      }),
    );
  });

  it("should handle API notification failure gracefully", async () => {
    const mockBuildResult = {
      imageUrl: "registry.example.com/test:abc123",
      imageSha: "sha256:abcdef",
      logs: "Build successful",
      duration: 120,
    };

    // Mock KanikoBuilder to return the expected result
    vi.mocked(KanikoBuilder).mockImplementation(
      () =>
        ({
          build: vi.fn().mockResolvedValueOnce(mockBuildResult),
        }) as any,
    );

    vi.mocked(prisma.build.findUnique).mockResolvedValueOnce({
      id: "test-build-id",
      metadata: {},
    } as any);

    vi.mocked(prisma.build.update).mockResolvedValueOnce({} as any);

    // API notification fails
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await buildWorkerProcessor(mockJob);

    // Build should still succeed even if notification fails
    expect(result).toEqual({
      success: true,
      imageUrl: "registry.example.com/test:abc123",
      imageSha: "sha256:abcdef",
    });

    // Error should be logged
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "test-build-id",
      }),
      "Failed to notify API service",
    );
  });
});
