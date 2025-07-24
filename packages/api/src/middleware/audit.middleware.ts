import { Request, Response, NextFunction } from "express";
import { getAuditLogger, AuditContext } from "../services/audit/audit-logger.service";
import { AuditEventType, ActorType } from "../services/audit/audit-events";
import { PrismaClient } from "@prisma/client";
import logger from "../lib/logger";

const prisma = new PrismaClient();

interface AuditableRequest extends Request {
  user?: {
    id: string;
    email: string;
    teamId: string;
    userId: string;
  };
  auditContext?: AuditContext;
}

// Map of routes to audit events
const routeAuditMap: Record<string, { action: AuditEventType; resourceType: string }> = {
  "POST /api/auth/login": { action: AuditEventType.USER_LOGIN, resourceType: "auth" },
  "POST /api/auth/logout": { action: AuditEventType.USER_LOGOUT, resourceType: "auth" },
  "POST /api/auth/signup": { action: AuditEventType.USER_CREATED, resourceType: "user" },
  "PUT /api/users/:id": { action: AuditEventType.USER_UPDATED, resourceType: "user" },
  "DELETE /api/users/:id": { action: AuditEventType.USER_DELETED, resourceType: "user" },
  "POST /api/teams": { action: AuditEventType.TEAM_CREATED, resourceType: "team" },
  "PUT /api/teams/:id": { action: AuditEventType.TEAM_UPDATED, resourceType: "team" },
  "DELETE /api/teams/:id": { action: AuditEventType.TEAM_DELETED, resourceType: "team" },
  "POST /api/projects": { action: AuditEventType.PROJECT_CREATED, resourceType: "project" },
  "PUT /api/projects/:id": { action: AuditEventType.PROJECT_UPDATED, resourceType: "project" },
  "DELETE /api/projects/:id": { action: AuditEventType.PROJECT_DELETED, resourceType: "project" },
  "POST /api/deployments": { action: AuditEventType.DEPLOYMENT_CREATED, resourceType: "deployment" },
  "POST /api/billing/payment-method": { action: AuditEventType.PAYMENT_METHOD_ADDED, resourceType: "billing" },
  "DELETE /api/billing/payment-method": { action: AuditEventType.PAYMENT_METHOD_REMOVED, resourceType: "billing" },
  "GET /api/export": { action: AuditEventType.DATA_EXPORTED, resourceType: "data" },
};

// Sensitive data fields to exclude from audit logs
const sensitiveFields = new Set([
  "password",
  "token",
  "secret",
  "privateKey",
  "creditCard",
  "cvv",
  "ssn",
]);

function sanitizeData(data: any): any {
  if (!data) return data;
  
  if (typeof data !== "object") return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auditReq = req as AuditableRequest;
  const auditLogger = getAuditLogger(prisma);
  
  // Build audit context
  const context: AuditContext = {
    user: auditReq.user,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
    method: req.method,
    path: req.path,
  };
  
  auditReq.auditContext = context;
  
  // Store original response methods
  const originalJson = res.json;
  const originalSend = res.send;
  const startTime = Date.now();
  
  // Store request body for potential audit
  const requestBody = sanitizeData(req.body);
  
  // Override response methods to capture response data
  res.json = function(data: any) {
    res.locals.responseData = data;
    return originalJson.call(this, data);
  };
  
  res.send = function(data: any) {
    res.locals.responseData = data;
    return originalSend.call(this, data);
  };
  
  // Log response and create audit entry
  res.on("finish", async () => {
    context.statusCode = res.statusCode;
    const duration = Date.now() - startTime;
    
    // Check if this route should be audited
    const routeKey = `${req.method} ${req.route?.path || req.path}`;
    const auditConfig = routeAuditMap[routeKey];
    
    if (auditConfig) {
      try {
        const resourceId = req.params.id || res.locals.resourceId;
        
        await auditLogger.log({
          action: auditConfig.action,
          actorType: auditReq.user ? ActorType.USER : ActorType.SYSTEM,
          resourceType: auditConfig.resourceType,
          resourceId,
          teamId: auditReq.user?.teamId,
          newValues: sanitizeData(res.locals.responseData),
          metadata: {
            duration,
            requestBody: Object.keys(requestBody).length > 0 ? requestBody : undefined,
          },
        }, context);
      } catch (error) {
        logger.error("Failed to create audit log in middleware", { error });
      }
    }
    
    // Log security events
    if (res.statusCode === 401 || res.statusCode === 403) {
      await auditLogger.logSecurityEvent(
        AuditEventType.ACCESS_DENIED,
        context,
        {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
        }
      );
    }
    
    // Log failed login attempts
    if (req.path === "/api/auth/login" && res.statusCode !== 200) {
      await auditLogger.log({
        action: AuditEventType.USER_LOGIN_FAILED,
        actorType: ActorType.USER,
        resourceType: "auth",
        metadata: {
          email: req.body.email,
          reason: res.locals.responseData?.error,
        },
      }, context);
    }
  });
  
  next();
}

// Specialized middleware for sensitive operations
export function auditSensitiveOperation(
  action: AuditEventType,
  resourceType: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auditReq = req as AuditableRequest;
    const auditLogger = getAuditLogger(prisma);
    
    // Log before the operation
    await auditLogger.log({
      action,
      actorType: auditReq.user ? ActorType.USER : ActorType.SYSTEM,
      resourceType,
      resourceId: req.params.id,
      teamId: auditReq.user?.teamId,
      metadata: {
        operation: "started",
        requestBody: sanitizeData(req.body),
      },
    }, auditReq.auditContext);
    
    next();
  };
}

// Helper function to manually log audit events
export async function logAuditEvent(
  action: AuditEventType,
  resourceType: string,
  resourceId: string | undefined,
  context: AuditContext,
  additionalData?: {
    oldValues?: any;
    newValues?: any;
    metadata?: any;
  }
): Promise<void> {
  const auditLogger = getAuditLogger(prisma);
  
  await auditLogger.log({
    action,
    actorType: context.user ? ActorType.USER : ActorType.SYSTEM,
    resourceType,
    resourceId,
    teamId: context.user?.teamId,
    oldValues: sanitizeData(additionalData?.oldValues),
    newValues: sanitizeData(additionalData?.newValues),
    metadata: additionalData?.metadata,
  }, context);
}