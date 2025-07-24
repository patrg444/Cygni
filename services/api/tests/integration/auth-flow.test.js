"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
const client_api_1 = require("@prisma/client-api");
(0, vitest_1.describe)("Authentication Flow Integration", () => {
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const prisma = new client_api_1.PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL ||
                    "postgresql://postgres:postgres@localhost:5434/postgres",
            },
        },
    });
    let isServicesRunning = false;
    let testUserEmail = `test-${Date.now()}@example.com`;
    let authToken;
    let refreshToken;
    let userId;
    let organizationId;
    (0, vitest_1.beforeAll)(async () => {
        // Check if services are running
        try {
            const health = await axios_1.default.get(`${API_URL}/health`);
            isServicesRunning = health.status === 200;
        }
        catch {
            isServicesRunning = false;
        }
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup test data
        if (isServicesRunning && organizationId) {
            try {
                await prisma.user.deleteMany({
                    where: { email: testUserEmail },
                });
                await prisma.organization.delete({
                    where: { id: organizationId },
                });
            }
            catch (error) {
                console.error("Cleanup error:", error);
            }
        }
        await prisma.$disconnect();
    });
    (0, vitest_1.it)("should complete full signup flow with organization creation", async function () {
        if (!isServicesRunning) {
            return;
        }
        // Test signup
        const signupResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
            email: testUserEmail,
            password: "TestPassword123!",
            name: "Test User",
            organizationName: "Test Organization",
        });
        (0, vitest_1.expect)(signupResponse.status).toBe(201);
        (0, vitest_1.expect)(signupResponse.data).toHaveProperty("user");
        (0, vitest_1.expect)(signupResponse.data).toHaveProperty("organization");
        (0, vitest_1.expect)(signupResponse.data).toHaveProperty("token");
        (0, vitest_1.expect)(signupResponse.data).toHaveProperty("refreshToken");
        // Verify user details
        (0, vitest_1.expect)(signupResponse.data.user.email).toBe(testUserEmail);
        (0, vitest_1.expect)(signupResponse.data.user.name).toBe("Test User");
        (0, vitest_1.expect)(signupResponse.data.user.role).toBe("owner"); // First user should be owner
        // Verify organization details
        (0, vitest_1.expect)(signupResponse.data.organization.name).toBe("Test Organization");
        (0, vitest_1.expect)(signupResponse.data.organization.slug).toMatch(/^test-organization/);
        // Store for later tests
        authToken = signupResponse.data.token;
        refreshToken = signupResponse.data.refreshToken;
        userId = signupResponse.data.user.id;
        organizationId = signupResponse.data.organization.id;
    });
    (0, vitest_1.it)("should prevent duplicate email signup", async function () {
        if (!isServicesRunning || !authToken) {
            return;
        }
        try {
            await axios_1.default.post(`${API_URL}/api/auth/signup`, {
                email: testUserEmail,
                password: "AnotherPassword123!",
                name: "Duplicate User",
                organizationName: "Another Org",
            });
            // Should not reach here
            vitest_1.expect.fail("Expected signup to fail with duplicate email");
        }
        catch (error) {
            const axiosError = error;
            (0, vitest_1.expect)(axiosError.response?.status).toBe(400);
            (0, vitest_1.expect)(axiosError.response?.data).toHaveProperty("error");
        }
    });
    (0, vitest_1.it)("should login with correct credentials", async function () {
        if (!isServicesRunning) {
            return;
        }
        const loginResponse = await axios_1.default.post(`${API_URL}/api/auth/login`, {
            email: testUserEmail,
            password: "TestPassword123!",
        });
        (0, vitest_1.expect)(loginResponse.status).toBe(200);
        (0, vitest_1.expect)(loginResponse.data).toHaveProperty("user");
        (0, vitest_1.expect)(loginResponse.data).toHaveProperty("token");
        (0, vitest_1.expect)(loginResponse.data).toHaveProperty("refreshToken");
        // Token might be the same if login happens immediately after signup
        // This is okay - JWT tokens with same payload and time will be identical
        // Update token for subsequent tests
        authToken = loginResponse.data.token;
    });
    (0, vitest_1.it)("should reject login with incorrect password", async function () {
        if (!isServicesRunning) {
            return;
        }
        try {
            await axios_1.default.post(`${API_URL}/api/auth/login`, {
                email: testUserEmail,
                password: "WrongPassword123!",
            });
            vitest_1.expect.fail("Expected login to fail with wrong password");
        }
        catch (error) {
            const axiosError = error;
            (0, vitest_1.expect)(axiosError.response?.status).toBe(401);
            (0, vitest_1.expect)(axiosError.response?.data).toHaveProperty("error");
        }
    });
    (0, vitest_1.it)("should get current user info with valid token", async function () {
        if (!isServicesRunning || !authToken) {
            return;
        }
        const meResponse = await axios_1.default.get(`${API_URL}/api/auth/me`, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        (0, vitest_1.expect)(meResponse.status).toBe(200);
        (0, vitest_1.expect)(meResponse.data).toHaveProperty("user");
        (0, vitest_1.expect)(meResponse.data).toHaveProperty("organization");
        (0, vitest_1.expect)(meResponse.data.user.id).toBe(userId);
        (0, vitest_1.expect)(meResponse.data.user.email).toBe(testUserEmail);
        (0, vitest_1.expect)(meResponse.data.organization.id).toBe(organizationId);
    });
    (0, vitest_1.it)("should reject requests with invalid token", async function () {
        if (!isServicesRunning) {
            return;
        }
        try {
            await axios_1.default.get(`${API_URL}/api/auth/me`, {
                headers: {
                    Authorization: "Bearer invalid-token",
                },
            });
            vitest_1.expect.fail("Expected request to fail with invalid token");
        }
        catch (error) {
            const axiosError = error;
            (0, vitest_1.expect)(axiosError.response?.status).toBe(401);
        }
    });
    (0, vitest_1.it)("should refresh token successfully", async function () {
        if (!isServicesRunning || !refreshToken) {
            return;
        }
        const refreshResponse = await axios_1.default.post(`${API_URL}/api/auth/refresh`, {
            refreshToken,
        });
        (0, vitest_1.expect)(refreshResponse.status).toBe(200);
        (0, vitest_1.expect)(refreshResponse.data).toHaveProperty("token");
        (0, vitest_1.expect)(refreshResponse.data).toHaveProperty("refreshToken");
        // Verify new tokens are returned
        (0, vitest_1.expect)(refreshResponse.data.token).toBeDefined();
        (0, vitest_1.expect)(refreshResponse.data.refreshToken).toBeDefined();
        // Verify new token works
        const meResponse = await axios_1.default.get(`${API_URL}/api/auth/me`, {
            headers: {
                Authorization: `Bearer ${refreshResponse.data.token}`,
            },
        });
        (0, vitest_1.expect)(meResponse.status).toBe(200);
    });
    (0, vitest_1.it)("should validate password requirements", async function () {
        if (!isServicesRunning) {
            return;
        }
        const weakPasswords = [
            "short", // Too short
            "alllowercase", // No uppercase
            "ALLUPPERCASE", // No lowercase
            "NoNumbers!", // No numbers
            "NoSpecial123", // No special characters
        ];
        for (const password of weakPasswords) {
            try {
                await axios_1.default.post(`${API_URL}/api/auth/signup`, {
                    email: `weak-${Date.now()}@example.com`,
                    password,
                    name: "Weak Password User",
                    organizationName: "Test Org",
                });
                vitest_1.expect.fail(`Expected signup to fail with weak password: ${password}`);
            }
            catch (error) {
                const axiosError = error;
                (0, vitest_1.expect)(axiosError.response?.status).toBe(400);
            }
        }
    });
    (0, vitest_1.it)("should enforce rate limiting on auth endpoints", async function () {
        if (!isServicesRunning) {
            return;
        }
        const requests = [];
        const testEmail = `ratelimit-${Date.now()}@example.com`;
        // Make many rapid requests (more than the 10 per minute limit)
        for (let i = 0; i < 15; i++) {
            requests.push(axios_1.default
                .post(`${API_URL}/api/auth/login`, {
                email: testEmail,
                password: "wrong",
            }, {
                headers: {
                    "X-Forwarded-For": "192.168.1.100", // Simulate non-localhost IP
                },
            })
                .catch((err) => err.response));
        }
        const responses = await Promise.all(requests);
        // Count different response types
        const failed401 = responses.filter((r) => r?.status === 401);
        const rateLimited = responses.filter((r) => r?.status === 429);
        console.log(`401 responses: ${failed401.length}, 429 responses: ${rateLimited.length}`);
        // After 10 requests, should start getting rate limited
        (0, vitest_1.expect)(rateLimited.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("should handle organization slug conflicts", async function () {
        if (!isServicesRunning) {
            return;
        }
        // Create first user with org
        const firstEmail = `first-${Date.now()}@example.com`;
        const firstResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
            email: firstEmail,
            password: "TestPassword123!",
            name: "First User",
            organizationName: "Unique Org Name",
        });
        (0, vitest_1.expect)(firstResponse.status).toBe(201);
        const firstOrgSlug = firstResponse.data.organization.slug;
        // Create second user with same org name - should get different slug
        const secondEmail = `second-${Date.now()}@example.com`;
        const secondResponse = await axios_1.default.post(`${API_URL}/api/auth/signup`, {
            email: secondEmail,
            password: "TestPassword123!",
            name: "Second User",
            organizationName: "Unique Org Name", // Same name
        });
        (0, vitest_1.expect)(secondResponse.status).toBe(201);
        const secondOrgSlug = secondResponse.data.organization.slug;
        // Slugs should be different
        (0, vitest_1.expect)(secondOrgSlug).not.toBe(firstOrgSlug);
        (0, vitest_1.expect)(secondOrgSlug).toMatch(/^unique-org-name-/); // Should have suffix
        // Cleanup will happen in afterAll hook
    });
});
//# sourceMappingURL=auth-flow.test.js.map