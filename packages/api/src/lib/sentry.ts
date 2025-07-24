import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import { Express } from "express";
import logger from "./logger";

export interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  debug?: boolean;
}

export function initializeSentry(app: Express): void {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    logger.info("Sentry DSN not configured, error tracking disabled");
    return;
  }

  const environment = process.env.NODE_ENV || "development";
  const isProduction = environment === "production";

  Sentry.init({
    dsn,
    environment,
    integrations: [
      // Express integration
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      // Profiling integration
      new ProfilingIntegration(),
      // Prisma integration
      new Sentry.Integrations.Prisma({ client: true }),
    ],
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in dev
    profilesSampleRate: isProduction ? 0.1 : 1.0,
    debug: !isProduction,
    
    beforeSend(event, hint) {
      // Filter out sensitive data
      if (event.request) {
        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers["x-api-key"];
        }
        
        // Remove sensitive body data
        if (event.request.data) {
          const data = event.request.data as any;
          if (data.password) data.password = "[REDACTED]";
          if (data.token) data.token = "[REDACTED]";
          if (data.apiKey) data.apiKey = "[REDACTED]";
          if (data.creditCard) data.creditCard = "[REDACTED]";
        }
      }
      
      // Filter out non-error events in production
      if (isProduction && (!hint.originalException || !isError(hint.originalException))) {
        return null;
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      // Browser errors
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      // Network errors
      "Network request failed",
      "NetworkError",
      "Failed to fetch",
      // Common client errors
      "InvalidStateError",
      "AbortError",
    ],
    
    // Configure integrations
    integrations: (integrations) => {
      // Remove default integrations we don't need
      return integrations.filter((integration) => {
        return integration.name !== "OnUncaughtException";
      });
    },
  });

  // Set initial user context
  Sentry.configureScope((scope) => {
    scope.setTag("service", "api");
    scope.setTag("version", process.env.npm_package_version || "unknown");
  });

  logger.info("Sentry error tracking initialized", {
    environment,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
  });
}

// Helper to check if value is an Error
function isError(value: unknown): value is Error {
  return value instanceof Error || 
    (value !== null && 
     typeof value === "object" && 
     "message" in value && 
     "stack" in value);
}

// Express middleware for Sentry
export function getSentryHandlers() {
  return {
    requestHandler: Sentry.Handlers.requestHandler(),
    tracingHandler: Sentry.Handlers.tracingHandler(),
    errorHandler: Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Capture all 4xx and 5xx errors
        if (error.status && error.status >= 400) {
          return true;
        }
        // Capture all unhandled errors
        return true;
      },
    }),
  };
}

// Utility to capture custom events
export function captureEvent(
  message: string,
  level: Sentry.SeverityLevel = "info",
  extra?: Record<string, any>
): void {
  Sentry.captureMessage(message, {
    level,
    extra,
  });
}

// Utility to capture exceptions with context
export function captureException(
  error: Error,
  context?: {
    user?: { id: string; email: string };
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
): void {
  Sentry.withScope((scope) => {
    if (context?.user) {
      scope.setUser({
        id: context.user.id,
        email: context.user.email,
      });
    }
    
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    
    Sentry.captureException(error);
  });
}

// Performance monitoring utilities
export function startTransaction(
  name: string,
  op: string
): Sentry.Transaction {
  return Sentry.startTransaction({
    name,
    op,
  });
}

export function measurePerformance<T>(
  name: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const transaction = startTransaction(name, operation);
  
  return fn()
    .then((result) => {
      transaction.setStatus("ok");
      return result;
    })
    .catch((error) => {
      transaction.setStatus("internal_error");
      throw error;
    })
    .finally(() => {
      transaction.finish();
    });
}