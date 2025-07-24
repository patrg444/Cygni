import Redis from "ioredis";
import { createHash } from "crypto";
import logger from "../../lib/logger";
import { trackCacheOperation } from "../../lib/performance";

export interface TenantCacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string; // Cache namespace
  version?: string; // Cache version for invalidation
}

export class TenantCacheService {
  private redis: Redis | null;
  private localCache: Map<string, { value: any; expires: number }>;
  private defaultTTL: number = 300; // 5 minutes
  private maxLocalCacheSize: number = 1000;

  constructor(redisUrl?: string) {
    // Initialize Redis if URL provided
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 100, 3000);
          },
        });

        this.redis.on("error", (error) => {
          logger.error("Redis connection error", { error });
        });

        this.redis.on("connect", () => {
          logger.info("Redis connected for tenant cache");
        });
      } catch (error) {
        logger.error("Failed to initialize Redis", { error });
        this.redis = null;
      }
    } else {
      this.redis = null;
    }

    // Initialize local cache as fallback
    this.localCache = new Map();

    // Periodic cleanup of expired local cache entries
    setInterval(() => this.cleanupLocalCache(), 60000); // Every minute
  }

  // Generate tenant-specific cache key
  private generateKey(
    teamId: string,
    key: string,
    namespace?: string,
    version?: string
  ): string {
    const parts = ["tenant", teamId];
    
    if (namespace) parts.push(namespace);
    if (version) parts.push(`v${version}`);
    parts.push(key);

    return parts.join(":");
  }

  // Get value from cache
  async get<T>(
    teamId: string,
    key: string,
    options?: TenantCacheOptions
  ): Promise<T | null> {
    const cacheKey = this.generateKey(
      teamId,
      key,
      options?.namespace,
      options?.version
    );

    try {
      // Try Redis first
      if (this.redis) {
        const value = await this.redis.get(cacheKey);
        if (value) {
          logger.debug("Cache hit (Redis)", { teamId, key });
          trackCacheOperation("get", true);
          return JSON.parse(value);
        }
      }

      // Fallback to local cache
      const localEntry = this.localCache.get(cacheKey);
      if (localEntry && localEntry.expires > Date.now()) {
        logger.debug("Cache hit (local)", { teamId, key });
        trackCacheOperation("get", true);
        return localEntry.value;
      }

      logger.debug("Cache miss", { teamId, key });
      trackCacheOperation("get", false);
      return null;
    } catch (error) {
      logger.error("Cache get error", { error, teamId, key });
      return null;
    }
  }

  // Set value in cache
  async set<T>(
    teamId: string,
    key: string,
    value: T,
    options?: TenantCacheOptions
  ): Promise<void> {
    const cacheKey = this.generateKey(
      teamId,
      key,
      options?.namespace,
      options?.version
    );
    const ttl = options?.ttl || this.defaultTTL;

    try {
      // Store in Redis if available
      if (this.redis) {
        await this.redis.set(
          cacheKey,
          JSON.stringify(value),
          "EX",
          ttl
        );
      }

      // Also store in local cache
      this.localCache.set(cacheKey, {
        value,
        expires: Date.now() + ttl * 1000,
      });

      // Enforce local cache size limit
      if (this.localCache.size > this.maxLocalCacheSize) {
        this.evictOldestLocalCache();
      }

      logger.debug("Cache set", { teamId, key, ttl });
    } catch (error) {
      logger.error("Cache set error", { error, teamId, key });
    }
  }

  // Delete value from cache
  async delete(
    teamId: string,
    key: string,
    options?: TenantCacheOptions
  ): Promise<void> {
    const cacheKey = this.generateKey(
      teamId,
      key,
      options?.namespace,
      options?.version
    );

    try {
      if (this.redis) {
        await this.redis.del(cacheKey);
      }
      this.localCache.delete(cacheKey);
      logger.debug("Cache delete", { teamId, key });
    } catch (error) {
      logger.error("Cache delete error", { error, teamId, key });
    }
  }

  // Clear all cache for a tenant
  async clearTenant(teamId: string): Promise<void> {
    const pattern = `tenant:${teamId}:*`;

    try {
      if (this.redis) {
        // Use SCAN to find and delete keys (safe for production)
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100,
        });

        const pipeline = this.redis.pipeline();
        let count = 0;

        stream.on("data", (keys) => {
          if (keys.length) {
            keys.forEach((key: string) => pipeline.del(key));
            count += keys.length;
          }
        });

        await new Promise((resolve, reject) => {
          stream.on("end", resolve);
          stream.on("error", reject);
        });

        await pipeline.exec();
        logger.info("Cleared tenant cache", { teamId, keysDeleted: count });
      }

      // Clear local cache for tenant
      const keysToDelete: string[] = [];
      for (const key of this.localCache.keys()) {
        if (key.startsWith(`tenant:${teamId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.localCache.delete(key));
    } catch (error) {
      logger.error("Failed to clear tenant cache", { error, teamId });
    }
  }

  // Clear cache by namespace
  async clearNamespace(
    teamId: string,
    namespace: string
  ): Promise<void> {
    const pattern = `tenant:${teamId}:${namespace}:*`;

    try {
      if (this.redis) {
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100,
        });

        const pipeline = this.redis.pipeline();

        stream.on("data", (keys) => {
          if (keys.length) {
            keys.forEach((key: string) => pipeline.del(key));
          }
        });

        await new Promise((resolve, reject) => {
          stream.on("end", resolve);
          stream.on("error", reject);
        });

        await pipeline.exec();
      }

      // Clear local cache for namespace
      const keysToDelete: string[] = [];
      for (const key of this.localCache.keys()) {
        if (key.includes(`:${namespace}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.localCache.delete(key));

      logger.debug("Cleared namespace cache", { teamId, namespace });
    } catch (error) {
      logger.error("Failed to clear namespace cache", { error, teamId, namespace });
    }
  }

  // Cache with automatic refresh (cache-aside pattern)
  async getOrSet<T>(
    teamId: string,
    key: string,
    factory: () => Promise<T>,
    options?: TenantCacheOptions
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(teamId, key, options);
    if (cached !== null) {
      return cached;
    }

    // Generate fresh value
    const value = await factory();

    // Store in cache
    await this.set(teamId, key, value, options);

    return value;
  }

  // Implement cache warming for frequently accessed data
  async warmCache(
    teamId: string,
    items: Array<{
      key: string;
      factory: () => Promise<any>;
      options?: TenantCacheOptions;
    }>
  ): Promise<void> {
    const promises = items.map(item =>
      this.getOrSet(teamId, item.key, item.factory, item.options)
        .catch(error => {
          logger.error("Cache warming error", {
            teamId,
            key: item.key,
            error,
          });
        })
    );

    await Promise.all(promises);
    logger.info("Cache warming completed", {
      teamId,
      itemCount: items.length,
    });
  }

  // Get cache statistics for a tenant
  async getStats(teamId: string): Promise<{
    keys: number;
    memoryUsage?: number;
  }> {
    const pattern = `tenant:${teamId}:*`;
    let keyCount = 0;

    try {
      if (this.redis) {
        // Count keys using SCAN
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100,
        });

        await new Promise((resolve, reject) => {
          stream.on("data", (keys) => {
            keyCount += keys.length;
          });
          stream.on("end", resolve);
          stream.on("error", reject);
        });

        // Get memory usage if available
        try {
          const info = await this.redis.info("memory");
          const usedMemory = info.match(/used_memory:(\d+)/)?.[1];
          
          return {
            keys: keyCount,
            memoryUsage: usedMemory ? parseInt(usedMemory) : undefined,
          };
        } catch {
          return { keys: keyCount };
        }
      }

      // Count local cache keys
      for (const key of this.localCache.keys()) {
        if (key.startsWith(`tenant:${teamId}:`)) {
          keyCount++;
        }
      }

      return { keys: keyCount };
    } catch (error) {
      logger.error("Failed to get cache stats", { error, teamId });
      return { keys: 0 };
    }
  }

  // Generate cache key for complex objects
  generateObjectKey(obj: any): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(obj));
    return hash.digest("hex").substring(0, 16);
  }

  // Clean up expired entries from local cache
  private cleanupLocalCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.localCache.entries()) {
      if (entry.expires <= now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.localCache.delete(key));

    if (keysToDelete.length > 0) {
      logger.debug("Cleaned up local cache", {
        entriesRemoved: keysToDelete.length,
      });
    }
  }

  // Evict oldest entries when cache is full
  private evictOldestLocalCache(): void {
    const entriesToRemove = Math.floor(this.maxLocalCacheSize * 0.1); // Remove 10%
    const entries = Array.from(this.localCache.entries())
      .sort((a, b) => a[1].expires - b[1].expires);

    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      this.localCache.delete(entries[i][0]);
    }

    logger.debug("Evicted oldest cache entries", {
      entriesRemoved: Math.min(entriesToRemove, entries.length),
    });
  }

  // Close Redis connection
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      logger.info("Redis connection closed");
    }
  }
}

// Singleton instance
let tenantCacheService: TenantCacheService;

export function getTenantCacheService(): TenantCacheService {
  if (!tenantCacheService) {
    tenantCacheService = new TenantCacheService(process.env.REDIS_URL);
  }
  return tenantCacheService;
}