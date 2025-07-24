export interface RateLimitTier {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export interface RateLimitConfig {
  [key: string]: RateLimitTier;
}

// Rate limit tiers by subscription plan
export const rateLimitTiers: RateLimitConfig = {
  // Free tier: 100 requests per 15 minutes
  free: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Starter tier: 1000 requests per 15 minutes
  starter: {
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Pro tier: 5000 requests per 15 minutes
  pro: {
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Enterprise tier: 20000 requests per 15 minutes
  enterprise: {
    windowMs: 15 * 60 * 1000,
    max: 20000,
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Internal services: No limit
  internal: {
    windowMs: 15 * 60 * 1000,
    max: 0, // 0 means unlimited
    standardHeaders: true,
    legacyHeaders: false,
  },
};

// Endpoint-specific rate limits (stricter limits for expensive operations)
export const endpointLimits: Record<string, Partial<RateLimitTier>> = {
  "/api/auth/signup": {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 signups per hour
  },
  "/api/auth/login": {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 minutes
  },
  "/api/deployments": {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 deployments per hour
  },
  "/api/payments": {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 payment attempts per hour
  },
  "/api/export": {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 10, // 10 exports per day
  },
};

// IP-based rate limits for unauthenticated endpoints
export const ipRateLimits: RateLimitTier = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per IP for unauthenticated requests
  standardHeaders: true,
  legacyHeaders: false,
};

// Burst limits for short-term spikes
export const burstLimits: Record<string, RateLimitTier> = {
  free: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute burst
    standardHeaders: true,
    legacyHeaders: false,
  },
  starter: {
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  },
  pro: {
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  },
  enterprise: {
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  },
};