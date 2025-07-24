import { PrismaClient } from "@prisma/client";
import { getTenantCacheService } from "../cache/tenant-cache.service";
import logger from "../../lib/logger";

export interface PermissionCheck {
  resource: string;
  action: string;
  resourceId?: string;
}

export interface UserPermissionContext {
  userId: string;
  teamId: string;
  role: string; // Legacy role for backward compatibility
}

export class PermissionService {
  private prisma: PrismaClient;
  private cache = getTenantCacheService();
  private permissionCacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Check if user has permission
  async hasPermission(
    context: UserPermissionContext,
    check: PermissionCheck
  ): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `permissions:${context.userId}:${check.resource}.${check.action}`;
      const cached = await this.cache.get<boolean>(context.teamId, cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Check legacy role-based permissions first (backward compatibility)
      const legacyAllowed = this.checkLegacyRolePermission(
        context.role,
        check.resource,
        check.action
      );
      
      if (legacyAllowed) {
        await this.cache.set(context.teamId, cacheKey, true, {
          ttl: this.permissionCacheTTL,
        });
        return true;
      }

      // Check RBAC permissions
      const hasRbacPermission = await this.checkRbacPermission(
        context.userId,
        check.resource,
        check.action
      );

      // If checking specific resource, also check resource policies
      if (check.resourceId && hasRbacPermission) {
        const hasResourcePermission = await this.checkResourcePolicy(
          context,
          check.resource,
          check.resourceId,
          check.action
        );
        
        const result = hasRbacPermission && hasResourcePermission;
        await this.cache.set(context.teamId, cacheKey, result, {
          ttl: this.permissionCacheTTL,
        });
        return result;
      }

      await this.cache.set(context.teamId, cacheKey, hasRbacPermission, {
        ttl: this.permissionCacheTTL,
      });
      return hasRbacPermission;
    } catch (error) {
      logger.error("Permission check failed", { error, context, check });
      return false; // Fail closed
    }
  }

  // Check multiple permissions at once
  async hasPermissions(
    context: UserPermissionContext,
    checks: PermissionCheck[]
  ): Promise<boolean> {
    const results = await Promise.all(
      checks.map(check => this.hasPermission(context, check))
    );
    return results.every(result => result);
  }

  // Check any of the permissions
  async hasAnyPermission(
    context: UserPermissionContext,
    checks: PermissionCheck[]
  ): Promise<boolean> {
    const results = await Promise.all(
      checks.map(check => this.hasPermission(context, check))
    );
    return results.some(result => result);
  }

  // Get all permissions for a user
  async getUserPermissions(userId: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Get permissions from roles
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.name);
      }
    }

    // Get direct user permissions
    const userPermissions = await this.prisma.userPermission.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        permission: true,
      },
    });

    for (const userPermission of userPermissions) {
      permissions.add(userPermission.permission.name);
    }

    return Array.from(permissions);
  }

  // Grant role to user
  async grantRole(
    userId: string,
    roleId: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    await this.prisma.userRole.create({
      data: {
        userId,
        roleId,
        grantedBy,
        expiresAt,
      },
    });

    // Clear permission cache
    await this.clearUserPermissionCache(userId);

    logger.info("Role granted", { userId, roleId, grantedBy, expiresAt });
  }

  // Revoke role from user
  async revokeRole(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });

    // Clear permission cache
    await this.clearUserPermissionCache(userId);

    logger.info("Role revoked", { userId, roleId });
  }

  // Grant permission directly to user
  async grantPermission(
    userId: string,
    permissionId: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    await this.prisma.userPermission.create({
      data: {
        userId,
        permissionId,
        grantedBy,
        expiresAt,
      },
    });

    // Clear permission cache
    await this.clearUserPermissionCache(userId);

    logger.info("Permission granted", { userId, permissionId, grantedBy, expiresAt });
  }

  // Create resource policy
  async createResourcePolicy(
    teamId: string,
    resourceType: string,
    resourceId: string,
    policy: Record<string, string[]>
  ): Promise<void> {
    await this.prisma.resourcePolicy.upsert({
      where: {
        teamId_resourceType_resourceId: {
          teamId,
          resourceType,
          resourceId,
        },
      },
      update: {
        policy,
        updatedAt: new Date(),
      },
      create: {
        teamId,
        resourceType,
        resourceId,
        policy,
      },
    });

    logger.info("Resource policy created", {
      teamId,
      resourceType,
      resourceId,
    });
  }

  // Check legacy role permissions (backward compatibility)
  private checkLegacyRolePermission(
    role: string,
    resource: string,
    action: string
  ): boolean {
    const rolePermissions: Record<string, string[]> = {
      owner: ["*"], // Full access
      admin: [
        "projects.*",
        "deployments.*",
        "environments.*",
        "users.read",
        "users.create",
        "users.update",
        "billing.read",
        "logs.*",
        "metrics.*",
        "alerts.*",
        "audit.read",
      ],
      member: [
        "projects.read",
        "projects.create",
        "projects.update",
        "deployments.*",
        "environments.*",
        "users.read",
        "billing.read",
        "logs.read",
        "metrics.read",
        "alerts.read",
      ],
    };

    const permissions = rolePermissions[role] || [];
    const permissionToCheck = `${resource}.${action}`;

    return permissions.some(perm => {
      if (perm === "*") return true;
      if (perm === permissionToCheck) return true;
      if (perm.endsWith(".*") && permissionToCheck.startsWith(perm.slice(0, -2))) {
        return true;
      }
      return false;
    });
  }

  // Check RBAC permissions
  private async checkRbacPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const permissionName = `${resource}.${action}`;

    // Check through roles
    const rolePermission = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        role: {
          permissions: {
            some: {
              permission: {
                name: permissionName,
              },
            },
          },
        },
      },
    });

    if (rolePermission) return true;

    // Check direct permissions
    const directPermission = await this.prisma.userPermission.findFirst({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        permission: {
          name: permissionName,
        },
      },
    });

    return !!directPermission;
  }

  // Check resource-specific policies
  private async checkResourcePolicy(
    context: UserPermissionContext,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<boolean> {
    const policy = await this.prisma.resourcePolicy.findUnique({
      where: {
        teamId_resourceType_resourceId: {
          teamId: context.teamId,
          resourceType,
          resourceId,
        },
      },
    });

    if (!policy) return true; // No policy means use default permissions

    const policyData = policy.policy as Record<string, string[]>;
    const allowedForAction = policyData[action] || [];

    // Check if user's role is allowed
    if (allowedForAction.includes(`role:${context.role}`)) return true;

    // Check if user is specifically allowed
    if (allowedForAction.includes(`user:${context.userId}`)) return true;

    // Check if user has any of the required roles
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId: context.userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: true,
      },
    });

    return userRoles.some(ur => 
      allowedForAction.includes(`role:${ur.role.name}`)
    );
  }

  // Clear user permission cache
  private async clearUserPermissionCache(userId: string): Promise<void> {
    // Get user's team
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teamId: true },
    });

    if (user) {
      await this.cache.clearNamespace(user.teamId, `permissions:${userId}`);
    }
  }

  // Initialize default permissions
  async initializeDefaultPermissions(): Promise<void> {
    const defaultPermissions = [
      // Project permissions
      { name: "projects.create", resource: "projects", action: "create", description: "Create projects" },
      { name: "projects.read", resource: "projects", action: "read", description: "View projects" },
      { name: "projects.update", resource: "projects", action: "update", description: "Update projects" },
      { name: "projects.delete", resource: "projects", action: "delete", description: "Delete projects" },
      
      // Deployment permissions
      { name: "deployments.create", resource: "deployments", action: "create", description: "Create deployments" },
      { name: "deployments.read", resource: "deployments", action: "read", description: "View deployments" },
      { name: "deployments.update", resource: "deployments", action: "update", description: "Update deployments" },
      { name: "deployments.delete", resource: "deployments", action: "delete", description: "Delete deployments" },
      
      // User permissions
      { name: "users.create", resource: "users", action: "create", description: "Create users" },
      { name: "users.read", resource: "users", action: "read", description: "View users" },
      { name: "users.update", resource: "users", action: "update", description: "Update users" },
      { name: "users.delete", resource: "users", action: "delete", description: "Delete users" },
      
      // Billing permissions
      { name: "billing.read", resource: "billing", action: "read", description: "View billing information" },
      { name: "billing.update", resource: "billing", action: "update", description: "Update billing information" },
      
      // Audit permissions
      { name: "audit.read", resource: "audit", action: "read", description: "View audit logs" },
      { name: "audit.export", resource: "audit", action: "export", description: "Export audit logs" },
      
      // Settings permissions
      { name: "settings.read", resource: "settings", action: "read", description: "View team settings" },
      { name: "settings.update", resource: "settings", action: "update", description: "Update team settings" },
      
      // Role permissions
      { name: "roles.create", resource: "roles", action: "create", description: "Create roles" },
      { name: "roles.read", resource: "roles", action: "read", description: "View roles" },
      { name: "roles.update", resource: "roles", action: "update", description: "Update roles" },
      { name: "roles.delete", resource: "roles", action: "delete", description: "Delete roles" },
    ];

    for (const permission of defaultPermissions) {
      await this.prisma.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: permission,
      });
    }

    logger.info("Default permissions initialized");
  }

  // Create default roles for a team
  async createDefaultRoles(teamId: string): Promise<void> {
    const defaultRoles = [
      {
        name: "viewer",
        description: "Read-only access to team resources",
        permissions: [
          "projects.read",
          "deployments.read",
          "users.read",
          "billing.read",
          "audit.read",
          "settings.read",
        ],
      },
      {
        name: "developer",
        description: "Create and manage deployments",
        permissions: [
          "projects.read",
          "projects.create",
          "projects.update",
          "deployments.create",
          "deployments.read",
          "deployments.update",
          "deployments.delete",
          "users.read",
          "billing.read",
        ],
      },
      {
        name: "billing_admin",
        description: "Manage billing and subscriptions",
        permissions: [
          "billing.read",
          "billing.update",
          "users.read",
          "settings.read",
        ],
      },
    ];

    for (const roleData of defaultRoles) {
      // Create role
      const role = await this.prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          teamId,
          isSystem: true,
        },
      });

      // Assign permissions
      for (const permissionName of roleData.permissions) {
        const permission = await this.prisma.permission.findUnique({
          where: { name: permissionName },
        });

        if (permission) {
          await this.prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }

    logger.info("Default roles created for team", { teamId });
  }
}

// Singleton instance
let permissionService: PermissionService;

export function getPermissionService(prisma: PrismaClient): PermissionService {
  if (!permissionService) {
    permissionService = new PermissionService(prisma);
  }
  return permissionService;
}