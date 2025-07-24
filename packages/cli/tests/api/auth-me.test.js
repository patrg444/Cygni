"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_api_server_1 = require("../services/test-api-server");
const axios_1 = __importDefault(require("axios"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
(0, vitest_1.describe)("/auth/me endpoint tests", () => {
    let testServer;
    let serverPort;
    let baseURL;
    const JWT_SECRET = "test-secret-key";
    (0, vitest_1.beforeAll)(async () => {
        testServer = new test_api_server_1.TestApiServer();
        serverPort = await testServer.start();
        baseURL = `http://localhost:${serverPort}`;
    });
    (0, vitest_1.afterAll)(async () => {
        await testServer.stop();
    });
    (0, vitest_1.beforeEach)(() => {
        testServer.clearData();
    });
    function signJwt(payload) {
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { algorithm: "HS256" });
    }
    (0, vitest_1.describe)("Authentication tests", () => {
        (0, vitest_1.it)("should return 200 and user JSON with valid JWT", async () => {
            // Setup user data
            const userData = {
                id: "user_123",
                email: "test@example.com",
                name: "Test User",
                organizations: [
                    { id: "org_123", name: "Test Org", slug: "test-org", role: "owner" },
                ],
            };
            // Create valid JWT
            const token = signJwt({
                sub: userData.id,
                email: userData.email,
                exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
                iat: Math.floor(Date.now() / 1000),
            });
            // Make request
            const response = await axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(response.data).toMatchObject({
                email: userData.email,
                organizations: vitest_1.expect.arrayContaining([
                    vitest_1.expect.objectContaining({
                        id: "org_123",
                        name: "Test Org",
                        slug: "test-org",
                        role: "owner",
                    }),
                ]),
            });
        });
        (0, vitest_1.it)("should return 401 with expired JWT", async () => {
            // Create expired JWT
            const token = signJwt({
                sub: "user_123",
                email: "test@example.com",
                exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
                iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
            });
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
                (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
            }
        });
        (0, vitest_1.it)("should return 401 with invalid JWT format", async () => {
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: "Bearer invalid-token",
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
                (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
            }
        });
        (0, vitest_1.it)("should return 401 with missing Authorization header", async () => {
            try {
                await axios_1.default.get(`${baseURL}/auth/me`);
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
                (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
            }
        });
        (0, vitest_1.it)("should return 401 with wrong authorization scheme", async () => {
            const token = signJwt({
                sub: "user_123",
                email: "test@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: `Basic ${token}`, // Wrong scheme
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
                (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
            }
        });
        (0, vitest_1.it)("should return 403 with missing scope claim", async () => {
            // Create JWT without required scope
            const token = signJwt({
                sub: "user_123",
                email: "test@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
                scope: "read:profile", // Missing required scope
            });
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "X-Required-Scope": "admin:read", // Custom header to test scope validation
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(403);
                (0, vitest_1.expect)(error.response.data.error).toBe("Insufficient permissions");
            }
        });
        (0, vitest_1.it)("should handle JWT with custom claims", async () => {
            const token = signJwt({
                sub: "user_123",
                email: "test@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
                custom_claim: "custom_value",
                role: "admin",
            });
            const response = await axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(response.data.email).toBe("test@example.com");
        });
        (0, vitest_1.it)("should return user with multiple organizations", async () => {
            const token = signJwt({
                sub: "user_456",
                email: "multi-org@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            // Setup multiple organizations for user
            testServer.setUserOrganizations("user_456", [
                { id: "org_1", name: "Org One", slug: "org-one", role: "owner" },
                { id: "org_2", name: "Org Two", slug: "org-two", role: "member" },
                { id: "org_3", name: "Org Three", slug: "org-three", role: "admin" },
            ]);
            const response = await axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(response.data.organizations).toHaveLength(3);
            (0, vitest_1.expect)(response.data.organizations).toContainEqual(vitest_1.expect.objectContaining({ id: "org_1", role: "owner" }));
            (0, vitest_1.expect)(response.data.organizations).toContainEqual(vitest_1.expect.objectContaining({ id: "org_2", role: "member" }));
            (0, vitest_1.expect)(response.data.organizations).toContainEqual(vitest_1.expect.objectContaining({ id: "org_3", role: "admin" }));
        });
        (0, vitest_1.it)("should handle malformed JWT gracefully", async () => {
            const malformedTokens = [
                "Bearer",
                "Bearer ",
                "Bearer ..",
                "Bearer a.b",
                "Bearer a.b.c.d",
            ];
            for (const authHeader of malformedTokens) {
                try {
                    await axios_1.default.get(`${baseURL}/auth/me`, {
                        headers: {
                            Authorization: authHeader,
                        },
                    });
                    vitest_1.expect.fail(`Should have thrown an error for: ${authHeader}`);
                }
                catch (error) {
                    (0, vitest_1.expect)(error.response.status).toBe(401);
                    (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
                }
            }
        });
        (0, vitest_1.it)("should validate JWT signature", async () => {
            // Create JWT with wrong secret
            const token = jsonwebtoken_1.default.sign({
                sub: "user_123",
                email: "test@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
            }, "wrong-secret", { algorithm: "HS256" });
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
                (0, vitest_1.expect)(error.response.data.error).toBe("Unauthorized");
            }
        });
    });
    (0, vitest_1.describe)("Performance and edge cases", () => {
        (0, vitest_1.it)("should handle concurrent requests", async () => {
            const token = signJwt({
                sub: "user_789",
                email: "concurrent@example.com",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            // Make 10 concurrent requests
            const promises = Array(10)
                .fill(0)
                .map(() => axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }));
            const responses = await Promise.all(promises);
            // All should succeed
            responses.forEach((response) => {
                (0, vitest_1.expect)(response.status).toBe(200);
                (0, vitest_1.expect)(response.data.email).toBe("concurrent@example.com");
            });
        });
        (0, vitest_1.it)("should handle special characters in JWT claims", async () => {
            const token = signJwt({
                sub: "user_special",
                email: "test+special@example.com",
                name: "Test User 名前 🚀",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            const response = await axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(response.data.email).toBe("test+special@example.com");
        });
        (0, vitest_1.it)("should respect token expiration time precisely", async () => {
            // Token expires in 2 seconds
            const token = signJwt({
                sub: "user_exp",
                email: "expiry@example.com",
                exp: Math.floor(Date.now() / 1000) + 2,
            });
            // Should work immediately
            const response1 = await axios_1.default.get(`${baseURL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            (0, vitest_1.expect)(response1.status).toBe(200);
            // Wait for token to expire
            await new Promise((resolve) => setTimeout(resolve, 2100));
            // Should fail after expiration
            try {
                await axios_1.default.get(`${baseURL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                vitest_1.expect.fail("Should have thrown an error");
            }
            catch (error) {
                (0, vitest_1.expect)(error.response.status).toBe(401);
            }
        });
    });
});
//# sourceMappingURL=auth-me.test.js.map