import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { getPermissionService, PermissionCheck } from "../services/auth/permission.service";
import logger from "../lib/logger";

const prisma = new PrismaClient();
const permissionService = getPermissionService(prisma);

export interface PermissionRequest extends Request {
  user?: any;
  permissions?: string[];
}

// Middleware to check single permission
export function requirePermission(resource: string, action: string) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const context = {
        userId: req.user.userId,
        teamId: req.user.teamId,
        role: req.user.role,
      };

      const check: PermissionCheck = {
        resource,
        action,
        resourceId: req.params.id || req.params[`${resource}Id`],
      };

      const hasPermission = await permissionService.hasPermission(context, check);

      if (!hasPermission) {
        logger.warn("Permission denied", {
          userId: context.userId,
          teamId: context.teamId,
          resource,
          action,
          resourceId: check.resourceId,
        });

        return res.status(403).json({
          error: "Permission denied",
          message: `You don't have permission to ${action} ${resource}`,
        });
      }

      next();
    } catch (error) {
      logger.error("Permission check failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware to check multiple permissions (all required)
export function requirePermissions(checks: PermissionCheck[]) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const context = {
        userId: req.user.userId,
        teamId: req.user.teamId,
        role: req.user.role,
      };

      const hasPermissions = await permissionService.hasPermissions(context, checks);

      if (!hasPermissions) {
        logger.warn("Multiple permissions denied", {
          userId: context.userId,
          teamId: context.teamId,
          checks,
        });

        return res.status(403).json({
          error: "Permission denied",
          message: "You don't have the required permissions for this action",
        });
      }

      next();
    } catch (error) {
      logger.error("Permission check failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware to check any of the permissions
export function requireAnyPermission(checks: PermissionCheck[]) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const context = {
        userId: req.user.userId,
        teamId: req.user.teamId,
        role: req.user.role,
      };

      const hasAnyPermission = await permissionService.hasAnyPermission(context, checks);

      if (!hasAnyPermission) {
        logger.warn("No matching permissions", {
          userId: context.userId,
          teamId: context.teamId,
          checks,
        });

        return res.status(403).json({
          error: "Permission denied",
          message: "You need at least one of the required permissions",
        });
      }

      next();
    } catch (error) {
      logger.error("Permission check failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware to load user permissions
export async function loadUserPermissions(
  req: PermissionRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return next();
    }

    const permissions = await permissionService.getUserPermissions(req.user.userId);
    req.permissions = permissions;

    next();
  } catch (error) {
    logger.error("Failed to load user permissions", { error });
    // Continue without permissions - individual checks will fail
    next();
  }
}

// Helper function to check permission in route handlers
export async function checkPermission(
  req: PermissionRequest,
  resource: string,
  action: string,
  resourceId?: string
): Promise<boolean> {
  if (!req.user) return false;

  const context = {
    userId: req.user.userId,
    teamId: req.user.teamId,
    role: req.user.role,
  };

  const check: PermissionCheck = {
    resource,
    action,
    resourceId,
  };

  return permissionService.hasPermission(context, check);
}

// Middleware for legacy role-based access (backward compatibility)
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
}

// Dynamic permission check based on request
export function requireDynamicPermission(
  resourceExtractor: (req: Request) => string,
  actionExtractor: (req: Request) => string
) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const resource = resourceExtractor(req);
      const action = actionExtractor(req);

      const context = {
        userId: req.user.userId,
        teamId: req.user.teamId,
        role: req.user.role,
      };

      const check: PermissionCheck = {
        resource,
        action,
        resourceId: req.params.id,
      };

      const hasPermission = await permissionService.hasPermission(context, check);

      if (!hasPermission) {
        logger.warn("Dynamic permission denied", {
          userId: context.userId,
          resource,
          action,
        });

        return res.status(403).json({
          error: "Permission denied",
          message: `You don't have permission to ${action} ${resource}`,
        });
      }

      next();
    } catch (error) {
      logger.error("Dynamic permission check failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Owner-only middleware (simplified check)
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "owner") {
    return res.status(403).json({
      error: "Access denied",
      message: "This action requires team owner privileges",
    });
  }

  next();
}

// Self or permission middleware (user can access their own resources or with permission)
export function requireSelfOrPermission(
  userIdExtractor: (req: Request) => string,
  resource: string,
  action: string
) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetUserId = userIdExtractor(req);
      
      // Check if accessing own resource
      if (req.user.userId === targetUserId) {
        return next();
      }

      // Otherwise check permission
      const context = {
        userId: req.user.userId,
        teamId: req.user.teamId,
        role: req.user.role,
      };

      const check: PermissionCheck = {
        resource,
        action,
      };

      const hasPermission = await permissionService.hasPermission(context, check);

      if (!hasPermission) {
        return res.status(403).json({
          error: "Permission denied",
          message: "You can only access your own resources or need appropriate permissions",
        });
      }

      next();
    } catch (error) {
      logger.error("Self or permission check failed", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}