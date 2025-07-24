import { PrismaClient } from "@prisma/client";
import { getPermissionService } from "./permission.service";
import logger from "../../lib/logger";

export interface ResourcePermissionPolicy {
  read?: string[];    // Array of role names or user IDs that can read
  write?: string[];   // Array of role names or user IDs that can write
  delete?: string[];  // Array of role names or user IDs that can delete
  share?: string[];   // Array of role names or user IDs that can share
  admin?: string[];   // Array of role names or user IDs that have admin access
}

export interface ResourceAccessCheck {
  userId: string;
  teamId: string;
  role: string;
  resourceType: string;
  resourceId: string;
  action: string;
}

export class ResourcePermissionService {
  private prisma: PrismaClient;
  private permissionService = getPermissionService(this.prisma);

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Set resource-specific permissions
  async setResourcePermissions(
    teamId: string,
    resourceType: string,
    resourceId: string,
    policy: ResourcePermissionPolicy
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
        policy: policy as any,
        updatedAt: new Date(),
      },
      create: {
        teamId,
        resourceType,
        resourceId,
        policy: policy as any,
      },
    });

    logger.info("Resource permissions updated", {
      teamId,
      resourceType,
      resourceId,
    });
  }

  // Check resource access
  async checkResourceAccess(check: ResourceAccessCheck): Promise<boolean> {
    // First check general permission
    const hasGeneralPermission = await this.permissionService.hasPermission(
      {
        userId: check.userId,
        teamId: check.teamId,
        role: check.role,
      },
      {
        resource: check.resourceType,
        action: check.action,
      }
    );

    // If no general permission, check resource-specific policy
    if (!hasGeneralPermission) {
      return this.checkResourcePolicy(check);
    }

    // If has general permission, still check if resource has restrictive policy
    const policy = await this.getResourcePolicy(
      check.teamId,
      check.resourceType,
      check.resourceId
    );

    if (!policy) {
      // No specific policy, general permission applies
      return true;
    }

    // Check if policy restricts access
    return this.evaluatePolicy(policy, check);
  }

  // Get resource policy
  async getResourcePolicy(
    teamId: string,
    resourceType: string,
    resourceId: string
  ): Promise<ResourcePermissionPolicy | null> {
    const resourcePolicy = await this.prisma.resourcePolicy.findUnique({
      where: {
        teamId_resourceType_resourceId: {
          teamId,
          resourceType,
          resourceId,
        },
      },
    });

    return resourcePolicy?.policy as ResourcePermissionPolicy | null;
  }

  // Share resource with users or roles
  async shareResource(
    teamId: string,
    resourceType: string,
    resourceId: string,
    shareWith: {
      users?: string[];
      roles?: string[];
    },
    permissions: string[] = ["read"]
  ): Promise<void> {
    const currentPolicy = await this.getResourcePolicy(teamId, resourceType, resourceId) || {};

    // Update policy for each permission
    for (const permission of permissions) {
      const currentList = currentPolicy[permission as keyof ResourcePermissionPolicy] || [];
      const newList = new Set(currentList);

      // Add users
      if (shareWith.users) {
        shareWith.users.forEach(userId => newList.add(`user:${userId}`));
      }

      // Add roles
      if (shareWith.roles) {
        shareWith.roles.forEach(role => newList.add(`role:${role}`));
      }

      currentPolicy[permission as keyof ResourcePermissionPolicy] = Array.from(newList);
    }

    await this.setResourcePermissions(teamId, resourceType, resourceId, currentPolicy);

    logger.info("Resource shared", {
      teamId,
      resourceType,
      resourceId,
      shareWith,
      permissions,
    });
  }

  // Revoke resource access
  async revokeResourceAccess(
    teamId: string,
    resourceType: string,
    resourceId: string,
    revokeFrom: {
      users?: string[];
      roles?: string[];
    }
  ): Promise<void> {
    const currentPolicy = await this.getResourcePolicy(teamId, resourceType, resourceId);
    
    if (!currentPolicy) {
      return; // No policy to revoke from
    }

    // Remove from all permission lists
    for (const key of Object.keys(currentPolicy) as Array<keyof ResourcePermissionPolicy>) {
      const list = currentPolicy[key];
      if (Array.isArray(list)) {
        currentPolicy[key] = list.filter(item => {
          if (revokeFrom.users && item.startsWith("user:")) {
            const userId = item.substring(5);
            return !revokeFrom.users.includes(userId);
          }
          if (revokeFrom.roles && item.startsWith("role:")) {
            const role = item.substring(5);
            return !revokeFrom.roles.includes(role);
          }
          return true;
        }) as any;
      }
    }

    await this.setResourcePermissions(teamId, resourceType, resourceId, currentPolicy);

    logger.info("Resource access revoked", {
      teamId,
      resourceType,
      resourceId,
      revokeFrom,
    });
  }

  // Get all resources shared with a user
  async getUserSharedResources(
    userId: string,
    teamId: string,
    resourceType?: string
  ): Promise<Array<{
    resourceType: string;
    resourceId: string;
    permissions: string[];
  }>> {
    const query: any = {
      teamId,
    };

    if (resourceType) {
      query.resourceType = resourceType;
    }

    const policies = await this.prisma.resourcePolicy.findMany({
      where: query,
    });

    // Get user's roles
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: true,
      },
    });

    const userRoleNames = userRoles.map(ur => ur.role.name);
    const results: Array<{
      resourceType: string;
      resourceId: string;
      permissions: string[];
    }> = [];

    for (const policy of policies) {
      const policyData = policy.policy as ResourcePermissionPolicy;
      const permissions: string[] = [];

      // Check each permission type
      for (const [permission, allowedList] of Object.entries(policyData)) {
        if (Array.isArray(allowedList)) {
          const hasAccess = allowedList.some(allowed => {
            if (allowed === `user:${userId}`) return true;
            if (allowed.startsWith("role:")) {
              const roleName = allowed.substring(5);
              return userRoleNames.includes(roleName);
            }
            return false;
          });

          if (hasAccess) {
            permissions.push(permission);
          }
        }
      }

      if (permissions.length > 0) {
        results.push({
          resourceType: policy.resourceType,
          resourceId: policy.resourceId,
          permissions,
        });
      }
    }

    return results;
  }

  // Get users with access to a resource
  async getResourceAccessList(
    teamId: string,
    resourceType: string,
    resourceId: string
  ): Promise<{
    users: Array<{ userId: string; permissions: string[] }>;
    roles: Array<{ role: string; permissions: string[] }>;
  }> {
    const policy = await this.getResourcePolicy(teamId, resourceType, resourceId);
    
    if (!policy) {
      return { users: [], roles: [] };
    }

    const userMap = new Map<string, Set<string>>();
    const roleMap = new Map<string, Set<string>>();

    // Process each permission type
    for (const [permission, allowedList] of Object.entries(policy)) {
      if (Array.isArray(allowedList)) {
        for (const allowed of allowedList) {
          if (allowed.startsWith("user:")) {
            const userId = allowed.substring(5);
            if (!userMap.has(userId)) {
              userMap.set(userId, new Set());
            }
            userMap.get(userId)!.add(permission);
          } else if (allowed.startsWith("role:")) {
            const role = allowed.substring(5);
            if (!roleMap.has(role)) {
              roleMap.set(role, new Set());
            }
            roleMap.get(role)!.add(permission);
          }
        }
      }
    }

    return {
      users: Array.from(userMap.entries()).map(([userId, permissions]) => ({
        userId,
        permissions: Array.from(permissions),
      })),
      roles: Array.from(roleMap.entries()).map(([role, permissions]) => ({
        role,
        permissions: Array.from(permissions),
      })),
    };
  }

  // Clone resource permissions
  async cloneResourcePermissions(
    teamId: string,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string
  ): Promise<void> {
    const sourcePolicy = await this.getResourcePolicy(teamId, sourceType, sourceId);
    
    if (sourcePolicy) {
      await this.setResourcePermissions(teamId, targetType, targetId, sourcePolicy);
      
      logger.info("Resource permissions cloned", {
        teamId,
        source: { type: sourceType, id: sourceId },
        target: { type: targetType, id: targetId },
      });
    }
  }

  // Clear resource permissions (reset to default)
  async clearResourcePermissions(
    teamId: string,
    resourceType: string,
    resourceId: string
  ): Promise<void> {
    await this.prisma.resourcePolicy.delete({
      where: {
        teamId_resourceType_resourceId: {
          teamId,
          resourceType,
          resourceId,
        },
      },
    });

    logger.info("Resource permissions cleared", {
      teamId,
      resourceType,
      resourceId,
    });
  }

  // Private helper to check resource policy
  private async checkResourcePolicy(check: ResourceAccessCheck): Promise<boolean> {
    const policy = await this.getResourcePolicy(
      check.teamId,
      check.resourceType,
      check.resourceId
    );

    if (!policy) {
      return false; // No policy means no access without general permission
    }

    return this.evaluatePolicy(policy, check);
  }

  // Private helper to evaluate policy
  private async evaluatePolicy(
    policy: ResourcePermissionPolicy,
    check: ResourceAccessCheck
  ): Promise<boolean> {
    const allowedList = policy[check.action as keyof ResourcePermissionPolicy];
    
    if (!allowedList || !Array.isArray(allowedList)) {
      return false;
    }

    // Check direct user access
    if (allowedList.includes(`user:${check.userId}`)) {
      return true;
    }

    // Check role-based access
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId: check.userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: true,
      },
    });

    for (const userRole of userRoles) {
      if (allowedList.includes(`role:${userRole.role.name}`)) {
        return true;
      }
    }

    // Check legacy role (backward compatibility)
    if (allowedList.includes(`role:${check.role}`)) {
      return true;
    }

    return false;
  }

  // Bulk update permissions for multiple resources
  async bulkSetResourcePermissions(
    teamId: string,
    updates: Array<{
      resourceType: string;
      resourceId: string;
      policy: ResourcePermissionPolicy;
    }>
  ): Promise<void> {
    const operations = updates.map(update => 
      this.prisma.resourcePolicy.upsert({
        where: {
          teamId_resourceType_resourceId: {
            teamId,
            resourceType: update.resourceType,
            resourceId: update.resourceId,
          },
        },
        update: {
          policy: update.policy as any,
          updatedAt: new Date(),
        },
        create: {
          teamId,
          resourceType: update.resourceType,
          resourceId: update.resourceId,
          policy: update.policy as any,
        },
      })
    );

    await this.prisma.$transaction(operations);

    logger.info("Bulk resource permissions updated", {
      teamId,
      resourceCount: updates.length,
    });
  }
}

// Singleton instance
let resourcePermissionService: ResourcePermissionService;

export function getResourcePermissionService(prisma: PrismaClient): ResourcePermissionService {
  if (!resourcePermissionService) {
    resourcePermissionService = new ResourcePermissionService(prisma);
  }
  return resourcePermissionService;
}