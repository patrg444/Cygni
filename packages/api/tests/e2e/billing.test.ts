import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { createServer } from "../../src/server";
import { PrismaClient } from "@prisma/client";
import { JWTRotationService } from "../../src/services/auth/jwt-rotation.service";

const app = createServer();
const prisma = new PrismaClient();
const jwtService = new JWTRotationService(prisma);

let authToken: string;
let teamId: string;
let userId: string;

describe("Billing API", () => {
  beforeAll(async () => {
    // Create test user and team
    const team = await prisma.team.create({
      data: {
        name: "Test Team",
        users: {
          create: {
            email: "billing@test.com",
            password: "hashedpassword",
            name: "Test User",
            role: "owner",
          },
        },
      },
      include: { users: true },
    });

    teamId = team.id;
    userId = team.users[0].id;

    // Generate auth token
    authToken = jwtService.signToken({
      userId,
      teamId,
      email: "billing@test.com",
      role: "owner",
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({ where: { email: "billing@test.com" } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.$disconnect();
  });

  describe("GET /api/billing/subscription", () => {
    it("should return subscription details", async () => {
      const response = await request(app)
        .get("/api/billing/subscription")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("subscription");
      expect(response.body).toHaveProperty("invoices");
      expect(response.body.invoices).toBeInstanceOf(Array);
    });

    it("should require authentication", async () => {
      await request(app).get("/api/billing/subscription").expect(401);
    });
  });

  describe("POST /api/billing/subscription", () => {
    it("should create a subscription", async () => {
      const response = await request(app)
        .post("/api/billing/subscription")
        .set("Authorization", `Bearer ${authToken}`)
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty("subscriptionId");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("trialEnd");
    });
  });

  describe("GET /api/billing/usage", () => {
    it("should return usage summary", async () => {
      // Create test project
      const project = await prisma.project.create({
        data: {
          name: "Test Project",
          slug: "test-project",
          teamId,
        },
      });

      // Create test usage events
      await prisma.usageEvent.createMany({
        data: [
          {
            projectId: project.id,
            metricType: "cpu_seconds",
            quantity: 3600,
          },
          {
            projectId: project.id,
            metricType: "storage_gb_hours",
            quantity: 100,
          },
        ],
      });

      const response = await request(app)
        .get("/api/billing/usage")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("period");
      expect(response.body).toHaveProperty("usage");
      expect(response.body).toHaveProperty("totalCost");
      expect(response.body.usage).toBeInstanceOf(Array);
      expect(response.body.usage.length).toBeGreaterThan(0);

      // Cleanup
      await prisma.usageEvent.deleteMany({
        where: { projectId: project.id },
      });
      await prisma.project.delete({ where: { id: project.id } });
    });
  });

  describe("POST /api/billing/usage", () => {
    it("should report usage", async () => {
      // Create test project
      const project = await prisma.project.create({
        data: {
          name: "Test Project 2",
          slug: "test-project-2",
          teamId,
        },
      });

      const response = await request(app)
        .post("/api/billing/usage")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          metricType: "compute",
          quantity: 100,
        })
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("success");
      expect(response.body.success).toBe(true);

      // Verify usage was recorded
      const usage = await prisma.usageEvent.findFirst({
        where: { projectId: project.id },
      });
      expect(usage).toBeTruthy();
      expect(usage?.quantity.toNumber()).toBe(100);

      // Cleanup
      await prisma.usageEvent.deleteMany({
        where: { projectId: project.id },
      });
      await prisma.project.delete({ where: { id: project.id } });
    });

    it("should reject usage for other teams projects", async () => {
      // Create another team's project
      const otherTeam = await prisma.team.create({
        data: { name: "Other Team" },
      });

      const otherProject = await prisma.project.create({
        data: {
          name: "Other Project",
          slug: "other-project",
          teamId: otherTeam.id,
        },
      });

      await request(app)
        .post("/api/billing/usage")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          projectId: otherProject.id,
          metricType: "compute",
          quantity: 100,
        })
        .expect(403);

      // Cleanup
      await prisma.project.delete({ where: { id: otherProject.id } });
      await prisma.team.delete({ where: { id: otherTeam.id } });
    });
  });

  describe("GET /api/billing/invoices", () => {
    it("should return invoice list", async () => {
      // Create test invoice
      await prisma.invoice.create({
        data: {
          teamId,
          stripeInvoiceId: "in_test_123",
          amount: 50.0,
          currency: "usd",
          status: "paid",
          periodStart: new Date("2024-01-01"),
          periodEnd: new Date("2024-01-31"),
          paidAt: new Date("2024-02-01"),
        },
      });

      const response = await request(app)
        .get("/api/billing/invoices")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("invoices");
      expect(response.body.invoices).toBeInstanceOf(Array);
      expect(response.body.invoices.length).toBeGreaterThan(0);
      expect(response.body.invoices[0]).toHaveProperty("downloadUrl");

      // Cleanup
      await prisma.invoice.deleteMany({ where: { teamId } });
    });
  });

  describe("POST /api/billing/portal", () => {
    it("should create portal session", async () => {
      // First need to set Stripe customer ID
      await prisma.team.update({
        where: { id: teamId },
        data: { stripeCustomerId: "cus_test_123" },
      });

      const response = await request(app)
        .post("/api/billing/portal")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("url");
      expect(response.body.url).toContain("stripe.com");
    });
  });

  describe("POST /api/webhooks/stripe", () => {
    it("should handle webhook events", async () => {
      const mockPayload = JSON.stringify({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_webhook",
            subscription: "sub_test_123",
          },
        },
      });

      // Note: In real tests, you'd need to generate a valid signature
      const response = await request(app)
        .post("/api/webhooks/stripe")
        .set("stripe-signature", "test_signature")
        .set("Content-Type", "application/json")
        .send(mockPayload)
        .expect(400); // Will fail without valid signature

      expect(response.body).toHaveProperty("error");
    });
  });
});