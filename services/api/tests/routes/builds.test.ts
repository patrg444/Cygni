import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fastify, { FastifyInstance } from "fastify";
import { buildRoutes } from "../../src/routes/builds";
import { BuildStatus } from "@prisma/client";
import axios from "axios";

// Mock prisma
vi.mock("../../src/utils/prisma", () => ({
  prisma: {
    build: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock axios
vi.mock("axios");

// Import prisma after mocking
import { prisma } from "../../src/utils/prisma";

describe("Build Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify({ logger: false });
    
    // Add authenticate decorator
    app.decorate("authenticate", async (request: any, reply: any) => {
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
    
    await app.register(buildRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /builds", () => {
    it("should return 200 with build ID for valid request", async () => {
      const mockBuild = {
        id: "test-build-id",
        projectId: "test-project-id",
        status: BuildStatus.pending,
        commitSha: "abc123",
        branch: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        name: "test-project",
        organizationId: "test-org",
        repository: "https://github.com/test/repo",
        members: [],
        organization: { members: [{ userId: "test-user-id" }] },
      } as any);

      vi.mocked(prisma.build.create).mockResolvedValueOnce(mockBuild as any);
      vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });

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

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("id", "test-build-id");
      expect(body).toHaveProperty("status", BuildStatus.pending);
      
      // Verify axios was called to builder service
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/builds"),
        expect.objectContaining({
          buildId: "test-build-id",
          projectId: "test-project-id",
        })
      );
    });

    it("should return 400 for project without repository", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        name: "test-project",
        organizationId: "test-org",
        repository: null,
      } as any);
      
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

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
      expect(body.error).toContain("repository");
    });

    it("should return 401 for missing API key", async () => {
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

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /builds/:buildId", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return build status for valid ID", async () => {
      const mockBuild = {
        id: "test-build-id",
        projectId: "test-project-id",
        status: BuildStatus.running,
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

      vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(mockBuild as any);
      
      // Mock verifyProjectAccess - second call to findUnique
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        members: [],
        organization: { members: [{ userId: "test-user-id" }] },
      } as any);

      const response = await app.inject({
        method: "GET",
        url: "/builds/test-build-id",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("id", "test-build-id");
      expect(body).toHaveProperty("status", BuildStatus.running);
    });

    it("should return 404 for non-existent build", async () => {
      vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/builds/non-existent-id",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /builds/:buildId/logs", () => {
    it("should return build logs", async () => {
      const mockBuild = {
        id: "test-build-id",
        projectId: "test-project-id",
        status: BuildStatus.success,
        logs: "Build completed successfully",
      };

      vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(mockBuild as any);
      vi.mocked(axios.get).mockResolvedValueOnce({ 
        data: { logs: "Detailed build logs from builder service" } 
      });

      // Mock verifyProjectAccess
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        members: [],
        organization: { members: [{ userId: "test-user-id" }] },
      } as any);

      const response = await app.inject({
        method: "GET",
        url: "/builds/test-build-id/logs",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("logs");
      expect(body.logs).toContain("Detailed build logs");
    });
  });

  describe("POST /builds/:buildId/cancel", () => {
    it("should cancel a running build", async () => {
      const mockBuild = {
        id: "test-build-id",
        projectId: "test-project-id",
        status: BuildStatus.running,
      };

      vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(mockBuild as any);
      vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
      vi.mocked(prisma.build.update).mockResolvedValueOnce({
        ...mockBuild,
        status: BuildStatus.cancelled,
      } as any);

      // Mock verifyProjectAccess
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        members: [],
        organization: { members: [{ userId: "test-user-id" }] },
      } as any);

      const response = await app.inject({
        method: "POST",
        url: "/builds/test-build-id/cancel",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("status", BuildStatus.cancelled);
    });

    it("should return 400 for completed build", async () => {
      const mockBuild = {
        id: "test-build-id",
        projectId: "test-project-id",
        status: BuildStatus.success,
      };

      vi.mocked(prisma.build.findUnique).mockResolvedValueOnce(mockBuild as any);

      // Mock verifyProjectAccess
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        id: "test-project-id",
        members: [],
        organization: { members: [{ userId: "test-user-id" }] },
      } as any);

      const response = await app.inject({
        method: "POST",
        url: "/builds/test-build-id/cancel",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("cannot be cancelled");
    });
  });
});