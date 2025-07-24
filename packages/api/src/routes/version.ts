import { Router, Request, Response } from "express";
import { API_VERSIONS, CURRENT_VERSION, DEFAULT_VERSION } from "../middleware/api-version.middleware";

const router = Router();

// GET /api/versions - Get API version information
router.get("/versions", (req: Request, res: Response) => {
  const versions = Object.entries(API_VERSIONS).map(([version, config]) => ({
    version,
    ...config,
    current: version === CURRENT_VERSION,
    default: version === DEFAULT_VERSION,
  }));
  
  res.json({
    currentVersion: CURRENT_VERSION,
    defaultVersion: DEFAULT_VERSION,
    versions,
    deprecationPolicy: {
      notice: "Deprecated versions will be supported for at least 6 months after deprecation",
      process: [
        "1. Version marked as deprecated with advance notice",
        "2. Deprecation warnings added to API responses",
        "3. End-of-life date announced at least 3 months in advance",
        "4. Version removed after end-of-life date",
      ],
    },
    migrationGuides: {
      v1_to_v2: "https://docs.cygni.dev/api/migration/v1-to-v2",
    },
  });
});

// GET /api/version - Get current API version for this request
router.get("/version", (req: Request, res: Response) => {
  const apiVersion = (req as any).apiVersion || DEFAULT_VERSION;
  
  res.json({
    version: apiVersion,
    current: apiVersion === CURRENT_VERSION,
    deprecated: API_VERSIONS[apiVersion as keyof typeof API_VERSIONS]?.deprecated || false,
  });
});

export { router as versionRouter };