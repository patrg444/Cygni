import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { getTenantIsolationService } from "../services/security/tenant-isolation.service";
import { createTenantPrismaClient, validateTenantOwnership } from "../lib/prisma-rls";
import { getTenantCacheService } from "../services/cache/tenant-cache.service";

// Mock Prisma client for testing
const prisma = new PrismaClient();
const tenantIsolationService = getTenantIsolationService(prisma);
const tenantCacheService = getTenantCacheService();

// Test data
const testTeams = [
  { id: "team1", name: "Team One" },
  { id: "team2", name: "Team Two" },
];

const testUsers = [
  { id: "user1", email: "user1@team1.com", teamId: "team1", role: "owner" },
  { id: "user2", email: "user2@team1.com", teamId: "team1", role: "member" },
  { id: "user3", email: "user3@team2.com", teamId: "team2", role: "owner" },
];

const testProjects = [
  { id: "proj1", name: "Project 1", teamId: "team1", slug: "project-1" },
  { id: "proj2", name: "Project 2", teamId: "team1", slug: "project-2" },
  { id: "proj3", name: "Project 3", teamId: "team2", slug: "project-3" },
];

describe("Tenant Isolation", () => {
  beforeAll(async () => {
    // Set up test data
    await prisma.$transaction(async (tx) => {
      // Create teams
      for (const team of testTeams) {
        await tx.team.create({ data: team });
      }

      // Create users
      for (const user of testUsers) {
        await tx.user.create({
          data: {
            ...user,
            password: "hashed_password",
          },
        });
      }

      // Create projects
      for (const project of testProjects) {
        await tx.project.create({ data: project });
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.$transaction(async (tx) => {
      await tx.project.deleteMany({});
      await tx.user.deleteMany({});
      await tx.team.deleteMany({});
    });

    await prisma.$disconnect();
    await tenantCacheService.close();
  });

  describe("Tenant Context Extraction", () => {
    it("should extract tenant context from authenticated request", () => {
      const req = {
        user: {
          userId: "user1",
          teamId: "team1",
          role: "owner",
        },
      };

      const context = tenantIsolationService.extractTenantContext(req as any);
      
      expect(context).toEqual({
        teamId: "team1",
        userId: "user1",
        role: "owner",
      });
    });

    it("should return null for unauthenticated request", () => {
      const req = {};
      const context = tenantIsolationService.extractTenantContext(req as any);
      expect(context).toBeNull();
    });
  });

  describe("Resource Access Validation", () => {
    it("should allow access to resources within same tenant", async () => {
      const context = { teamId: "team1", userId: "user1", role: "owner" };
      
      const hasAccess = await tenantIsolationService.validateResourceAccess(
        "project",
        "proj1",
        context
      );
      
      expect(hasAccess).toBe(true);
    });

    it("should deny access to resources from different tenant", async () => {
      const context = { teamId: "team1", userId: "user1", role: "owner" };
      
      const hasAccess = await tenantIsolationService.validateResourceAccess(
        "project",
        "proj3", // Belongs to team2
        context
      );
      
      expect(hasAccess).toBe(false);
    });

    it("should validate indirect tenant relationships", async () => {
      // Create a deployment for testing
      const deployment = await prisma.deployment.create({
        data: {
          id: "deploy1",
          status: "active",
          projectId: "proj1",
          environmentId: "env1",
        },
      });

      const context = { teamId: "team1", userId: "user1", role: "owner" };
      
      const hasAccess = await tenantIsolationService.validateResourceAccess(
        "deployment",
        deployment.id,
        context
      );
      
      expect(hasAccess).toBe(true);

      // Clean up
      await prisma.deployment.delete({ where: { id: deployment.id } });
    });
  });

  describe("Tenant-Scoped Queries", () => {
    it("should filter queries by tenant", async () => {
      const context = { teamId: "team1", userId: "user1", role: "owner" };
      const tenantPrisma = createTenantPrismaClient(prisma, context);

      const projects = await tenantPrisma.project.findMany();
      
      expect(projects).toHaveLength(2); // Only team1's projects
      expect(projects.every(p => p.teamId === "team1")).toBe(true);
    });

    it("should prevent access to other tenant's data", async () => {
      const context = { teamId: "team1", userId: "user1", role: "owner" };
      const tenantPrisma = createTenantPrismaClient(prisma, context);

      const project = await tenantPrisma.project.findUnique({
        where: { id: "proj3" }, // Belongs to team2
      });
      
      expect(project).toBeNull();
    });

    it("should apply tenant context to creates", async () => {
      const context = { teamId: "team1", userId: "user1", role: "owner" };
      const tenantPrisma = createTenantPrismaClient(prisma, context);

      const newProject = await tenantPrisma.project.create({
        data: {
          name: "Test Project",
          slug: "test-project",
        },
      });

      expect(newProject.teamId).toBe("team1");

      // Clean up
      await prisma.project.delete({ where: { id: newProject.id } });
    });
  });

  describe("Tenant Statistics", () => {
    it("should calculate tenant statistics correctly", async () => {
      const stats = await tenantIsolationService.getTenantStats("team1");

      expect(stats.users).toBe(2);
      expect(stats.projects).toBe(2);
      expect(stats.deployments).toBe(0);
      expect(stats.storageGB).toBe(0);
    });
  });

  describe("Cross-Tenant Reference Validation", () => {
    it("should validate cross-tenant references", async () => {
      const isValid = await tenantIsolationService.validateCrossTenantReference(
        "team1",
        "project",
        "proj1"
      );
      
      expect(isValid).toBe(true);

      const isInvalid = await tenantIsolationService.validateCrossTenantReference(
        "team1",
        "project",
        "proj3" // Belongs to team2
      );
      
      expect(isInvalid).toBe(false);
    });
  });

  describe("Tenant Data Export", () => {
    it("should export all tenant data", async () => {
      const exportData = await tenantIsolationService.exportTenantData("team1");

      expect(exportData.team?.id).toBe("team1");
      expect(exportData.users).toHaveLength(2);
      expect(exportData.projects).toHaveLength(2);
      expect(exportData.exportedAt).toBeInstanceOf(Date);
    });
  });

  describe("Tenant Cache", () => {
    beforeEach(async () => {
      // Clear cache before each test
      await tenantCacheService.clearTenant("team1");
      await tenantCacheService.clearTenant("team2");
    });

    it("should cache and retrieve tenant-specific data", async () => {
      const testData = { foo: "bar", count: 42 };
      
      await tenantCacheService.set("team1", "test-key", testData);
      const retrieved = await tenantCacheService.get("team1", "test-key");
      
      expect(retrieved).toEqual(testData);
    });

    it("should isolate cache between tenants", async () => {
      await tenantCacheService.set("team1", "shared-key", { value: "team1" });
      await tenantCacheService.set("team2", "shared-key", { value: "team2" });

      const team1Value = await tenantCacheService.get("team1", "shared-key");
      const team2Value = await tenantCacheService.get("team2", "shared-key");

      expect(team1Value).toEqual({ value: "team1" });
      expect(team2Value).toEqual({ value: "team2" });
    });

    it("should clear tenant cache without affecting other tenants", async () => {
      await tenantCacheService.set("team1", "key1", "value1");
      await tenantCacheService.set("team2", "key2", "value2");

      await tenantCacheService.clearTenant("team1");

      const team1Value = await tenantCacheService.get("team1", "key1");
      const team2Value = await tenantCacheService.get("team2", "key2");

      expect(team1Value).toBeNull();
      expect(team2Value).toEqual("value2");
    });

    it("should use cache-aside pattern correctly", async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return { computed: true, timestamp: Date.now() };
      };

      // First call should execute factory
      const result1 = await tenantCacheService.getOrSet(
        "team1",
        "computed-key",
        factory,
        { ttl: 60 }
      );

      // Second call should use cache
      const result2 = await tenantCacheService.getOrSet(
        "team1",
        "computed-key",
        factory,
        { ttl: 60 }
      );

      expect(factoryCalls).toBe(1);
      expect(result1).toEqual(result2);
    });

    it("should respect cache namespaces", async () => {
      await tenantCacheService.set("team1", "key", "value1", { namespace: "ns1" });
      await tenantCacheService.set("team1", "key", "value2", { namespace: "ns2" });

      const ns1Value = await tenantCacheService.get("team1", "key", { namespace: "ns1" });
      const ns2Value = await tenantCacheService.get("team1", "key", { namespace: "ns2" });

      expect(ns1Value).toBe("value1");
      expect(ns2Value).toBe("value2");
    });
  });

  describe("Row-Level Security", () => {
    it("should validate tenant ownership", () => {
      const validResult = { id: "123", teamId: "team1", name: "Test" };
      const invalidResult = { id: "456", teamId: "team2", name: "Test" };

      expect(validateTenantOwnership(validResult, "team1", "project")).toBe(true);
      expect(validateTenantOwnership(invalidResult, "team1", "project")).toBe(false);
    });

    it("should validate indirect tenant ownership", () => {
      const deployment = {
        id: "deploy1",
        project: { id: "proj1", teamId: "team1" },
      };

      expect(validateTenantOwnership(deployment, "team1", "deployment")).toBe(true);
      expect(validateTenantOwnership(deployment, "team2", "deployment")).toBe(false);
    });
  });

  describe("Tenant Limits", () => {
    it("should enforce tenant limits", async () => {
      // This would be tested with the middleware in an integration test
      const stats = await tenantIsolationService.getTenantStats("team1");
      
      // Example limit check
      const userLimit = 10;
      expect(stats.users).toBeLessThanOrEqual(userLimit);
    });
  });
});