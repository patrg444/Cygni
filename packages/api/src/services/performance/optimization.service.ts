import { PrismaClient } from "@prisma/client";
import { performanceMonitor } from "../../lib/performance";
import logger from "../../lib/logger";
import { getRedisClient } from "../../lib/redis";

export class OptimizationService {
  private prisma: PrismaClient;
  private redis: ReturnType<typeof getRedisClient> | null;
  
  // Query result cache
  private queryCache = new Map<string, { result: any; timestamp: number }>();
  private queryCacheTTL = 60000; // 1 minute
  
  // Connection pooling stats
  private connectionStats = {
    active: 0,
    idle: 0,
    waiting: 0,
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    
    try {
      this.redis = getRedisClient();
    } catch {
      this.redis = null;
      logger.warn("Redis not available for optimization service");
    }
    
    this.startOptimizationTasks();
  }

  private startOptimizationTasks(): void {
    // Periodic cache cleanup
    setInterval(() => this.cleanupQueryCache(), 300000); // 5 minutes
    
    // Connection pool monitoring
    setInterval(() => this.monitorConnectionPool(), 30000); // 30 seconds
    
    // Automatic query optimization suggestions
    setInterval(() => this.analyzeSlowQueries(), 600000); // 10 minutes
  }

  // Optimize database queries with caching
  async cachedQuery<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttl: number = this.queryCacheTTL
  ): Promise<T> {
    // Check memory cache first
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      logger.debug("Query cache hit (memory)", { key });
      return cached.result;
    }
    
    // Check Redis cache if available
    if (this.redis) {
      try {
        const redisCached = await this.redis.get(`query:${key}`);
        if (redisCached) {
          logger.debug("Query cache hit (Redis)", { key });
          const result = JSON.parse(redisCached);
          // Update memory cache
          this.queryCache.set(key, { result, timestamp: Date.now() });
          return result;
        }
      } catch (error) {
        logger.error("Redis cache error", { error, key });
      }
    }
    
    // Execute query with performance tracking
    const result = await performanceMonitor.trackAsyncOperation(
      `query.${key}`,
      queryFn,
      { cacheKey: key }
    );
    
    // Cache result
    this.queryCache.set(key, { result, timestamp: Date.now() });
    
    if (this.redis) {
      try {
        await this.redis.setex(
          `query:${key}`,
          Math.floor(ttl / 1000),
          JSON.stringify(result)
        );
      } catch (error) {
        logger.error("Failed to cache in Redis", { error, key });
      }
    }
    
    return result;
  }

  // Batch database operations
  async batchOperation<T, R>(
    items: T[],
    operation: (batch: T[]) => Promise<R[]>,
    batchSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await performanceMonitor.trackAsyncOperation(
        "batch.operation",
        () => operation(batch),
        { batchSize: batch.length, batchIndex: i / batchSize }
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  // Optimize pagination with cursor-based approach
  async *cursorPaginate<T>(
    model: any,
    pageSize: number = 100,
    where?: any
  ): AsyncGenerator<T[], void, unknown> {
    let cursor: string | undefined;
    let hasMore = true;
    
    while (hasMore) {
      const stopTracking = performanceMonitor.startMeasure("cursor.pagination");
      
      const items = await model.findMany({
        where,
        take: pageSize + 1, // Fetch one extra to check if there's more
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: "asc" },
      });
      
      stopTracking();
      
      hasMore = items.length > pageSize;
      const page = hasMore ? items.slice(0, -1) : items;
      
      if (page.length > 0) {
        cursor = page[page.length - 1].id;
        yield page;
      } else {
        hasMore = false;
      }
    }
  }

  // Connection pool optimization
  private async monitorConnectionPool(): Promise<void> {
    try {
      // Get connection pool metrics from Prisma
      const metrics = await this.prisma.$metrics.json();
      
      const poolMetrics = metrics.counters.find(
        (m: any) => m.key === "prisma_client_queries_total"
      );
      
      if (poolMetrics) {
        logger.info("Database connection pool stats", {
          ...this.connectionStats,
          totalQueries: poolMetrics.value,
        });
        
        // Alert on connection pool exhaustion
        if (this.connectionStats.waiting > 10) {
          logger.warn("High database connection wait count", {
            waiting: this.connectionStats.waiting,
          });
        }
      }
    } catch (error) {
      logger.error("Failed to monitor connection pool", { error });
    }
  }

  // Analyze and log slow queries
  private async analyzeSlowQueries(): Promise<void> {
    try {
      const stats = performanceMonitor.getStats();
      
      logger.info("Performance optimization stats", {
        memory: {
          heapUsed: `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        },
        uptime: `${(stats.uptime / 60).toFixed(2)} minutes`,
        cacheSize: this.queryCache.size,
      });
      
      // Clear old cache entries
      this.cleanupQueryCache();
    } catch (error) {
      logger.error("Failed to analyze performance", { error });
    }
  }

  // Cleanup expired cache entries
  private cleanupQueryCache(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > this.queryCacheTTL) {
        this.queryCache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.debug("Cleaned up query cache", { removed, remaining: this.queryCache.size });
    }
  }

  // Optimize JSON operations
  optimizeJsonField<T>(data: T): string {
    // Remove null values and minimize JSON
    const cleaned = JSON.parse(JSON.stringify(data, (key, value) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value) && value.length === 0) return undefined;
      if (typeof value === "object" && Object.keys(value).length === 0) return undefined;
      return value;
    }));
    
    return JSON.stringify(cleaned);
  }

  // Database query optimization recommendations
  async getOptimizationRecommendations(): Promise<{
    slowQueries: any[];
    indexSuggestions: string[];
    cacheRecommendations: string[];
  }> {
    const recommendations = {
      slowQueries: [],
      indexSuggestions: [],
      cacheRecommendations: [],
    };
    
    // Analyze slow queries from metrics
    try {
      const metrics = await this.prisma.$metrics.json();
      
      // Check for slow queries
      const queryHistogram = metrics.histograms.find(
        (h: any) => h.key === "prisma_client_queries_duration_histogram_ms"
      );
      
      if (queryHistogram && queryHistogram.value.buckets) {
        const slowBuckets = queryHistogram.value.buckets.filter(
          (b: any) => b.from >= 1000 // Queries taking more than 1 second
        );
        
        if (slowBuckets.length > 0) {
          recommendations.slowQueries = slowBuckets;
          recommendations.indexSuggestions.push(
            "Consider adding indexes for frequently queried fields"
          );
        }
      }
      
      // Cache recommendations based on query patterns
      if (this.queryCache.size > 100) {
        recommendations.cacheRecommendations.push(
          "High query cache usage detected. Consider implementing Redis caching for frequently accessed data."
        );
      }
      
      // Memory recommendations
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
        recommendations.cacheRecommendations.push(
          "High memory usage detected. Consider reducing cache TTL or implementing cache eviction policies."
        );
      }
    } catch (error) {
      logger.error("Failed to generate optimization recommendations", { error });
    }
    
    return recommendations;
  }

  // Shutdown cleanup
  async shutdown(): void {
    this.queryCache.clear();
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Export singleton instance
let optimizationService: OptimizationService | null = null;

export function getOptimizationService(prisma: PrismaClient): OptimizationService {
  if (!optimizationService) {
    optimizationService = new OptimizationService(prisma);
  }
  return optimizationService;
}