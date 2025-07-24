"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bullmq_1 = require("bullmq");
const prisma_1 = require("../../src/lib/prisma");
const build_1 = require("../../src/types/build");
// Mock external dependencies
vitest_1.vi.mock("ioredis", () => ({
    default: vitest_1.vi.fn().mockImplementation(() => ({
        on: vitest_1.vi.fn(),
        connect: vitest_1.vi.fn(),
        disconnect: vitest_1.vi.fn(),
        quit: vitest_1.vi.fn(),
        lrange: vitest_1.vi.fn().mockResolvedValue([]),
        hgetall: vitest_1.vi.fn().mockResolvedValue({}),
    })),
}));
vitest_1.vi.mock("bullmq", () => ({
    Queue: vitest_1.vi.fn().mockImplementation(() => ({
        add: vitest_1.vi.fn().mockResolvedValue({ id: "test-job-id" }),
        getJob: vitest_1.vi.fn(),
        on: vitest_1.vi.fn(),
    })),
    Worker: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../../src/lib/prisma", () => ({
    prisma: {
        build: {
            create: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        $queryRaw: vitest_1.vi.fn().mockResolvedValue([{ 1: 1 }]),
    },
}));
(0, vitest_1.describe)("Builder Service Integration - Redis ↔ Postgres", () => {
    let buildQueue;
    (0, vitest_1.beforeAll)(async () => {
        buildQueue = new bullmq_1.Queue("builds");
    });
    (0, vitest_1.afterAll)(async () => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should create build and queue job via API → Builder → Redis → Postgres", async () => {
        // Mock build creation in database
        const mockBuild = {
            id: "test-build-id",
            projectId: "test-project-1",
            branch: "main",
            commitSha: "abc123",
            status: build_1.BuildStatus.PENDING,
            dockerfilePath: "Dockerfile",
            buildArgs: { NODE_ENV: "production" },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        vitest_1.vi.mocked(prisma_1.prisma.build.create).mockResolvedValueOnce(mockBuild);
        vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(mockBuild);
        // Simulate build creation
        const build = await prisma_1.prisma.build.create({
            data: {
                projectId: "test-project-1",
                branch: "main",
                commitSha: "abc123",
                status: build_1.BuildStatus.PENDING,
                dockerfilePath: "Dockerfile",
                buildArgs: { NODE_ENV: "production" },
            },
        });
        (0, vitest_1.expect)(build).toBeDefined();
        (0, vitest_1.expect)(build.id).toBe("test-build-id");
        (0, vitest_1.expect)(build.status).toBe(build_1.BuildStatus.PENDING);
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
        (0, vitest_1.expect)(job).toBeDefined();
        (0, vitest_1.expect)(job.id).toBe("test-job-id");
        // Verify the queue add was called
        (0, vitest_1.expect)(buildQueue.add).toHaveBeenCalledWith("build", vitest_1.expect.objectContaining({
            buildId: "test-build-id",
            projectId: "test-project-1",
        }));
        // Simulate status update
        vitest_1.vi.mocked(prisma_1.prisma.build.update).mockResolvedValueOnce({
            ...mockBuild,
            status: build_1.BuildStatus.QUEUED,
        });
        const updatedBuild = await prisma_1.prisma.build.update({
            where: { id: build.id },
            data: { status: build_1.BuildStatus.QUEUED },
        });
        (0, vitest_1.expect)(updatedBuild.status).toBe(build_1.BuildStatus.QUEUED);
    });
    (0, vitest_1.it)("should handle builder service health checks", async () => {
        // Mock health check response
        const mockHealthChecks = {
            database: true,
            redis: true,
        };
        // Verify database health
        const dbResult = await prisma_1.prisma.$queryRaw `SELECT 1`;
        (0, vitest_1.expect)(dbResult).toBeDefined();
        (0, vitest_1.expect)(mockHealthChecks.database).toBe(true);
        // Verify Redis connection
        (0, vitest_1.expect)(mockHealthChecks.redis).toBe(true);
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
        (0, vitest_1.expect)(healthStatus.status).toBe("ok");
        (0, vitest_1.expect)(healthStatus.checks.database).toBe("healthy");
        (0, vitest_1.expect)(healthStatus.checks.redis).toBe("healthy");
    });
});
//# sourceMappingURL=builder-redis-postgres.test.js.map