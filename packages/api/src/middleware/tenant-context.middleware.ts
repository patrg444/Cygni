import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { getTenantIsolationService } from "../services/security/tenant-isolation.service";
import logger from "../lib/logger";

export interface TenantRequest extends Request {
  user?: any;
  tenantContext?: {
    teamId: string;
    userId: string;
    role: string;
  };
  tenantPrisma?: any;
}

const prisma = new PrismaClient();
const tenantIsolationService = getTenantIsolationService(prisma);

// Middleware to inject tenant context
export function tenantContextMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract tenant context from authenticated user
    const tenantContext = tenantIsolationService.extractTenantContext(req);
    
    if (!tenantContext) {
      // Skip for unauthenticated requests
      return next();
    }

    // Attach tenant context to request
    req.tenantContext = tenantContext;

    // Create tenant-scoped Prisma client
    req.tenantPrisma = tenantIsolationService.createTenantScopedClient(tenantContext);

    // Log tenant context for debugging
    logger.debug("Tenant context established", {
      teamId: tenantContext.teamId,
      userId: tenantContext.userId,
      role: tenantContext.role,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error("Failed to establish tenant context", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}

// Middleware to enforce tenant isolation for specific resources
export function enforceTenantIsolation(resourceType: string) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantContext) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get resource ID from various possible locations
      const resourceId = req.params.id || 
                        req.params[`${resourceType}Id`] || 
                        req.body?.[`${resourceType}Id`];

      if (!resourceId) {
        // No specific resource to check, continue
        return next();
      }

      // Validate resource access
      const hasAccess = await tenantIsolationService.validateResourceAccess(
        resourceType,
        resourceId,
        req.tenantContext
      );

      if (!hasAccess) {
        logger.warn("Tenant isolation violation attempt", {
          teamId: req.tenantContext.teamId,
          userId: req.tenantContext.userId,
          resourceType,
          resourceId,
          path: req.path,
        });

        return res.status(403).json({ 
          error: "Access denied",
          message: "Resource not found or access denied"
        });
      }

      next();
    } catch (error) {
      logger.error("Failed to enforce tenant isolation", { 
        error,
        resourceType,
        path: req.path,
      });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware to validate cross-tenant references
export function validateCrossTenantReferences(
  sourceField: string,
  targetResourceType: string,
  targetField: string
) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantContext) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetResourceId = req.body?.[targetField];
      if (!targetResourceId) {
        return next();
      }

      const isValid = await tenantIsolationService.validateCrossTenantReference(
        req.tenantContext.teamId,
        targetResourceType,
        targetResourceId
      );

      if (!isValid) {
        logger.warn("Cross-tenant reference violation", {
          teamId: req.tenantContext.teamId,
          sourceField,
          targetResourceType,
          targetField,
          targetResourceId,
        });

        return res.status(400).json({
          error: "Invalid reference",
          message: `Invalid ${targetResourceType} reference`,
        });
      }

      next();
    } catch (error) {
      logger.error("Failed to validate cross-tenant reference", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Apply tenant filter to query parameters
export function applyTenantFilter(req: TenantRequest, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return next();
  }

  // Add teamId to query parameters for filtering
  req.query = {
    ...req.query,
    teamId: req.tenantContext.teamId,
  };

  next();
}

// Validate tenant limits (e.g., user count, project count)
export async function validateTenantLimits(
  limitType: "users" | "projects" | "deployments",
  maxLimit: number
) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantContext) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const stats = await tenantIsolationService.getTenantStats(req.tenantContext.teamId);
      const currentCount = stats[limitType];

      if (currentCount >= maxLimit) {
        return res.status(403).json({
          error: "Limit exceeded",
          message: `Maximum ${limitType} limit (${maxLimit}) reached for your team`,
          current: currentCount,
          limit: maxLimit,
        });
      }

      next();
    } catch (error) {
      logger.error("Failed to validate tenant limits", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  };
}