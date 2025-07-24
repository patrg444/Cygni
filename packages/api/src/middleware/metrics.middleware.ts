import { Request, Response, NextFunction } from "express";
import onFinished from "on-finished";
import { recordHttpRequest } from "../lib/metrics";

/**
 * Middleware to collect HTTP metrics
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startTime = Date.now();
  
  // Get request size
  const requestSize = req.get("content-length")
    ? parseInt(req.get("content-length")!)
    : undefined;

  // Record metrics when response finishes
  onFinished(res, () => {
    const duration = Date.now() - startTime;
    const responseSize = res.get("content-length")
      ? parseInt(res.get("content-length")!)
      : undefined;

    // Skip metrics endpoint itself to avoid recursion
    if (req.path !== "/metrics") {
      recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration,
        requestSize,
        responseSize,
      );
    }
  });

  next();
}