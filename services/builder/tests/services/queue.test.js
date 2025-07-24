"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const build_1 = require("../../src/types/build");
const prisma_1 = require("../../src/lib/prisma");
const logger_1 = require("../../src/lib/logger");
// Mock dependencies
vitest_1.vi.mock("../../src/lib/prisma", () => ({
    prisma: {
        build: {
            update: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
        },
    },
}));
vitest_1.vi.mock("../../src/lib/logger", () => ({
    logger: {
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../../src/services/kaniko-builder", () => ({
    KanikoBuilder: vitest_1.vi.fn().mockImplementation(() => ({
        build: vitest_1.vi.fn(),
    })),
}));
// Mock Redis
vitest_1.vi.mock("ioredis", () => {
    return {
        default: vitest_1.vi.fn().mockImplementation(() => ({
            on: vitest_1.vi.fn(),
            connect: vitest_1.vi.fn(),
            disconnect: vitest_1.vi.fn(),
        })),
    };
});
// Mock bullmq before any imports
vitest_1.vi.mock("bullmq", () => ({
    Queue: vitest_1.vi.fn().mockImplementation(() => ({
        on: vitest_1.vi.fn(),
        add: vitest_1.vi.fn(),
    })),
    Worker: vitest_1.vi.fn().mockImplementation(() => ({
        on: vitest_1.vi.fn(),
    })),
    Job: vitest_1.vi.fn(),
}));
// Mock fetch globally
global.fetch = vitest_1.vi.fn();
// Import after mocks
const kaniko_builder_1 = require("../../src/services/kaniko-builder");
const bullmq_1 = require("bullmq");
(0, vitest_1.describe)("Build Queue Worker", () => {
    let mockJob;
    let buildWorkerProcessor;
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.clearAllMocks();
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
        vitest_1.vi.mocked(bullmq_1.Worker).mockImplementation((_name, processor) => {
            buildWorkerProcessor = processor;
            return {
                on: vitest_1.vi.fn(),
            };
        });
        // Import the queue module to trigger Worker instantiation
        await Promise.resolve().then(() => __importStar(require("../../src/services/queue")));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.it)("should process build job successfully", async () => {
        const mockBuildResult = {
            imageUrl: "registry.example.com/test:abc123",
            imageSha: "sha256:abcdef",
            logs: "Build successful",
            duration: 120,
        };
        // Mock KanikoBuilder to return the expected result
        vitest_1.vi.mocked(kaniko_builder_1.KanikoBuilder).mockImplementation(() => ({
            build: vitest_1.vi.fn().mockResolvedValueOnce(mockBuildResult),
        }));
        vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce({
            id: "test-build-id",
            metadata: { existingData: true },
        });
        vitest_1.vi.mocked(prisma_1.prisma.build.update).mockResolvedValueOnce({});
        vitest_1.vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });
        const result = await buildWorkerProcessor(mockJob);
        // Verify build status was updated to running
        (0, vitest_1.expect)(prisma_1.prisma.build.update).toHaveBeenCalledWith({
            where: { id: "test-build-id" },
            data: { status: build_1.BuildStatus.RUNNING },
        });
        // Verify Kaniko builder was called with correct params
        const kanikoInstance = vitest_1.vi.mocked(kaniko_builder_1.KanikoBuilder).mock.results[0].value;
        (0, vitest_1.expect)(kanikoInstance.build).toHaveBeenCalledWith({
            buildId: "test-build-id",
            gitUrl: "https://github.com/test/repo",
            gitRef: "abc123",
            contextPath: ".",
            dockerfilePath: "Dockerfile",
            buildArgs: { NODE_ENV: "production" },
            cacheKey: "test-project-id-main",
        });
        // Verify build was updated with success
        (0, vitest_1.expect)(prisma_1.prisma.build.update).toHaveBeenCalledWith({
            where: { id: "test-build-id" },
            data: {
                status: build_1.BuildStatus.SUCCESS,
                imageUrl: "registry.example.com/test:abc123",
                logs: "Build successful",
                metadata: vitest_1.expect.objectContaining({
                    existingData: true,
                    imageSha: "sha256:abcdef",
                    buildDuration: 120,
                }),
            },
        });
        // Verify API notification
        (0, vitest_1.expect)(fetch).toHaveBeenCalledWith(vitest_1.expect.stringContaining("/internal/builds/complete"), vitest_1.expect.objectContaining({
            method: "POST",
            headers: vitest_1.expect.objectContaining({
                "Content-Type": "application/json",
            }),
            body: vitest_1.expect.stringContaining("test-build-id"),
        }));
        (0, vitest_1.expect)(result).toEqual({
            success: true,
            imageUrl: "registry.example.com/test:abc123",
            imageSha: "sha256:abcdef",
        });
    });
    (0, vitest_1.it)("should handle build failure", async () => {
        const mockError = new Error("Kaniko build failed");
        // Mock KanikoBuilder to throw error
        vitest_1.vi.mocked(kaniko_builder_1.KanikoBuilder).mockImplementation(() => ({
            build: vitest_1.vi.fn().mockRejectedValueOnce(mockError),
        }));
        vitest_1.vi.mocked(prisma_1.prisma.build.update).mockResolvedValue({});
        vitest_1.vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });
        await (0, vitest_1.expect)(buildWorkerProcessor(mockJob)).rejects.toThrow("Kaniko build failed");
        // Verify build was updated with failure
        (0, vitest_1.expect)(prisma_1.prisma.build.update).toHaveBeenCalledWith({
            where: { id: "test-build-id" },
            data: {
                status: build_1.BuildStatus.FAILED,
                logs: "Kaniko build failed",
            },
        });
        // Verify API notification of failure
        (0, vitest_1.expect)(fetch).toHaveBeenCalledWith(vitest_1.expect.stringContaining("/internal/builds/complete"), vitest_1.expect.objectContaining({
            method: "POST",
            body: vitest_1.expect.stringContaining("failed"),
        }));
    });
    (0, vitest_1.it)("should handle API notification failure gracefully", async () => {
        const mockBuildResult = {
            imageUrl: "registry.example.com/test:abc123",
            imageSha: "sha256:abcdef",
            logs: "Build successful",
            duration: 120,
        };
        // Mock KanikoBuilder to return the expected result
        vitest_1.vi.mocked(kaniko_builder_1.KanikoBuilder).mockImplementation(() => ({
            build: vitest_1.vi.fn().mockResolvedValueOnce(mockBuildResult),
        }));
        vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce({
            id: "test-build-id",
            metadata: {},
        });
        vitest_1.vi.mocked(prisma_1.prisma.build.update).mockResolvedValueOnce({});
        // API notification fails
        vitest_1.vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
        const result = await buildWorkerProcessor(mockJob);
        // Build should still succeed even if notification fails
        (0, vitest_1.expect)(result).toEqual({
            success: true,
            imageUrl: "registry.example.com/test:abc123",
            imageSha: "sha256:abcdef",
        });
        // Error should be logged
        (0, vitest_1.expect)(logger_1.logger.error).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            buildId: "test-build-id",
        }), "Failed to notify API service");
    });
});
//# sourceMappingURL=queue.test.js.map