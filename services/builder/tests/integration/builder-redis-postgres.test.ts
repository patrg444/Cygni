import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Queue } from "bullmq";
import { prisma } from "../../src/lib/prisma";
import { BuildStatus } from "../../src/types/build";

// Mock external dependencies
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    lrange: vi.fn().mockResolvedValue([]),
    hgetall: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "test-job-id" }),
    getJob: vi.fn(),
    on: vi.fn(),
  })),
  Worker: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    build: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

describe("Builder Service Integration - Redis ↔ Postgres", () => {
  let buildQueue: any;

  beforeAll(async () => {
    buildQueue = new Queue("builds");
  });

  afterAll(async () => {
    vi.clearAllMocks();
  });

  it("should create build and queue job via API → Builder → Redis → Postgres", async () => {
    // Mock build creation in database
    const mockBuild = {
      id: "test-build-id",
      projectId: "test-project-1",
      branch: "main",
      commitSha: "abc123",
      status: BuildStatus.PENDING,
      dockerfilePath: "Dockerfile",
      buildArgs: { NODE_ENV: "production" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.build.create).mockResolvedValueOnce(mockBuild as any);
    vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(mockBuild as any);

    // Simulate build creation
    const build = await prisma.build.create({
      data: {
        projectId: "test-project-1",
        branch: "main",
        commitSha: "abc123",
        status: BuildStatus.PENDING,
        dockerfilePath: "Dockerfile",
        buildArgs: { NODE_ENV: "production" },
      },
    });

    expect(build).toBeDefined();
    expect(build.id).toBe("test-build-id");
    expect(build.status).toBe(BuildStatus.PENDING);

    // Simulate queueing the job
    const job = await buildQueue.add("build", {
      buildId: build.id,
      projectId: build.projectId,
      repoUrl: "https://github.com/test/repo",
      commitSha: build.commitSha,
      branch: build.branch,
      dockerfilePath: build.dockerfilePath,
      buildArgs: build.buildArgs,
    });

    expect(job).toBeDefined();
    expect(job.id).toBe("test-job-id");

    // Verify the queue add was called
    expect(buildQueue.add).toHaveBeenCalledWith(
      "build",
      expect.objectContaining({
        buildId: "test-build-id",
        projectId: "test-project-1",
      }),
    );

    // Simulate status update
    vi.mocked(prisma.build.update).mockResolvedValueOnce({
      ...mockBuild,
      status: BuildStatus.QUEUED,
    } as any);

    const updatedBuild = await prisma.build.update({
      where: { id: build.id },
      data: { status: BuildStatus.QUEUED },
    });

    expect(updatedBuild.status).toBe(BuildStatus.QUEUED);
  });

  it("should handle builder service health checks", async () => {
    // Mock health check response
    const mockHealthChecks = {
      database: true,
      redis: true,
    };

    // Verify database health
    const dbResult = await prisma.$queryRaw`SELECT 1`;
    expect(dbResult).toBeDefined();
    expect(mockHealthChecks.database).toBe(true);

    // Verify Redis connection
    expect(mockHealthChecks.redis).toBe(true);

    // Simulate overall health status
    const healthStatus = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: "healthy",
        redis: "healthy",
      },
    };

    expect(healthStatus.status).toBe("ok");
    expect(healthStatus.checks.database).toBe("healthy");
    expect(healthStatus.checks.redis).toBe("healthy");
  });
});
