"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const server_1 = require("../../src/server");
const client_1 = require("@prisma/client");
describe("Waitlist E2E Tests", () => {
    let app;
    let prisma;
    beforeAll(async () => {
        app = (0, server_1.createServer)();
        prisma = new client_1.PrismaClient();
        // Clean waitlist table
        await prisma.$executeRawUnsafe('TRUNCATE TABLE "Waitlist" CASCADE');
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
    describe("Waitlist Signup", () => {
        it("POST /api/waitlist adds new email", async () => {
            const email = `test-${Date.now()}@example.com`;
            const response = await (0, supertest_1.default)(app)
                .post("/api/waitlist")
                .send({ email })
                .expect(200);
            expect(response.body).toMatchObject({
                success: true,
                position: 1,
                message: "You're #1 on the waitlist!",
            });
        });
        it("POST /api/waitlist handles duplicate gracefully", async () => {
            const email = `duplicate-${Date.now()}@example.com`;
            // First signup
            await (0, supertest_1.default)(app).post("/api/waitlist").send({ email }).expect(200);
            // Duplicate signup
            const response = await (0, supertest_1.default)(app)
                .post("/api/waitlist")
                .send({ email })
                .expect(200);
            expect(response.body).toMatchObject({
                success: true,
                message: "Already on waitlist",
                position: expect.any(Number),
            });
        });
        it("POST /api/waitlist validates email format", async () => {
            await (0, supertest_1.default)(app)
                .post("/api/waitlist")
                .send({ email: "invalid-email" })
                .expect(400);
        });
        it("POST /api/waitlist tracks source", async () => {
            const response = await (0, supertest_1.default)(app)
                .post("/api/waitlist")
                .send({
                email: `source-test-${Date.now()}@example.com`,
                source: "twitter",
                referrer: "influencer123",
            })
                .expect(200);
            expect(response.body.success).toBe(true);
        });
    });
    describe("Waitlist Stats (Admin)", () => {
        it("GET /api/waitlist/stats requires auth", async () => {
            await (0, supertest_1.default)(app).get("/api/waitlist/stats").expect(401);
        });
        it("GET /api/waitlist/stats returns stats with admin key", async () => {
            // Set admin key for test
            process.env.ADMIN_API_KEY = "test-admin-key";
            const response = await (0, supertest_1.default)(app)
                .get("/api/waitlist/stats")
                .set("Authorization", "Bearer test-admin-key")
                .expect(200);
            expect(response.body).toMatchObject({
                total: expect.any(Number),
                today: expect.any(Number),
                bySources: expect.any(Array),
                recentSignups: expect.any(Array),
                averagePerDay: expect.any(Number),
            });
        });
    });
});
//# sourceMappingURL=waitlist.test.js.map