import rateLimit, { RateLimitRequestHandler, Options } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Request, Response } from "express";
import { getRedisClient } from "../../lib/redis";
import { rateLimitTiers, endpointLimits, ipRateLimits, burstLimits } from "./rate-limit-config";
import logger from "../../lib/logger";
import { recordError, recordRateLimit } from "../../lib/metrics";

interface AuthenticatedRequest extends Request {
  user?: {
    teamId: string;
    userId: string;
    email: string;
  };
  team?: {
    planId: string;
  };
}

export class RateLimiterService {
  private limiters: Map<string, RateLimitRequestHandler> = new Map();
  
  constructor() {
    this.initializeLimiters();
  }

  private initializeLimiters(): void {
    try {
      const redisClient = getRedisClient();

      // Create limiters for each tier
      Object.entries(rateLimitTiers).forEach(([tier, config]) => {
        const limiter = this.createLimiter({
          ...config,
          keyGenerator: (req: Request) => this.generateKey(req as AuthenticatedRequest, tier),
          store: new RedisStore({
            client: redisClient,
            prefix: `rate-limit:${tier}:`,
          }),
        });
        this.limiters.set(tier, limiter);
      });

      // Create burst limiters
      Object.entries(burstLimits).forEach(([tier, config]) => {
        const limiter = this.createLimiter({
          ...config,
          keyGenerator: (req: Request) => this.generateKey(req as AuthenticatedRequest, tier),
          store: new RedisStore({
            client: redisClient,
            prefix: `rate-limit:burst:${tier}:`,
          }),
        });
        this.limiters.set(`burst:${tier}`, limiter);
      });

      // IP-based limiter for unauthenticated requests
      const ipLimiter = this.createLimiter({
        ...ipRateLimits,
        keyGenerator: (req: Request) => req.ip || "unknown",
        store: new RedisStore({
          client: redisClient,
          prefix: "rate-limit:ip:",
        }),
      });
      this.limiters.set("ip", ipLimiter);

      // Endpoint-specific limiters
      Object.entries(endpointLimits).forEach(([endpoint, config]) => {
        const limiter = this.createLimiter({
          windowMs: config.windowMs!,
          max: config.max!,
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: (req: Request) => {
            const authReq = req as AuthenticatedRequest;
            return authReq.user ? `${endpoint}:${authReq.user.teamId}` : `${endpoint}:${req.ip}`;
          },
          store: new RedisStore({
            client: redisClient,
            prefix: `rate-limit:endpoint:`,
          }),
        });
        this.limiters.set(`endpoint:${endpoint}`, limiter);
      });

      logger.info("Rate limiters initialized", {
        tiers: Object.keys(rateLimitTiers),
        endpoints: Object.keys(endpointLimits),
      });
    } catch (error) {
      logger.error("Failed to initialize rate limiters", { error });
      throw error;
    }
  }

  private createLimiter(options: Partial<Options>): RateLimitRequestHandler {
    return rateLimit({
      ...options,
      handler: (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const tier = authReq.team?.planId || "free";
        
        logger.warn("Rate limit exceeded", {
          ip: req.ip,
          path: req.path,
          userId: authReq.user?.userId,
          teamId: authReq.user?.teamId,
          tier,
        });
        
        recordError("rate_limit_exceeded", "warning");
        recordRateLimit(tier, req.path, true, authReq.user?.teamId, req.ip);
        
        res.status(429).json({
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: res.getHeader("Retry-After"),
        });
      },
      skip: (req: Request) => {
        // Skip rate limiting for internal services
        const authToken = req.headers["x-internal-token"];
        if (authToken === process.env.INTERNAL_API_TOKEN) {
          return true;
        }
        
        // Skip for health checks
        if (req.path === "/api/health" || req.path === "/metrics") {
          return true;
        }
        
        return false;
      },
    } as Options);
  }

  private generateKey(req: AuthenticatedRequest, tier: string): string {
    // Use team ID for authenticated requests
    if (req.user && req.user.teamId) {
      return `team:${req.user.teamId}`;
    }
    
    // Use IP for unauthenticated requests
    return `ip:${req.ip || "unknown"}`;
  }

  public getMiddleware(): RateLimitRequestHandler {
    return async (req: Request, res: Response, next: Function) => {
      const authReq = req as AuthenticatedRequest;
      
      try {
        // Check endpoint-specific limits first
        const endpointLimiter = this.limiters.get(`endpoint:${req.path}`);
        if (endpointLimiter) {
          return endpointLimiter(req, res, () => this.checkTierLimits(req, res, next));
        }
        
        // Check tier limits
        return this.checkTierLimits(req, res, next);
      } catch (error) {
        logger.error("Rate limiter error", { error });
        // Fail open - allow request if rate limiter fails
        next();
      }
    };
  }

  private async checkTierLimits(req: Request, res: Response, next: Function): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    
    // Determine the rate limit tier
    let tier = "free"; // Default tier
    
    if (authReq.user && authReq.team) {
      tier = authReq.team.planId || "free";
    } else if (!authReq.user) {
      // Use IP-based rate limiting for unauthenticated requests
      const ipLimiter = this.limiters.get("ip");
      if (ipLimiter) {
        return ipLimiter(req, res, next);
      }
    }
    
    // Apply both regular and burst limits
    const regularLimiter = this.limiters.get(tier);
    const burstLimiter = this.limiters.get(`burst:${tier}`);
    
    if (regularLimiter && burstLimiter) {
      // Check burst limit first (stricter)
      burstLimiter(req, res, (burstErr?: any) => {
        if (burstErr) return;
        // Then check regular limit
        regularLimiter(req, res, next);
      });
    } else if (regularLimiter) {
      regularLimiter(req, res, next);
    } else {
      // No limiter found, allow request
      next();
    }
  }

  public async getRateLimitInfo(teamId: string, tier: string): Promise<{
    limit: number;
    remaining: number;
    reset: Date;
  }> {
    const redisClient = getRedisClient();
    const key = `rate-limit:${tier}:team:${teamId}`;
    
    try {
      const count = await redisClient.get(key);
      const ttl = await redisClient.ttl(key);
      const config = rateLimitTiers[tier] || rateLimitTiers.free;
      
      const used = parseInt(count || "0", 10);
      const limit = config.max;
      const remaining = Math.max(0, limit - used);
      const reset = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs));
      
      return { limit, remaining, reset };
    } catch (error) {
      logger.error("Failed to get rate limit info", { error, teamId, tier });
      throw error;
    }
  }

  public async resetRateLimit(teamId: string, tier?: string): Promise<void> {
    const redisClient = getRedisClient();
    const tierToReset = tier || "*";
    const pattern = `rate-limit:${tierToReset}:team:${teamId}`;
    
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.info("Rate limit reset", { teamId, tier: tierToReset, keysDeleted: keys.length });
      }
    } catch (error) {
      logger.error("Failed to reset rate limit", { error, teamId, tier });
      throw error;
    }
  }
}

// Export singleton instance
export const rateLimiterService = new RateLimiterService();