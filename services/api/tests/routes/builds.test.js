"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fastify_1 = __importDefault(require("fastify"));
const builds_1 = require("../../src/routes/builds");
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
// Mock prisma
vitest_1.vi.mock("../../src/utils/prisma", () => ({
    prisma: {
        build: {
            create: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
        },
        project: {
            findUnique: vitest_1.vi.fn(),
        },
    },
}));
// Mock axios
vitest_1.vi.mock("axios");
// Import prisma after mocking
const prisma_1 = require("../../src/utils/prisma");
(0, vitest_1.describe)("Build Routes", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = (0, fastify_1.default)({ logger: false });
        // Add authenticate decorator
        app.decorate("authenticate", async (request, reply) => {
            if (!request.headers["x-api-key"] && !request.headers.authorization) {
                reply.code(401).send({ error: "Unauthorized" });
                return;
            }
            request.auth = {
                user: {
                    id: "test-user-id",
                    organizationId: "test-org-id",
                    role: "admin",
                },
            };
        });
        await app.register(builds_1.buildRoutes);
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.describe)("POST /builds", () => {
        (0, vitest_1.it)("should return 200 with build ID for valid request", async () => {
            const mockBuild = {
                id: "test-build-id",
                projectId: "test-project-id",
                status: client_1.BuildStatus.pending,
                commitSha: "abc123",
                branch: "main",
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                name: "test-project",
                organizationId: "test-org",
                repository: "https://github.com/test/repo",
                members: [],
                organization: { members: [{ userId: "test-user-id" }] },
            });
            vitest_1.vi.mocked(prisma_1.prisma.build.create).mockResolvedValueOnce(mockBuild);
            vitest_1.vi.mocked(axios_1.default.post).mockResolvedValueOnce({ data: { success: true } });
            const response = await app.inject({
                method: "POST",
                url: "/builds",
                headers: {
                    "x-api-key": "test-api-key",
                    "content-type": "application/json",
                },
                payload: {
                    projectId: "test-project-id",
                    branch: "main",
                    commitSha: "abc123",
                    dockerfilePath: "Dockerfile",
                    buildArgs: { NODE_ENV: "production" },
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body).toHaveProperty("id", "test-build-id");
            (0, vitest_1.expect)(body).toHaveProperty("status", client_1.BuildStatus.pending);
            // Verify axios was called to builder service
            (0, vitest_1.expect)(axios_1.default.post).toHaveBeenCalledWith(vitest_1.expect.stringContaining("/api/builds"), vitest_1.expect.objectContaining({
                buildId: "test-build-id",
                projectId: "test-project-id",
            }));
        });
        (0, vitest_1.it)("should return 400 for project without repository", async () => {
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                name: "test-project",
                organizationId: "test-org",
                repository: null,
            });
            const response = await app.inject({
                method: "POST",
                url: "/builds",
                headers: {
                    "x-api-key": "test-api-key",
                    "content-type": "application/json",
                },
                payload: {
                    projectId: "test-project-id",
                    branch: "main",
                    commitSha: "abc123",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body).toHaveProperty("error");
            (0, vitest_1.expect)(body.error).toContain("repository");
        });
        (0, vitest_1.it)("should return 401 for missing API key", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/builds",
                headers: {
                    "content-type": "application/json",
                },
                payload: {
                    projectId: "test-project-id",
                    branch: "main",
                    commitSha: "abc123",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(401);
        });
    });
    (0, vitest_1.describe)("GET /builds/:buildId", () => {
        beforeEach(() => {
            vitest_1.vi.clearAllMocks();
        });
        (0, vitest_1.it)("should return build status for valid ID", async () => {
            const mockBuild = {
                id: "test-build-id",
                projectId: "test-project-id",
                status: client_1.BuildStatus.running,
                imageUrl: null,
                logs: null,
                commitSha: "abc123",
                branch: "main",
                createdAt: new Date(),
                updatedAt: new Date(),
                project: {
                    id: "test-project-id",
                    members: [],
                    organization: { members: [{ userId: "test-user-id" }] },
                },
            };
            vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(mockBuild);
            // Mock verifyProjectAccess - second call to findUnique
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                members: [],
                organization: { members: [{ userId: "test-user-id" }] },
            });
            const response = await app.inject({
                method: "GET",
                url: "/builds/test-build-id",
                headers: {
                    "x-api-key": "test-api-key",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body).toHaveProperty("id", "test-build-id");
            (0, vitest_1.expect)(body).toHaveProperty("status", client_1.BuildStatus.running);
        });
        (0, vitest_1.it)("should return 404 for non-existent build", async () => {
            vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(null);
            const response = await app.inject({
                method: "GET",
                url: "/builds/non-existent-id",
                headers: {
                    "x-api-key": "test-api-key",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(404);
        });
    });
    (0, vitest_1.describe)("GET /builds/:buildId/logs", () => {
        (0, vitest_1.it)("should return build logs", async () => {
            const mockBuild = {
                id: "test-build-id",
                projectId: "test-project-id",
                status: client_1.BuildStatus.success,
                logs: "Build completed successfully",
            };
            vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(mockBuild);
            vitest_1.vi.mocked(axios_1.default.get).mockResolvedValueOnce({
                data: { logs: "Detailed build logs from builder service" },
            });
            // Mock verifyProjectAccess
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                members: [],
                organization: { members: [{ userId: "test-user-id" }] },
            });
            const response = await app.inject({
                method: "GET",
                url: "/builds/test-build-id/logs",
                headers: {
                    "x-api-key": "test-api-key",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body).toHaveProperty("logs");
            (0, vitest_1.expect)(body.logs).toContain("Detailed build logs");
        });
    });
    (0, vitest_1.describe)("POST /builds/:buildId/cancel", () => {
        (0, vitest_1.it)("should cancel a running build", async () => {
            const mockBuild = {
                id: "test-build-id",
                projectId: "test-project-id",
                status: client_1.BuildStatus.running,
            };
            vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(mockBuild);
            vitest_1.vi.mocked(axios_1.default.post).mockResolvedValueOnce({ data: { success: true } });
            vitest_1.vi.mocked(prisma_1.prisma.build.update).mockResolvedValueOnce({
                ...mockBuild,
                status: client_1.BuildStatus.cancelled,
            });
            // Mock verifyProjectAccess
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                members: [],
                organization: { members: [{ userId: "test-user-id" }] },
            });
            const response = await app.inject({
                method: "POST",
                url: "/builds/test-build-id/cancel",
                headers: {
                    "x-api-key": "test-api-key",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body).toHaveProperty("status", client_1.BuildStatus.cancelled);
        });
        (0, vitest_1.it)("should return 400 for completed build", async () => {
            const mockBuild = {
                id: "test-build-id",
                projectId: "test-project-id",
                status: client_1.BuildStatus.success,
            };
            vitest_1.vi.mocked(prisma_1.prisma.build.findUnique).mockResolvedValueOnce(mockBuild);
            // Mock verifyProjectAccess
            vitest_1.vi.mocked(prisma_1.prisma.project.findUnique).mockResolvedValueOnce({
                id: "test-project-id",
                members: [],
                organization: { members: [{ userId: "test-user-id" }] },
            });
            const response = await app.inject({
                method: "POST",
                url: "/builds/test-build-id/cancel",
                headers: {
                    "x-api-key": "test-api-key",
                },
            });
            (0, vitest_1.expect)(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            (0, vitest_1.expect)(body.error).toContain("cannot be cancelled");
        });
    });
});
//# sourceMappingURL=builds.test.js.map