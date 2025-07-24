import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { getPermissionService } from "../services/auth/permission.service";
import { getRoleService } from "../services/auth/role.service";
import { getResourcePermissionService } from "../services/auth/resource-permission.service";
import { requirePermission, requireRole } from "../middleware/permission.middleware";
import { getAuditLogger } from "../services/audit/audit-logger.service";
import { AuditEventType } from "../services/audit/audit-events";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();
const permissionService = getPermissionService(prisma);
const roleService = getRoleService(prisma);
const resourcePermissionService = getResourcePermissionService(prisma);
const auditLogger = getAuditLogger(prisma);

interface AuthenticatedRequest extends Request {
  user?: any;
}

// Apply JWT middleware to all routes
router.use(jwtMiddleware(jwtService));

// GET /api/permissions - Get all available permissions
router.get("/permissions", async (req: Request, res: Response) => {
  try {
    const permissions = await roleService.getAllPermissions();
    res.json({ permissions });
  } catch (error) {
    logger.error("Failed to get permissions", { error });
    res.status(500).json({ error: "Failed to get permissions" });
  }
});

// GET /api/permissions/user/:userId - Get user's permissions
router.get(
  "/permissions/user/:userId",
  requirePermission("users", "read"),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const permissions = await permissionService.getUserPermissions(userId);
      
      res.json({ 
        userId,
        permissions,
      });
    } catch (error) {
      logger.error("Failed to get user permissions", { error });
      res.status(500).json({ error: "Failed to get user permissions" });
    }
  }
);

// GET /api/roles - Get all roles for the team
router.get(
  "/roles",
  requirePermission("roles", "read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const roles = await roleService.getTeamRoles(req.user!.teamId);
      res.json({ roles });
    } catch (error) {
      logger.error("Failed to get roles", { error });
      res.status(500).json({ error: "Failed to get roles" });
    }
  }
);

// POST /api/roles - Create a new role
router.post(
  "/roles",
  requirePermission("roles", "create"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
        permissions: z.array(z.string()),
      });

      const data = schema.parse(req.body);
      
      const role = await roleService.createRole(req.user!.teamId, data);
      
      await auditLogger.log({
        action: "role.created",
        actorType: "user" as any,
        resourceType: "role",
        resourceId: role!.id,
        teamId: req.user!.teamId,
        metadata: {
          roleName: data.name,
          permissions: data.permissions,
        },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.status(201).json({ role });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      logger.error("Failed to create role", { error });
      res.status(500).json({ error: "Failed to create role" });
    }
  }
);

// GET /api/roles/:roleId - Get role details
router.get(
  "/roles/:roleId",
  requirePermission("roles", "read"),
  async (req: Request, res: Response) => {
    try {
      const { roleId } = req.params;
      const role = await roleService.getRoleById(roleId);
      
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      res.json({ role });
    } catch (error) {
      logger.error("Failed to get role", { error });
      res.status(500).json({ error: "Failed to get role" });
    }
  }
);

// PUT /api/roles/:roleId - Update role
router.put(
  "/roles/:roleId",
  requirePermission("roles", "update"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roleId } = req.params;
      
      const schema = z.object({
        name: z.string().min(1).max(50).optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      });

      const data = schema.parse(req.body);
      
      const role = await roleService.updateRole(roleId, req.user!.teamId, data);
      
      await auditLogger.log({
        action: "role.updated",
        actorType: "user" as any,
        resourceType: "role",
        resourceId: roleId,
        teamId: req.user!.teamId,
        metadata: {
          changes: data,
        },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ role });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        if (error.message === "Role not found") {
          return res.status(404).json({ error: error.message });
        }
        if (error.message === "System roles cannot be modified") {
          return res.status(403).json({ error: error.message });
        }
      }
      logger.error("Failed to update role", { error });
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// DELETE /api/roles/:roleId - Delete role
router.delete(
  "/roles/:roleId",
  requirePermission("roles", "delete"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roleId } = req.params;
      
      await roleService.deleteRole(roleId, req.user!.teamId);
      
      await auditLogger.log({
        action: "role.deleted",
        actorType: "user" as any,
        resourceType: "role",
        resourceId: roleId,
        teamId: req.user!.teamId,
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Role not found") {
          return res.status(404).json({ error: error.message });
        }
        if (error.message === "System roles cannot be deleted") {
          return res.status(403).json({ error: error.message });
        }
        if (error.message.includes("Role is assigned to")) {
          return res.status(400).json({ error: error.message });
        }
      }
      logger.error("Failed to delete role", { error });
      res.status(500).json({ error: "Failed to delete role" });
    }
  }
);

// POST /api/roles/:roleId/users - Assign role to users
router.post(
  "/roles/:roleId/users",
  requirePermission("users", "update"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roleId } = req.params;
      
      const schema = z.object({
        userIds: z.array(z.string()).min(1),
        expiresAt: z.string().datetime().optional(),
      });

      const { userIds, expiresAt } = schema.parse(req.body);
      
      const results = {
        assigned: [] as string[],
        failed: [] as { userId: string; reason: string }[],
      };
      
      for (const userId of userIds) {
        try {
          await permissionService.grantRole(
            userId,
            roleId,
            req.user!.userId,
            expiresAt ? new Date(expiresAt) : undefined
          );
          results.assigned.push(userId);
        } catch (error) {
          results.failed.push({
            userId,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      
      await auditLogger.log({
        action: "role.users_assigned",
        actorType: "user" as any,
        resourceType: "role",
        resourceId: roleId,
        teamId: req.user!.teamId,
        metadata: {
          userIds,
          expiresAt,
          results,
        },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to assign role", { error });
      res.status(500).json({ error: "Failed to assign role" });
    }
  }
);

// DELETE /api/roles/:roleId/users/:userId - Remove role from user
router.delete(
  "/roles/:roleId/users/:userId",
  requirePermission("users", "update"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roleId, userId } = req.params;
      
      await permissionService.revokeRole(userId, roleId);
      
      await auditLogger.log({
        action: "role.user_removed",
        actorType: "user" as any,
        resourceType: "role",
        resourceId: roleId,
        teamId: req.user!.teamId,
        metadata: { userId },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "Role removed from user" });
    } catch (error) {
      logger.error("Failed to remove role", { error });
      res.status(500).json({ error: "Failed to remove role" });
    }
  }
);

// POST /api/permissions/grant - Grant permission directly to user
router.post(
  "/permissions/grant",
  requireRole("owner"), // Only owners can grant direct permissions
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const schema = z.object({
        userId: z.string(),
        permissionId: z.string(),
        expiresAt: z.string().datetime().optional(),
      });

      const { userId, permissionId, expiresAt } = schema.parse(req.body);
      
      await permissionService.grantPermission(
        userId,
        permissionId,
        req.user!.userId,
        expiresAt ? new Date(expiresAt) : undefined
      );
      
      await auditLogger.log({
        action: "permission.granted",
        actorType: "user" as any,
        resourceType: "permission",
        resourceId: permissionId,
        teamId: req.user!.teamId,
        metadata: { userId, expiresAt },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "Permission granted" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to grant permission", { error });
      res.status(500).json({ error: "Failed to grant permission" });
    }
  }
);

// POST /api/resources/:resourceType/:resourceId/permissions - Set resource permissions
router.post(
  "/resources/:resourceType/:resourceId/permissions",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      
      // Check if user has permission to manage this resource
      const hasPermission = await resourcePermissionService.checkResourceAccess({
        userId: req.user!.userId,
        teamId: req.user!.teamId,
        role: req.user!.role,
        resourceType,
        resourceId,
        action: "admin",
      });
      
      if (!hasPermission && req.user!.role !== "owner") {
        return res.status(403).json({ error: "Permission denied" });
      }
      
      const schema = z.object({
        permissions: z.object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
          delete: z.array(z.string()).optional(),
          share: z.array(z.string()).optional(),
          admin: z.array(z.string()).optional(),
        }),
      });

      const { permissions } = schema.parse(req.body);
      
      await resourcePermissionService.setResourcePermissions(
        req.user!.teamId,
        resourceType,
        resourceId,
        permissions
      );
      
      await auditLogger.log({
        action: "resource.permissions_updated",
        actorType: "user" as any,
        resourceType,
        resourceId,
        teamId: req.user!.teamId,
        metadata: { permissions },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "Resource permissions updated" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to set resource permissions", { error });
      res.status(500).json({ error: "Failed to set resource permissions" });
    }
  }
);

// GET /api/resources/:resourceType/:resourceId/permissions - Get resource permissions
router.get(
  "/resources/:resourceType/:resourceId/permissions",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      
      // Check if user has read access to the resource
      const hasAccess = await resourcePermissionService.checkResourceAccess({
        userId: req.user!.userId,
        teamId: req.user!.teamId,
        role: req.user!.role,
        resourceType,
        resourceId,
        action: "read",
      });
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Permission denied" });
      }
      
      const policy = await resourcePermissionService.getResourcePolicy(
        req.user!.teamId,
        resourceType,
        resourceId
      );
      
      const accessList = await resourcePermissionService.getResourceAccessList(
        req.user!.teamId,
        resourceType,
        resourceId
      );
      
      res.json({
        policy: policy || {},
        accessList,
      });
    } catch (error) {
      logger.error("Failed to get resource permissions", { error });
      res.status(500).json({ error: "Failed to get resource permissions" });
    }
  }
);

// POST /api/resources/:resourceType/:resourceId/share - Share resource
router.post(
  "/resources/:resourceType/:resourceId/share",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      
      // Check if user has share permission
      const hasPermission = await resourcePermissionService.checkResourceAccess({
        userId: req.user!.userId,
        teamId: req.user!.teamId,
        role: req.user!.role,
        resourceType,
        resourceId,
        action: "share",
      });
      
      if (!hasPermission) {
        return res.status(403).json({ error: "Permission denied" });
      }
      
      const schema = z.object({
        users: z.array(z.string()).optional(),
        roles: z.array(z.string()).optional(),
        permissions: z.array(z.enum(["read", "write", "delete", "share"])),
      });

      const { users, roles, permissions } = schema.parse(req.body);
      
      await resourcePermissionService.shareResource(
        req.user!.teamId,
        resourceType,
        resourceId,
        { users, roles },
        permissions
      );
      
      await auditLogger.log({
        action: "resource.shared",
        actorType: "user" as any,
        resourceType,
        resourceId,
        teamId: req.user!.teamId,
        metadata: { users, roles, permissions },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "Resource shared successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to share resource", { error });
      res.status(500).json({ error: "Failed to share resource" });
    }
  }
);

// GET /api/permissions/my-resources - Get resources shared with current user
router.get(
  "/permissions/my-resources",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const resources = await resourcePermissionService.getUserSharedResources(
        req.user!.userId,
        req.user!.teamId
      );
      
      res.json({ resources });
    } catch (error) {
      logger.error("Failed to get user resources", { error });
      res.status(500).json({ error: "Failed to get user resources" });
    }
  }
);

// POST /api/roles/migrate - Migrate legacy roles to RBAC
router.post(
  "/roles/migrate",
  requireRole("owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const results = await roleService.migrateLegacyRoles(req.user!.teamId);
      
      await auditLogger.log({
        action: "roles.migrated",
        actorType: "user" as any,
        resourceType: "team",
        resourceId: req.user!.teamId,
        teamId: req.user!.teamId,
        metadata: results,
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({
        message: "Legacy roles migrated",
        ...results,
      });
    } catch (error) {
      logger.error("Failed to migrate roles", { error });
      res.status(500).json({ error: "Failed to migrate roles" });
    }
  }
);

export { router as permissionsRouter };