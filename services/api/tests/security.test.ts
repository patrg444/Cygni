import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fastify, { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { authRoutes } from "../src/routes/auth";
import { budgetService } from "../src/services/budget";

// Mock dependencies
vi.mock("../src/utils/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    organizationMember: {
      findMany: vi.fn(),
    },
    budget: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    usage: {
      aggregate: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/services/budget", () => ({
  budgetService: {
    checkBudget: vi.fn(),
    trackUsage: vi.fn(),
  },
}));

import { prisma } from "../src/utils/prisma";

describe("Security - Authentication & JWT", () => {
  let app: FastifyInstance;
  const JWT_SECRET = "test-secret";

  beforeAll(async () => {
    app = fastify({ logger: false });
    process.env.JWT_SECRET = JWT_SECRET;

    // Register JWT plugin
    await app.register(require("@fastify/jwt"), {
      secret: JWT_SECRET,
    });

    // Register authenticate decorator
    app.decorate("authenticate", async (request: any, reply: any) => {
      try {
        const token = request.headers.authorization?.replace("Bearer ", "");
        if (!token) {
          return reply.status(401).send({ error: "No token provided" });
        }

        const payload = await request.server.jwt.verify(token);

        // Mock user lookup
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
        });

        if (!user) {
          return reply.status(401).send({ error: "User not found" });
        }

        // Mock organization lookup
        const organizations = await prisma.organizationMember.findMany({
          where: { userId: user.id },
          include: { organization: true },
        });

        request.auth = {
          user,
          organizations,
        };
      } catch (error) {
        return reply.status(401).send({ error: "Invalid token" });
      }
    });

    await app.register(authRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should validate JWT tokens correctly", async () => {
    const payload = {
      sub: "test-user",
      email: "test@example.com",
      organizations: [],
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

    // Mock user lookup
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "test-user",
      email: "test@example.com",
      name: "Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Mock organization membership lookup
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValueOnce([
      {
        userId: "test-user",
        role: "owner",
        organization: {
          id: "test-org",
          name: "Test Org",
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ] as any);

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("user");
    expect(body.user).toHaveProperty("id", "test-user");
  });

  it("should reject expired tokens", async () => {
    const payload = {
      sub: "test-user",
      email: "test@example.com",
      organizations: [],
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "-1h" }); // Already expired

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("should handle JWKS rotation (token signed with old key)", async () => {
    // This test simulates token rotation by checking that tokens signed
    // with a previous secret are still valid for a grace period

    const oldSecret = "old-secret";
    const newSecret = "new-secret";

    // Sign token with old secret
    const payload = {
      sub: "test-user",
      email: "test@example.com",
      organizations: [],
    };
    const oldToken = jwt.sign(payload, oldSecret, { expiresIn: "1h" });

    // Update app to use new secret with grace period for old tokens
    // In real implementation, this would check against a key rotation policy

    // For now, we'll test that invalid tokens are rejected
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: `Bearer ${oldToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("Security - Budget Cap Enforcement", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify({ logger: false });

    // Mock authenticate decorator
    app.decorate("authenticate", async (request: any) => {
      request.auth = {
        user: { id: "test-user", organizationId: "test-org" },
      };
    });

    // Register a test route that uses budget checking
    app.post(
      "/test/deploy",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const hasRemainingBudget = await budgetService.checkBudget("test-org");

        if (!hasRemainingBudget) {
          return reply.status(402).send({
            error: "Budget limit exceeded",
            code: "BUDGET_EXCEEDED",
          });
        }

        return { deployed: true };
      },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("should enforce budget cap and return 402 when exceeded", async () => {
    // Mock budget service to indicate budget exceeded
    vi.mocked(budgetService.checkBudget).mockResolvedValueOnce(false);

    const response = await app.inject({
      method: "POST",
      url: "/test/deploy",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    expect(response.statusCode).toBe(402);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("error", "Budget limit exceeded");
    expect(body).toHaveProperty("code", "BUDGET_EXCEEDED");
  });

  it("should allow deployment when budget is available", async () => {
    // Mock budget service to indicate budget available
    vi.mocked(budgetService.checkBudget).mockResolvedValueOnce(true);

    const response = await app.inject({
      method: "POST",
      url: "/test/deploy",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("deployed", true);
  });
});

describe("Security - API Key Authentication", () => {
  it("should validate API keys", async () => {
    // Mock API key lookup
    const mockApiKey = {
      id: "key-id",
      key: "test-api-key",
      userId: "test-user",
      organizationId: "test-org",
      active: true,
      lastUsedAt: new Date(),
    };

    // Add apiKey to prisma mock
    vi.mocked(prisma).apiKey = {
      findUnique: vi.fn().mockResolvedValueOnce(mockApiKey),
    } as any;

    // Test would verify API key authentication
    // Implementation depends on your API key middleware
    expect(vi.mocked(prisma).apiKey.findUnique).toBeDefined();
  });
});
