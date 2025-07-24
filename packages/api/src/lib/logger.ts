import winston from "winston";
import { v4 as uuidv4 } from "uuid";
import { Request } from "express";

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

// Tell winston about our colors
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Define transports
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, ...metadata }) => {
          let msg = `${timestamp} [${level}] ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        }),
      ),
    }),
  );
} else {
  // Production console transport - JSON only
  transports.push(new winston.transports.Console());
}

// File transports
if (process.env.LOG_FILE_ENABLED === "true") {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  format,
  transports,
  exitOnError: false,
});

// Add request context
export interface LogContext {
  requestId?: string;
  userId?: string;
  teamId?: string;
  projectId?: string;
  deploymentId?: string;
  service?: string;
  environment?: string;
  region?: string;
  [key: string]: any;
}

// Create child logger with context
export function createLogger(context: LogContext) {
  return logger.child(context);
}

// Request-scoped logger
export function createRequestLogger(req: Request & { user?: any }) {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();
  
  const context: LogContext = {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers["user-agent"],
  };

  if (req.user) {
    context.userId = req.user.userId;
    context.teamId = req.user.teamId;
    context.userEmail = req.user.email;
    context.userRole = req.user.role;
  }

  // Attach request ID to response headers
  if (req.res) {
    req.res.setHeader("X-Request-ID", requestId);
  }

  return createLogger(context);
}

// Log levels helper
export const LogLevel = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  HTTP: "http",
  DEBUG: "debug",
} as const;

// Structured log helpers
export function logError(error: Error, context?: LogContext) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  };

  logger.error("Error occurred", errorInfo);
}

export function logHttpRequest(
  req: Request,
  res: any,
  responseTime: number,
  context?: LogContext,
) {
  const httpInfo = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    contentLength: res.get("content-length"),
    ...context,
  };

  // Log level based on status code
  if (res.statusCode >= 500) {
    logger.error("HTTP request failed", httpInfo);
  } else if (res.statusCode >= 400) {
    logger.warn("HTTP request client error", httpInfo);
  } else {
    logger.http("HTTP request completed", httpInfo);
  }
}

export function logDatabaseQuery(
  operation: string,
  model: string,
  duration: number,
  context?: LogContext,
) {
  const dbInfo = {
    operation,
    model,
    duration: `${duration}ms`,
    slow: duration > 1000, // Flag slow queries
    ...context,
  };

  if (duration > 1000) {
    logger.warn("Slow database query", dbInfo);
  } else {
    logger.debug("Database query", dbInfo);
  }
}

export function logServiceCall(
  service: string,
  method: string,
  duration: number,
  success: boolean,
  context?: LogContext,
) {
  const serviceInfo = {
    service,
    method,
    duration: `${duration}ms`,
    success,
    ...context,
  };

  if (!success || duration > 5000) {
    logger.warn("Service call issue", serviceInfo);
  } else {
    logger.debug("Service call completed", serviceInfo);
  }
}

export function logMetric(
  name: string,
  value: number,
  unit: string,
  tags?: Record<string, string>,
  context?: LogContext,
) {
  const metricInfo = {
    metric: name,
    value,
    unit,
    tags,
    ...context,
  };

  logger.info("Metric recorded", metricInfo);
}

export function logDeployment(
  action: string,
  status: string,
  details: any,
  context?: LogContext,
) {
  const deploymentInfo = {
    deploymentAction: action,
    deploymentStatus: status,
    ...details,
    ...context,
  };

  if (status === "failed") {
    logger.error("Deployment failed", deploymentInfo);
  } else {
    logger.info("Deployment event", deploymentInfo);
  }
}

export function logBilling(
  event: string,
  amount?: number,
  currency?: string,
  details?: any,
  context?: LogContext,
) {
  const billingInfo = {
    billingEvent: event,
    amount,
    currency,
    ...details,
    ...context,
  };

  logger.info("Billing event", billingInfo);
}

export function logSecurity(
  event: string,
  severity: "low" | "medium" | "high" | "critical",
  details: any,
  context?: LogContext,
) {
  const securityInfo = {
    securityEvent: event,
    severity,
    ...details,
    ...context,
  };

  if (severity === "critical" || severity === "high") {
    logger.error("Security event", securityInfo);
  } else {
    logger.warn("Security event", securityInfo);
  }
}

// Export main logger instance
export default logger;