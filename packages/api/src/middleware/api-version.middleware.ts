import { Request, Response, NextFunction } from "express";
import logger from "../lib/logger";

export interface VersionedRequest extends Request {
  apiVersion?: string;
  supportedVersions?: string[];
}

// API version configuration
export const API_VERSIONS = {
  v1: {
    deprecated: false,
    deprecationDate: null,
    endOfLifeDate: null,
  },
  v2: {
    deprecated: false,
    deprecationDate: null,
    endOfLifeDate: null,
  },
};

export const CURRENT_VERSION = "v2";
export const DEFAULT_VERSION = "v1";

/**
 * Middleware to handle API versioning
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction) {
  const versionedReq = req as VersionedRequest;
  
  // Extract version from URL path (e.g., /api/v1/users)
  const pathMatch = req.path.match(/^\/api\/(v\d+)\//);
  
  if (pathMatch) {
    const version = pathMatch[1];
    versionedReq.apiVersion = version;
    
    // Check if version exists
    if (!API_VERSIONS[version as keyof typeof API_VERSIONS]) {
      return res.status(404).json({
        error: "API version not found",
        message: `Version ${version} is not supported`,
        supportedVersions: Object.keys(API_VERSIONS),
        currentVersion: CURRENT_VERSION,
      });
    }
    
    // Check if version is deprecated
    const versionConfig = API_VERSIONS[version as keyof typeof API_VERSIONS];
    if (versionConfig.deprecated) {
      res.setHeader("X-API-Deprecated", "true");
      if (versionConfig.deprecationDate) {
        res.setHeader("X-API-Deprecation-Date", versionConfig.deprecationDate);
      }
      if (versionConfig.endOfLifeDate) {
        res.setHeader("X-API-End-Of-Life", versionConfig.endOfLifeDate);
      }
      res.setHeader("X-API-Recommended-Version", CURRENT_VERSION);
    }
  } else {
    // No version specified, use default
    versionedReq.apiVersion = DEFAULT_VERSION;
  }
  
  // Add version info to response headers
  res.setHeader("X-API-Version", versionedReq.apiVersion);
  res.setHeader("X-API-Current-Version", CURRENT_VERSION);
  
  // Store supported versions for reference
  versionedReq.supportedVersions = Object.keys(API_VERSIONS);
  
  // Log API version usage
  logger.debug("API request", {
    version: versionedReq.apiVersion,
    path: req.path,
    method: req.method,
  });
  
  next();
}

/**
 * Helper to create version-specific route handlers
 */
export function versionedRoute(
  versions: Record<string, (req: Request, res: Response, next: NextFunction) => void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const versionedReq = req as VersionedRequest;
    const version = versionedReq.apiVersion || DEFAULT_VERSION;
    
    const handler = versions[version] || versions[DEFAULT_VERSION];
    
    if (!handler) {
      return res.status(501).json({
        error: "Not implemented",
        message: `This endpoint is not available in API version ${version}`,
        availableVersions: Object.keys(versions),
      });
    }
    
    handler(req, res, next);
  };
}

/**
 * Middleware to check minimum API version requirement
 */
export function requireMinVersion(minVersion: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const versionedReq = req as VersionedRequest;
    const currentVersion = versionedReq.apiVersion || DEFAULT_VERSION;
    
    // Extract version numbers for comparison
    const current = parseInt(currentVersion.replace("v", ""));
    const minimum = parseInt(minVersion.replace("v", ""));
    
    if (current < minimum) {
      return res.status(400).json({
        error: "API version too old",
        message: `This endpoint requires API version ${minVersion} or higher`,
        currentVersion,
        minimumVersion: minVersion,
      });
    }
    
    next();
  };
}

/**
 * Helper to deprecate an endpoint
 */
export function deprecatedEndpoint(
  message: string,
  alternativeEndpoint?: string,
  removeInVersion?: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-API-Warning", `Deprecated: ${message}`);
    
    if (alternativeEndpoint) {
      res.setHeader("X-API-Alternative", alternativeEndpoint);
    }
    
    if (removeInVersion) {
      res.setHeader("X-API-Remove-In-Version", removeInVersion);
    }
    
    logger.warn("Deprecated endpoint accessed", {
      path: req.path,
      method: req.method,
      message,
      alternativeEndpoint,
      removeInVersion,
    });
    
    next();
  };
}