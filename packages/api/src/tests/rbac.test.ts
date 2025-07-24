import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { getPermissionService } from "../services/auth/permission.service";
import { getRoleService } from "../services/auth/role.service";
import { getResourcePermissionService } from "../services/auth/resource-permission.service";

const prisma = new PrismaClient();
const permissionService = getPermissionService(prisma);
const roleService = getRoleService(prisma);
const resourcePermissionService = getResourcePermissionService(prisma);

// Test data
const testTeam = { id: "test-team", name: "Test Team" };
const testUsers = [
  { id: "owner-user", email: "owner@test.com", teamId: "test-team", role: "owner" },
  { id: "admin-user", email: "admin@test.com", teamId: "test-team", role: "admin" },
  { id: "member-user", email: "member@test.com", teamId: "test-team", role: "member" },
  { id: "viewer-user", email: "viewer@test.com", teamId: "test-team", role: "member" },
];

describe("RBAC System", () => {
  beforeAll(async () => {
    // Initialize default permissions
    await permissionService.initializeDefaultPermissions();

    // Create test team
    await prisma.team.create({ data: testTeam });

    // Create test users
    for (const user of testUsers) {
      await prisma.user.create({
        data: {
          ...user,
          password: "hashed_password",
        },
      });
    }

    // Create default roles for team
    await roleService.createDefaultRoles(testTeam.id);
  });

  afterAll(async () => {
    // Clean up in reverse order
    await prisma.userPermission.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.resourcePolicy.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.permission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.team.deleteMany({});
    
    await prisma.$disconnect();
  });

  describe("Permission Service", () => {
    it("should check legacy role permissions correctly", async () => {
      // Owner has all permissions
      const ownerContext = {
        userId: "owner-user",
        teamId: testTeam.id,
        role: "owner",
      };

      const ownerCanCreate = await permissionService.hasPermission(ownerContext, {
        resource: "projects",
        action: "create",
      });
      expect(ownerCanCreate).toBe(true);

      // Member has limited permissions
      const memberContext = {
        userId: "member-user",
        teamId: testTeam.id,
        role: "member",
      };

      const memberCanCreate = await permissionService.hasPermission(memberContext, {
        resource: "projects",
        action: "create",
      });
      expect(memberCanCreate).toBe(true);

      const memberCanDelete = await permissionService.hasPermission(memberContext, {
        resource: "projects",
        action: "delete",
      });
      expect(memberCanDelete).toBe(false);
    });

    it("should grant and check RBAC permissions", async () => {
      // Create a custom role
      const customRole = await roleService.createRole(testTeam.id, {
        name: "custom-role",
        description: "Test custom role",
        permissions: ["projects.read", "deployments.create"],
      });

      // Grant role to user
      await permissionService.grantRole(
        "viewer-user",
        customRole!.id,
        "owner-user"
      );

      // Check permissions
      const viewerContext = {
        userId: "viewer-user",
        teamId: testTeam.id,
        role: "member",
      };

      const canReadProjects = await permissionService.hasPermission(viewerContext, {
        resource: "projects",
        action: "read",
      });
      expect(canReadProjects).toBe(true);

      const canCreateDeployments = await permissionService.hasPermission(viewerContext, {
        resource: "deployments",
        action: "create",
      });
      expect(canCreateDeployments).toBe(true);

      const canDeleteProjects = await permissionService.hasPermission(viewerContext, {
        resource: "projects",
        action: "delete",
      });
      expect(canDeleteProjects).toBe(false);
    });

    it("should handle temporary permissions", async () => {
      const permission = await prisma.permission.findFirst({
        where: { name: "billing.update" },
      });

      if (!permission) {
        throw new Error("Permission not found");
      }

      // Grant temporary permission
      await permissionService.grantPermission(
        "member-user",
        permission.id,
        "owner-user",
        new Date(Date.now() + 60000) // 1 minute
      );

      const memberContext = {
        userId: "member-user",
        teamId: testTeam.id,
        role: "member",
      };

      const hasPermission = await permissionService.hasPermission(memberContext, {
        resource: "billing",
        action: "update",
      });
      expect(hasPermission).toBe(true);
    });

    it("should get all user permissions", async () => {
      const permissions = await permissionService.getUserPermissions("owner-user");
      
      // Owner should have permissions through legacy role system
      expect(permissions.length).toBeGreaterThan(0);
    });
  });

  describe("Role Service", () => {
    it("should create and manage roles", async () => {
      const role = await roleService.createRole(testTeam.id, {
        name: "test-role",
        description: "Test role",
        permissions: ["projects.read", "projects.update"],
      });

      expect(role).toBeDefined();
      expect(role!.name).toBe("test-role");
      expect(role!.permissions).toHaveLength(2);
    });

    it("should not allow duplicate role names", async () => {
      await expect(
        roleService.createRole(testTeam.id, {
          name: "test-role", // Already exists
          permissions: [],
        })
      ).rejects.toThrow("already exists");
    });

    it("should update roles", async () => {
      const role = await prisma.role.findFirst({
        where: { teamId: testTeam.id, name: "test-role" },
      });

      const updated = await roleService.updateRole(role!.id, testTeam.id, {
        description: "Updated description",
        permissions: ["projects.read"], // Remove one permission
      });

      expect(updated!.description).toBe("Updated description");
      expect(updated!.permissions).toHaveLength(1);
    });

    it("should not modify system roles", async () => {
      const systemRole = await prisma.role.findFirst({
        where: { teamId: testTeam.id, isSystem: true },
      });

      await expect(
        roleService.updateRole(systemRole!.id, testTeam.id, {
          name: "modified-name",
        })
      ).rejects.toThrow("System roles cannot be modified");
    });

    it("should get team roles", async () => {
      const roles = await roleService.getTeamRoles(testTeam.id);
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(r => r.isSystem)).toBe(true);
      expect(roles.some(r => r.name === "test-role")).toBe(true);
    });

    it("should clone roles", async () => {
      const sourceRole = await prisma.role.findFirst({
        where: { teamId: testTeam.id, name: "developer" },
      });

      const cloned = await roleService.cloneRole(
        sourceRole!.id,
        testTeam.id,
        "developer-clone"
      );

      expect(cloned!.name).toBe("developer-clone");
      expect(cloned!.permissions.length).toBeGreaterThan(0);
    });
  });

  describe("Resource Permissions", () => {
    const testProject = { 
      id: "test-project", 
      teamId: testTeam.id, 
      name: "Test Project",
      slug: "test-project",
    };

    beforeEach(async () => {
      // Create test project
      await prisma.project.create({ data: testProject });
    });

    afterEach(async () => {
      // Clean up
      await prisma.project.deleteMany({});
    });

    it("should set and check resource permissions", async () => {
      // Set resource permissions
      await resourcePermissionService.setResourcePermissions(
        testTeam.id,
        "project",
        testProject.id,
        {
          read: ["role:viewer", "user:member-user"],
          write: ["role:developer"],
          admin: ["user:admin-user"],
        }
      );

      // Check viewer role access
      const viewerCheck = {
        userId: "viewer-user",
        teamId: testTeam.id,
        role: "member",
        resourceType: "project",
        resourceId: testProject.id,
        action: "read",
      };

      // Need to grant viewer role first
      const viewerRole = await prisma.role.findFirst({
        where: { teamId: testTeam.id, name: "viewer" },
      });
      
      await permissionService.grantRole("viewer-user", viewerRole!.id, "owner-user");

      const viewerCanRead = await resourcePermissionService.checkResourceAccess(viewerCheck);
      expect(viewerCanRead).toBe(true);

      // Check specific user access
      const memberCheck = {
        userId: "member-user",
        teamId: testTeam.id,
        role: "member",
        resourceType: "project",
        resourceId: testProject.id,
        action: "read",
      };

      const memberCanRead = await resourcePermissionService.checkResourceAccess(memberCheck);
      expect(memberCanRead).toBe(true);

      // Check no access
      const memberWriteCheck = {
        ...memberCheck,
        action: "write",
      };

      const memberCanWrite = await resourcePermissionService.checkResourceAccess(memberWriteCheck);
      expect(memberCanWrite).toBe(false);
    });

    it("should share resources", async () => {
      await resourcePermissionService.shareResource(
        testTeam.id,
        "project",
        testProject.id,
        {
          users: ["member-user"],
          roles: ["viewer"],
        },
        ["read", "write"]
      );

      const policy = await resourcePermissionService.getResourcePolicy(
        testTeam.id,
        "project",
        testProject.id
      );

      expect(policy!.read).toContain("user:member-user");
      expect(policy!.read).toContain("role:viewer");
      expect(policy!.write).toContain("user:member-user");
      expect(policy!.write).toContain("role:viewer");
    });

    it("should revoke resource access", async () => {
      // First share
      await resourcePermissionService.shareResource(
        testTeam.id,
        "project",
        testProject.id,
        { users: ["member-user", "admin-user"] },
        ["read"]
      );

      // Then revoke
      await resourcePermissionService.revokeResourceAccess(
        testTeam.id,
        "project",
        testProject.id,
        { users: ["member-user"] }
      );

      const policy = await resourcePermissionService.getResourcePolicy(
        testTeam.id,
        "project",
        testProject.id
      );

      expect(policy!.read).toContain("user:admin-user");
      expect(policy!.read).not.toContain("user:member-user");
    });

    it("should get user shared resources", async () => {
      // Share multiple resources
      await resourcePermissionService.shareResource(
        testTeam.id,
        "project",
        testProject.id,
        { users: ["member-user"] },
        ["read", "write"]
      );

      const sharedResources = await resourcePermissionService.getUserSharedResources(
        "member-user",
        testTeam.id
      );

      expect(sharedResources).toHaveLength(1);
      expect(sharedResources[0].resourceType).toBe("project");
      expect(sharedResources[0].resourceId).toBe(testProject.id);
      expect(sharedResources[0].permissions).toContain("read");
      expect(sharedResources[0].permissions).toContain("write");
    });

    it("should get resource access list", async () => {
      await resourcePermissionService.shareResource(
        testTeam.id,
        "project",
        testProject.id,
        {
          users: ["member-user", "admin-user"],
          roles: ["viewer", "developer"],
        },
        ["read"]
      );

      const accessList = await resourcePermissionService.getResourceAccessList(
        testTeam.id,
        "project",
        testProject.id
      );

      expect(accessList.users).toHaveLength(2);
      expect(accessList.roles).toHaveLength(2);
      expect(accessList.users[0].permissions).toContain("read");
    });

    it("should clone resource permissions", async () => {
      await resourcePermissionService.setResourcePermissions(
        testTeam.id,
        "project",
        testProject.id,
        {
          read: ["role:viewer"],
          write: ["role:developer"],
        }
      );

      const newProject = {
        id: "new-project",
        teamId: testTeam.id,
        name: "New Project",
        slug: "new-project",
      };
      await prisma.project.create({ data: newProject });

      await resourcePermissionService.cloneResourcePermissions(
        testTeam.id,
        "project",
        testProject.id,
        "project",
        newProject.id
      );

      const clonedPolicy = await resourcePermissionService.getResourcePolicy(
        testTeam.id,
        "project",
        newProject.id
      );

      expect(clonedPolicy!.read).toContain("role:viewer");
      expect(clonedPolicy!.write).toContain("role:developer");
    });
  });

  describe("Permission Caching", () => {
    it("should cache permission checks", async () => {
      const context = {
        userId: "member-user",
        teamId: testTeam.id,
        role: "member",
      };

      // First check - cache miss
      const start1 = Date.now();
      await permissionService.hasPermission(context, {
        resource: "projects",
        action: "read",
      });
      const time1 = Date.now() - start1;

      // Second check - cache hit (should be faster)
      const start2 = Date.now();
      await permissionService.hasPermission(context, {
        resource: "projects",
        action: "read",
      });
      const time2 = Date.now() - start2;

      // Cache hit should be significantly faster
      expect(time2).toBeLessThan(time1);
    });
  });

  describe("Legacy Role Migration", () => {
    it("should migrate legacy roles to RBAC", async () => {
      const results = await roleService.migrateLegacyRoles(testTeam.id);
      
      expect(results.migrated).toBeGreaterThanOrEqual(0);
      expect(results.failed).toBe(0);
    });
  });
});