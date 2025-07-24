import { Router, Request, Response } from "express";
import { jwtMiddleware, jwtService } from "./auth";
import { rateLimiterService } from "../services/rate-limit/rate-limiter.service";
import { rateLimitTiers } from "../services/rate-limit/rate-limit-config";
import logger from "../lib/logger";

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    teamId: string;
    userId: string;
    email: string;
    role: string;
  };
  team?: {
    id: string;
    planId: string;
  };
}

// GET /api/rate-limit/status - Get current rate limit status
router.get(
  "/rate-limit/status",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const tier = authReq.team?.planId || "free";
      const info = await rateLimiterService.getRateLimitInfo(authReq.user!.teamId, tier);
      
      res.json({
        tier,
        limit: info.limit,
        remaining: info.remaining,
        reset: info.reset,
        window: rateLimitTiers[tier]?.windowMs || rateLimitTiers.free.windowMs,
      });
    } catch (error) {
      logger.error("Failed to get rate limit status", { error });
      res.status(500).json({ error: "Failed to get rate limit status" });
    }
  }
);

// GET /api/rate-limit/tiers - Get all available rate limit tiers
router.get("/rate-limit/tiers", async (_req: Request, res: Response) => {
  const tiers = Object.entries(rateLimitTiers)
    .filter(([name]) => name !== "internal")
    .map(([name, config]) => ({
      name,
      limit: config.max,
      window: config.windowMs,
      windowMinutes: config.windowMs / 1000 / 60,
      requestsPerMinute: Math.round(config.max / (config.windowMs / 1000 / 60)),
    }));
  
  res.json({ tiers });
});

// POST /api/rate-limit/reset - Reset rate limit (admin only)
router.post(
  "/rate-limit/reset",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    // Only allow admins to reset rate limits
    if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    
    try {
      const { teamId, tier } = req.body;
      
      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      
      await rateLimiterService.resetRateLimit(teamId, tier);
      
      logger.info("Rate limit reset", {
        teamId,
        tier,
        resetBy: authReq.user.email,
      });
      
      res.json({ message: "Rate limit reset successfully" });
    } catch (error) {
      logger.error("Failed to reset rate limit", { error });
      res.status(500).json({ error: "Failed to reset rate limit" });
    }
  }
);

export { router as rateLimitRouter };