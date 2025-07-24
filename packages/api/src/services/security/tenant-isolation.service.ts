import { PrismaClient } from "@prisma/client";
import { Request } from "express";
import logger from "../../lib/logger";

export interface TenantContext {
  teamId: string;
  userId: string;
  role: string;
}

export interface TenantAwareQuery {
  where?: any;
  include?: any;
  select?: any;
}

export class TenantIsolationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Extract tenant context from request
  extractTenantContext(req: Request & { user?: any }): TenantContext | null {
    if (!req.user) {
      return null;
    }

    return {
      teamId: req.user.teamId,
      userId: req.user.userId,
      role: req.user.role,
    };
  }

  // Apply tenant filter to Prisma queries
  applyTenantFilter<T extends TenantAwareQuery>(
    query: T,
    tenantContext: TenantContext
  ): T {
    return {
      ...query,
      where: {
        ...query.where,
        teamId: tenantContext.teamId,
      },
    };
  }

  // Validate resource belongs to tenant
  async validateResourceAccess(
    resourceType: string,
    resourceId: string,
    tenantContext: TenantContext
  ): Promise<boolean> {
    try {
      let resource: any;

      switch (resourceType) {
        case "project":
          resource = await this.prisma.project.findFirst({
            where: {
              id: resourceId,
              teamId: tenantContext.teamId,
            },
          });
          break;

        case "deployment":
          resource = await this.prisma.deployment.findFirst({
            where: {
              id: resourceId,
              project: {
                teamId: tenantContext.teamId,
              },
            },
          });
          break;

        case "environment":
          resource = await this.prisma.environment.findFirst({
            where: {
              id: resourceId,
              project: {
                teamId: tenantContext.teamId,
              },
            },
          });
          break;

        case "invoice":
          resource = await this.prisma.invoice.findFirst({
            where: {
              id: resourceId,
              teamId: tenantContext.teamId,
            },
          });
          break;

        case "notification":
          resource = await this.prisma.notification.findFirst({
            where: {
              id: resourceId,
              userId: tenantContext.userId,
            },
          });
          break;

        case "auditlog":
          resource = await this.prisma.auditLog.findFirst({
            where: {
              id: resourceId,
              teamId: tenantContext.teamId,
            },
          });
          break;

        default:
          logger.warn("Unknown resource type for tenant validation", {
            resourceType,
            resourceId,
          });
          return false;
      }

      return !!resource;
    } catch (error) {
      logger.error("Failed to validate resource access", {
        resourceType,
        resourceId,
        teamId: tenantContext.teamId,
        error,
      });
      return false;
    }
  }

  // Create tenant-scoped Prisma client extensions
  createTenantScopedClient(tenantContext: TenantContext) {
    return this.prisma.$extends({
      query: {
        // Auto-filter team-owned models
        project: {
          async findMany({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findUnique({ args, query }) {
            const result = await query(args);
            if (result && result.teamId !== tenantContext.teamId) {
              return null;
            }
            return result;
          },
          async create({ args, query }) {
            args.data = { ...args.data, teamId: tenantContext.teamId };
            return query(args);
          },
          async update({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async delete({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
        },

        // User queries should be scoped to team
        user: {
          async findMany({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
        },

        // Invoice queries
        invoice: {
          async findMany({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
        },

        // Audit logs
        auditLog: {
          async findMany({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
        },

        // Team invitations
        teamInvitation: {
          async findMany({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, teamId: tenantContext.teamId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, teamId: tenantContext.teamId };
            return query(args);
          },
        },

        // Notifications are user-scoped
        notification: {
          async findMany({ args, query }) {
            args.where = { ...args.where, userId: tenantContext.userId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, userId: tenantContext.userId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, userId: tenantContext.userId };
            return query(args);
          },
        },
      },
    });
  }

  // Validate cross-tenant references
  async validateCrossTenantReference(
    sourceTeamId: string,
    targetResourceType: string,
    targetResourceId: string
  ): Promise<boolean> {
    const targetContext = { teamId: sourceTeamId, userId: "", role: "" };
    return this.validateResourceAccess(
      targetResourceType,
      targetResourceId,
      targetContext
    );
  }

  // Get tenant usage statistics
  async getTenantStats(teamId: string) {
    const [
      userCount,
      projectCount,
      deploymentCount,
      storageUsage,
    ] = await Promise.all([
      this.prisma.user.count({ where: { teamId } }),
      this.prisma.project.count({ where: { teamId } }),
      this.prisma.deployment.count({
        where: { project: { teamId } },
      }),
      this.prisma.usageEvent.aggregate({
        where: {
          project: { teamId },
          metricType: "storage_gb_hours",
        },
        _sum: { quantity: true },
      }),
    ]);

    return {
      users: userCount,
      projects: projectCount,
      deployments: deploymentCount,
      storageGB: Number(storageUsage._sum.quantity || 0) / 24, // Convert GB-hours to GB
    };
  }

  // Tenant data export (for GDPR compliance)
  async exportTenantData(teamId: string) {
    const [
      team,
      users,
      projects,
      invoices,
      auditLogs,
    ] = await Promise.all([
      this.prisma.team.findUnique({
        where: { id: teamId },
      }),
      this.prisma.user.findMany({
        where: { teamId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.project.findMany({
        where: { teamId },
        include: {
          deployments: true,
          environments: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { teamId },
      }),
      this.prisma.auditLog.findMany({
        where: { teamId },
        orderBy: { timestamp: "desc" },
        take: 1000, // Limit audit logs
      }),
    ]);

    return {
      team,
      users,
      projects,
      invoices,
      auditLogs,
      exportedAt: new Date(),
    };
  }

  // Tenant data deletion (for account closure)
  async deleteTenantData(teamId: string, confirmed: boolean = false) {
    if (!confirmed) {
      throw new Error("Deletion must be confirmed");
    }

    // Use transaction for atomic deletion
    return await this.prisma.$transaction(async (tx) => {
      // Delete in order of dependencies
      // 1. Delete deployments
      await tx.deployment.deleteMany({
        where: { project: { teamId } },
      });

      // 2. Delete environments
      await tx.environment.deleteMany({
        where: { project: { teamId } },
      });

      // 3. Delete usage events
      await tx.usageEvent.deleteMany({
        where: { project: { teamId } },
      });

      // 4. Delete projects
      await tx.project.deleteMany({
        where: { teamId },
      });

      // 5. Delete notifications
      const users = await tx.user.findMany({
        where: { teamId },
        select: { id: true },
      });
      const userIds = users.map(u => u.id);

      await tx.notification.deleteMany({
        where: { userId: { in: userIds } },
      });

      // 6. Delete OAuth accounts
      await tx.oAuthAccount.deleteMany({
        where: { userId: { in: userIds } },
      });

      // 7. Delete team invitations
      await tx.teamInvitation.deleteMany({
        where: { teamId },
      });

      // 8. Delete audit logs
      await tx.auditLog.deleteMany({
        where: { teamId },
      });

      // 9. Delete invoices
      await tx.invoice.deleteMany({
        where: { teamId },
      });

      // 10. Delete users
      await tx.user.deleteMany({
        where: { teamId },
      });

      // 11. Finally, delete the team
      await tx.team.delete({
        where: { id: teamId },
      });

      logger.info("Tenant data deleted", { teamId });

      return { teamId, deletedAt: new Date() };
    });
  }
}

// Singleton instance
let tenantIsolationService: TenantIsolationService;

export function getTenantIsolationService(prisma: PrismaClient) {
  if (!tenantIsolationService) {
    tenantIsolationService = new TenantIsolationService(prisma);
  }
  return tenantIsolationService;
}