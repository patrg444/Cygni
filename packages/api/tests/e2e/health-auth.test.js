"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = require("../../src/server");
const client_1 = require("@prisma/client");
describe("Health & Auth E2E Tests", () => {
    let app;
    let prisma;
    beforeAll(async () => {
        // Create test server
        app = (0, server_1.createServer)();
        prisma = new client_1.PrismaClient();
        // Clean database
        await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Team", "Waitlist" CASCADE');
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
    describe("Health Check", () => {
        it("GET /api/health returns 200", async () => {
            const response = await (0, supertest_1.default)(app).get("/api/health").expect(200);
            expect(response.body).toMatchObject({
                status: "healthy",
                timestamp: expect.any(String),
                version: expect.any(String),
            });
        });
        it("GET /api/health?deep=true checks dependencies", async () => {
            const response = await (0, supertest_1.default)(app)
                .get("/api/health?deep=true")
                .expect(200);
            expect(response.body).toMatchObject({
                status: "healthy",
                database: "connected",
                redis: expect.any(String),
                stripe: expect.any(String),
            });
        });
    });
    describe("Authentication Flow", () => {
        const testUser = {
            email: `test-${Date.now()}@example.com`,
            password: "SecureP@ssw0rd",
            name: "Test User",
            teamName: "Test Team",
        };
        let authToken;
        it("POST /api/auth/signup creates new user", async () => {
            const response = await (0, supertest_1.default)(app)
                .post("/api/auth/signup")
                .send(testUser)
                .expect(200);
            expect(response.body).toMatchObject({
                token: expect.any(String),
                user: {
                    id: expect.any(String),
                    email: testUser.email,
                    name: testUser.name,
                    role: "owner",
                },
                team: {
                    id: expect.any(String),
                    name: testUser.teamName,
                },
            });
            authToken = response.body.token;
        });
        it("POST /api/auth/signup rejects duplicate email", async () => {
            await (0, supertest_1.default)(app).post("/api/auth/signup").send(testUser).expect(400);
        });
        it("POST /api/auth/login with valid credentials", async () => {
            const response = await (0, supertest_1.default)(app)
                .post("/api/auth/login")
                .send({
                email: testUser.email,
                password: testUser.password,
            })
                .expect(200);
            expect(response.body).toMatchObject({
                token: expect.any(String),
                user: {
                    email: testUser.email,
                },
            });
        });
        it("POST /api/auth/login rejects invalid password", async () => {
            await (0, supertest_1.default)(app)
                .post("/api/auth/login")
                .send({
                email: testUser.email,
                password: "wrong-password",
            })
                .expect(401);
        });
        it("GET /api/auth/me returns current user", async () => {
            const response = await (0, supertest_1.default)(app)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${authToken}`)
                .expect(200);
            expect(response.body.user.email).toBe(testUser.email);
        });
        it("GET /api/auth/me rejects without token", async () => {
            await (0, supertest_1.default)(app).get("/api/auth/me").expect(401);
        });
    });
    describe("JWKS Endpoint", () => {
        it("GET /api/auth/.well-known/jwks.json returns keys", async () => {
            const response = await (0, supertest_1.default)(app)
                .get("/api/auth/.well-known/jwks.json")
                .expect(200);
            expect(response.body).toMatchObject({
                keys: expect.arrayContaining([
                    expect.objectContaining({
                        kid: expect.any(String),
                        kty: "RSA",
                        use: "sig",
                        alg: "RS256",
                        n: expect.any(String),
                        e: expect.any(String),
                    }),
                ]),
            });
        });
    });
});
//# sourceMappingURL=health-auth.test.js.map