import { Request, Response, NextFunction } from "express";
import onFinished from "on-finished";
import { createRequestLogger, logHttpRequest } from "../lib/logger";
import { captureException } from "../lib/sentry";

// Extend Request type to include logger
declare global {
  namespace Express {
    interface Request {
      logger?: ReturnType<typeof createRequestLogger>;
      startTime?: number;
    }
  }
}

/**
 * Request logging middleware
 * Adds logger to request object and logs HTTP requests
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Start time for response time calculation
  req.startTime = Date.now();

  // Create request-scoped logger
  req.logger = createRequestLogger(req);

  // Log request start
  req.logger.debug("Request started", {
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Log when response finishes
  onFinished(res, () => {
    const responseTime = Date.now() - (req.startTime || Date.now());
    logHttpRequest(req, res, responseTime);
  });

  next();
}

/**
 * Error logging middleware
 * Logs errors with full context
 */
export function errorLoggingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const logger = req.logger || createRequestLogger(req);

  logger.error("Unhandled error", {
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      query: req.query,
    },
  });

  // Send error to Sentry with context
  const authReq = req as any;
  captureException(err, {
    user: authReq.user ? {
      id: authReq.user.userId || authReq.user.id,
      email: authReq.user.email,
    } : undefined,
    tags: {
      endpoint: req.path,
      method: req.method,
    },
    extra: {
      requestId: req.headers["x-request-id"],
      teamId: authReq.user?.teamId,
      query: req.query,
      params: req.params,
    },
  });

  next(err);
}

/**
 * Performance logging middleware
 * Logs slow requests and endpoints
 */
export function performanceLoggingMiddleware(threshold: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const logger = req.logger || createRequestLogger(req);
    const startTime = process.hrtime.bigint();

    // Override res.json to log response data in development
    if (process.env.NODE_ENV === "development") {
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
        
        if (duration > threshold) {
          logger.warn("Slow endpoint", {
            duration: `${duration.toFixed(2)}ms`,
            threshold: `${threshold}ms`,
            responseSize: JSON.stringify(body).length,
          });
        }

        logger.debug("Response sent", {
          duration: `${duration.toFixed(2)}ms`,
          statusCode: res.statusCode,
        });

        return originalJson(body);
      };
    }

    next();
  };
}

/**
 * Database query logging middleware
 * Logs all Prisma queries in development
 */
export function databaseLoggingMiddleware(prisma: any) {
  if (process.env.NODE_ENV === "development" || process.env.LOG_DB_QUERIES === "true") {
    prisma.$use(async (params: any, next: any) => {
      const startTime = Date.now();
      const result = await next(params);
      const duration = Date.now() - startTime;

      // Get request context if available
      const context = (global as any).currentRequestContext || {};

      if (duration > 100) {
        const logger = createRequestLogger(context);
        logger.warn("Slow database query", {
          model: params.model,
          action: params.action,
          duration: `${duration}ms`,
          args: params.args,
        });
      }

      return result;
    });
  }
}

/**
 * Security event logging
 * Logs authentication and authorization events
 */
export function securityLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const logger = req.logger || createRequestLogger(req);

  // Log authentication attempts
  if (req.path === "/api/auth/login" && req.method === "POST") {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode === 200) {
        logger.info("Successful login", {
          email: req.body.email,
          ip: req.ip,
        });
      } else {
        logger.warn("Failed login attempt", {
          email: req.body.email,
          ip: req.ip,
          reason: body.error,
        });
      }
      return originalJson(body);
    };
  }

  // Log authorization failures
  if (res.statusCode === 403) {
    logger.warn("Authorization denied", {
      userId: (req as any).user?.userId,
      resource: req.path,
    });
  }

  next();
}

/**
 * Deployment event logging
 * Logs deployment lifecycle events
 */
export function deploymentLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const logger = req.logger || createRequestLogger(req);

  // Check if this is a deployment-related endpoint
  if (req.path.includes("/deploy") || req.path.includes("/projects")) {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (req.method === "POST" && res.statusCode === 200) {
        logger.info("Deployment created", {
          projectId: body.projectId || req.params.projectId,
          deploymentId: body.deploymentId,
          provider: req.body.provider,
          region: req.body.region,
        });
      }
      return originalJson(body);
    };
  }

  next();
}