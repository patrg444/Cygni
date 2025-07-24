import { PrismaClient } from "@prisma/client";
import logger from "../../lib/logger";

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

export class RoleService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Create a new role
  async createRole(teamId: string, input: CreateRoleInput) {
    // Check if role name already exists in team
    const existing = await this.prisma.role.findUnique({
      where: {
        teamId_name: {
          teamId,
          name: input.name,
        },
      },
    });

    if (existing) {
      throw new Error(`Role '${input.name}' already exists`);
    }

    // Create role
    const role = await this.prisma.role.create({
      data: {
        teamId,
        name: input.name,
        description: input.description,
      },
    });

    // Assign permissions
    if (input.permissions.length > 0) {
      const permissions = await this.prisma.permission.findMany({
        where: {
          name: { in: input.permissions },
        },
      });

      const rolePermissions = permissions.map(permission => ({
        roleId: role.id,
        permissionId: permission.id,
      }));

      await this.prisma.rolePermission.createMany({
        data: rolePermissions,
      });
    }

    logger.info("Role created", {
      teamId,
      roleId: role.id,
      name: role.name,
      permissions: input.permissions,
    });

    return this.getRoleById(role.id);
  }

  // Update role
  async updateRole(roleId: string, teamId: string, input: UpdateRoleInput) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        teamId,
      },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (role.isSystem) {
      throw new Error("System roles cannot be modified");
    }

    // Update basic info
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description,
      },
    });

    // Update permissions if provided
    if (input.permissions !== undefined) {
      // Remove all existing permissions
      await this.prisma.rolePermission.deleteMany({
        where: { roleId },
      });

      // Add new permissions
      if (input.permissions.length > 0) {
        const permissions = await this.prisma.permission.findMany({
          where: {
            name: { in: input.permissions },
          },
        });

        const rolePermissions = permissions.map(permission => ({
          roleId,
          permissionId: permission.id,
        }));

        await this.prisma.rolePermission.createMany({
          data: rolePermissions,
        });
      }
    }

    logger.info("Role updated", {
      teamId,
      roleId,
      changes: input,
    });

    return this.getRoleById(roleId);
  }

  // Delete role
  async deleteRole(roleId: string, teamId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        teamId,
      },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (role.isSystem) {
      throw new Error("System roles cannot be deleted");
    }

    // Check if role is in use
    const usersWithRole = await this.prisma.userRole.count({
      where: { roleId },
    });

    if (usersWithRole > 0) {
      throw new Error(`Role is assigned to ${usersWithRole} users and cannot be deleted`);
    }

    // Delete role (cascade deletes role permissions)
    await this.prisma.role.delete({
      where: { id: roleId },
    });

    logger.info("Role deleted", {
      teamId,
      roleId,
      roleName: role.name,
    });
  }

  // Get role by ID
  async getRoleById(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!role) return null;

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map(rp => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      users: role.userRoles.map(ur => ({
        id: ur.user.id,
        email: ur.user.email,
        name: ur.user.name,
        grantedAt: ur.createdAt,
        grantedBy: ur.grantedBy,
        expiresAt: ur.expiresAt,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  // Get all roles for a team
  async getTeamRoles(teamId: string) {
    const roles = await this.prisma.role.findMany({
      where: { teamId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
      orderBy: [
        { isSystem: "desc" },
        { name: "asc" },
      ],
    });

    return roles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map(rp => rp.permission.name),
      userCount: role._count.userRoles,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  // Get users in a role
  async getRoleUsers(roleId: string, teamId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        roleId,
        role: { teamId },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            lastLoginAt: true,
          },
        },
      },
    });

    return userRoles.map(ur => ({
      ...ur.user,
      roleGrantedAt: ur.createdAt,
      roleGrantedBy: ur.grantedBy,
      roleExpiresAt: ur.expiresAt,
    }));
  }

  // Get all available permissions
  async getAllPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [
        { resource: "asc" },
        { action: "asc" },
      ],
    });

    // Group by resource
    const grouped = permissions.reduce((acc, permission) => {
      if (!acc[permission.resource]) {
        acc[permission.resource] = [];
      }
      acc[permission.resource].push({
        id: permission.id,
        name: permission.name,
        action: permission.action,
        description: permission.description,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return grouped;
  }

  // Clone a role
  async cloneRole(roleId: string, teamId: string, newName: string) {
    const sourceRole = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        teamId,
      },
      include: {
        permissions: true,
      },
    });

    if (!sourceRole) {
      throw new Error("Source role not found");
    }

    // Create new role
    const newRole = await this.prisma.role.create({
      data: {
        teamId,
        name: newName,
        description: `Cloned from ${sourceRole.name}`,
        isSystem: false,
      },
    });

    // Copy permissions
    if (sourceRole.permissions.length > 0) {
      const rolePermissions = sourceRole.permissions.map(rp => ({
        roleId: newRole.id,
        permissionId: rp.permissionId,
      }));

      await this.prisma.rolePermission.createMany({
        data: rolePermissions,
      });
    }

    logger.info("Role cloned", {
      teamId,
      sourceRoleId: roleId,
      newRoleId: newRole.id,
      newRoleName: newName,
    });

    return this.getRoleById(newRole.id);
  }

  // Migrate legacy roles to RBAC
  async migrateLegacyRoles(teamId: string) {
    // Get users with legacy roles
    const users = await this.prisma.user.findMany({
      where: { teamId },
      select: {
        id: true,
        role: true,
      },
    });

    const results = {
      migrated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const user of users) {
      try {
        // Map legacy role to new RBAC role
        let newRoleName: string | null = null;

        switch (user.role) {
          case "owner":
            // Owner keeps all permissions through legacy system
            continue;
          case "admin":
            newRoleName = "developer";
            break;
          case "member":
            newRoleName = "viewer";
            break;
        }

        if (newRoleName) {
          // Find or create the role
          const role = await this.prisma.role.findFirst({
            where: {
              teamId,
              name: newRoleName,
            },
          });

          if (role) {
            // Check if already assigned
            const existing = await this.prisma.userRole.findUnique({
              where: {
                userId_roleId: {
                  userId: user.id,
                  roleId: role.id,
                },
              },
            });

            if (!existing) {
              await this.prisma.userRole.create({
                data: {
                  userId: user.id,
                  roleId: role.id,
                  grantedBy: "system-migration",
                },
              });
              results.migrated++;
            }
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to migrate user ${user.id}: ${error}`);
      }
    }

    logger.info("Legacy roles migrated", {
      teamId,
      ...results,
    });

    return results;
  }
}

// Singleton instance
let roleService: RoleService;

export function getRoleService(prisma: PrismaClient): RoleService {
  if (!roleService) {
    roleService = new RoleService(prisma);
  }
  return roleService;
}