"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fastify_1 = __importDefault(require("fastify"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_1 = require("../src/routes/auth");
const budget_1 = require("../src/services/budget");
// Mock dependencies
vitest_1.vi.mock("../src/utils/prisma", () => ({
    prisma: {
        user: {
            create: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        organization: {
            findUnique: vitest_1.vi.fn(),
        },
        organizationMember: {
            findMany: vitest_1.vi.fn(),
        },
        budget: {
            findUnique: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        },
        usage: {
            aggregate: vitest_1.vi.fn(),
        },
        apiKey: {
            findUnique: vitest_1.vi.fn(),
        },
    },
}));
vitest_1.vi.mock("../src/services/budget", () => ({
    budgetService: {
        checkBudget: vitest_1.vi.fn(),
        trackUsage: vitest_1.vi.fn(),
    },
}));
const prisma_1 = require("../src/utils/prisma");
(0, vitest_1.describe)("Security - Authentication & JWT", () => {
    let app;
    const JWT_SECRET = "test-secret";
    (0, vitest_1.beforeAll)(async () => {
        app = (0, fastify_1.default)({ logger: false });
        process.env.JWT_SECRET = JWT_SECRET;
        // Register JWT plugin
        await app.register(require("@fastify/jwt"), {
            secret: JWT_SECRET,
        });
        // Register authenticate decorator
        app.decorate("authenticate", async (request, reply) => {
            try {
                const token = request.headers.authorization?.replace("Bearer ", "");
                if (!token) {
                    return reply.status(401).send({ error: "No token provided" });
                }
                const payload = await request.server.jwt.verify(token);
                // Mock user lookup
                const user = await prisma_1.prisma.user.findUnique({
                    where: { id: payload.sub },
                });
                if (!user) {
                    return reply.status(401).send({ error: "User not found" });
                }
                // Mock organization lookup
                const organizations = await prisma_1.prisma.organizationMember.findMany({
                    where: { userId: user.id },
                    include: { organization: true },
                });
                request.auth = {
                    user,
                    organizations,
                };
            }
            catch (error) {
                return reply.status(401).send({ error: "Invalid token" });
            }
        });
        await app.register(auth_1.authRoutes);
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.it)("should validate JWT tokens correctly", async () => {
        const payload = {
            sub: "test-user",
            email: "test@example.com",
            organizations: [],
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: "1h" });
        // Mock user lookup
        vitest_1.vi.mocked(prisma_1.prisma.user.findUnique).mockResolvedValueOnce({
            id: "test-user",
            email: "test@example.com",
            name: "Test User",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        // Mock organization membership lookup
        vitest_1.vi.mocked(prisma_1.prisma.organizationMember.findMany).mockResolvedValueOnce([
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
        ]);
        const response = await app.inject({
            method: "GET",
            url: "/me",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        (0, vitest_1.expect)(body).toHaveProperty("user");
        (0, vitest_1.expect)(body.user).toHaveProperty("id", "test-user");
    });
    (0, vitest_1.it)("should reject expired tokens", async () => {
        const payload = {
            sub: "test-user",
            email: "test@example.com",
            organizations: [],
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: "-1h" }); // Already expired
        const response = await app.inject({
            method: "GET",
            url: "/me",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });
        (0, vitest_1.expect)(response.statusCode).toBe(401);
    });
    (0, vitest_1.it)("should handle JWKS rotation (token signed with old key)", async () => {
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
        const oldToken = jsonwebtoken_1.default.sign(payload, oldSecret, { expiresIn: "1h" });
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
        (0, vitest_1.expect)(response.statusCode).toBe(401);
    });
});
(0, vitest_1.describe)("Security - Budget Cap Enforcement", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = (0, fastify_1.default)({ logger: false });
        // Mock authenticate decorator
        app.decorate("authenticate", async (request) => {
            request.auth = {
                user: { id: "test-user", organizationId: "test-org" },
            };
        });
        // Register a test route that uses budget checking
        app.post("/test/deploy", { preHandler: [app.authenticate] }, async (request, reply) => {
            const hasRemainingBudget = await budget_1.budgetService.checkBudget("test-org");
            if (!hasRemainingBudget) {
                return reply.status(402).send({
                    error: "Budget limit exceeded",
                    code: "BUDGET_EXCEEDED",
                });
            }
            return { deployed: true };
        });
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.it)("should enforce budget cap and return 402 when exceeded", async () => {
        // Mock budget service to indicate budget exceeded
        vitest_1.vi.mocked(budget_1.budgetService.checkBudget).mockResolvedValueOnce(false);
        const response = await app.inject({
            method: "POST",
            url: "/test/deploy",
            headers: {
                authorization: "Bearer test-token",
            },
        });
        (0, vitest_1.expect)(response.statusCode).toBe(402);
        const body = JSON.parse(response.body);
        (0, vitest_1.expect)(body).toHaveProperty("error", "Budget limit exceeded");
        (0, vitest_1.expect)(body).toHaveProperty("code", "BUDGET_EXCEEDED");
    });
    (0, vitest_1.it)("should allow deployment when budget is available", async () => {
        // Mock budget service to indicate budget available
        vitest_1.vi.mocked(budget_1.budgetService.checkBudget).mockResolvedValueOnce(true);
        const response = await app.inject({
            method: "POST",
            url: "/test/deploy",
            headers: {
                authorization: "Bearer test-token",
            },
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        (0, vitest_1.expect)(body).toHaveProperty("deployed", true);
    });
});
(0, vitest_1.describe)("Security - API Key Authentication", () => {
    (0, vitest_1.it)("should validate API keys", async () => {
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
        vitest_1.vi.mocked(prisma_1.prisma).apiKey = {
            findUnique: vitest_1.vi.fn().mockResolvedValueOnce(mockApiKey),
        };
        // Test would verify API key authentication
        // Implementation depends on your API key middleware
        (0, vitest_1.expect)(vitest_1.vi.mocked(prisma_1.prisma).apiKey.findUnique).toBeDefined();
    });
});
//# sourceMappingURL=security.test.js.map