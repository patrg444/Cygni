import { performance, PerformanceObserver } from "perf_hooks";
import * as Sentry from "@sentry/node";
import logger from "./logger";
import { Histogram, Counter, Gauge, register } from "prom-client";

// Performance metrics
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

const dbQueryDuration = new Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "model"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const cacheHitRate = new Counter({
  name: "cache_operations_total",
  help: "Total number of cache operations",
  labelNames: ["operation", "result"],
});

const memoryUsageGauge = new Gauge({
  name: "nodejs_memory_usage_bytes",
  help: "Node.js memory usage",
  labelNames: ["type"],
});

const eventLoopLag = new Gauge({
  name: "nodejs_event_loop_lag_seconds",
  help: "Node.js event loop lag in seconds",
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(dbQueryDuration);
register.registerMetric(cacheHitRate);
register.registerMetric(memoryUsageGauge);
register.registerMetric(eventLoopLag);

// Performance monitoring class
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private performanceObserver?: PerformanceObserver;
  private eventLoopMonitor?: NodeJS.Timer;

  private constructor() {
    this.setupPerformanceObserver();
    this.startEventLoopMonitoring();
    this.startMemoryMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Setup performance observer for detailed metrics
  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((items) => {
      items.getEntries().forEach((entry) => {
        if (entry.entryType === "measure") {
          this.processMeasurement(entry);
        }
      });
    });

    this.performanceObserver.observe({ entryTypes: ["measure"] });
  }

  // Process performance measurements
  private processMeasurement(entry: PerformanceEntry): void {
    const duration = entry.duration / 1000; // Convert to seconds
    
    // Send to Sentry
    const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
    if (transaction) {
      const span = transaction.startChild({
        op: "measure",
        description: entry.name,
      });
      span.finish(entry.startTime + entry.duration);
    }

    // Log slow operations
    if (duration > 1) {
      logger.warn("Slow operation detected", {
        operation: entry.name,
        duration: `${duration.toFixed(3)}s`,
        metadata: (entry as any).detail,
      });
    }
  }

  // Monitor event loop lag
  private startEventLoopMonitoring(): void {
    let lastCheck = process.hrtime.bigint();
    
    this.eventLoopMonitor = setInterval(() => {
      const now = process.hrtime.bigint();
      const lag = Number(now - lastCheck) / 1e9 - 0.1; // Expected 100ms interval
      
      if (lag > 0) {
        eventLoopLag.set(lag);
        
        if (lag > 0.1) {
          logger.warn("High event loop lag detected", {
            lag: `${(lag * 1000).toFixed(2)}ms`,
          });
        }
      }
      
      lastCheck = now;
    }, 100);
  }

  // Monitor memory usage
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      
      memoryUsageGauge.set({ type: "rss" }, memUsage.rss);
      memoryUsageGauge.set({ type: "heapTotal" }, memUsage.heapTotal);
      memoryUsageGauge.set({ type: "heapUsed" }, memUsage.heapUsed);
      memoryUsageGauge.set({ type: "external" }, memUsage.external);
      memoryUsageGauge.set({ type: "arrayBuffers" }, memUsage.arrayBuffers);
      
      // Alert on high memory usage
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      if (heapUsedPercent > 90) {
        logger.error("Critical memory usage", {
          heapUsedPercent: heapUsedPercent.toFixed(2),
          heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        });
      }
    }, 30000); // Every 30 seconds
  }

  // Measure HTTP request performance
  measureHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number
  ): void {
    httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration / 1000
    );
  }

  // Measure database query performance
  measureDbQuery(operation: string, model: string, duration: number): void {
    dbQueryDuration.observe({ operation, model }, duration / 1000);
  }

  // Measure cache performance
  recordCacheOperation(operation: "get" | "set" | "delete", hit: boolean): void {
    cacheHitRate.inc({ 
      operation, 
      result: hit ? "hit" : "miss" 
    });
  }

  // Start a custom performance measurement
  startMeasure(name: string, metadata?: any): () => void {
    const startMark = `${name}-start`;
    performance.mark(startMark, { detail: metadata });
    
    return () => {
      const endMark = `${name}-end`;
      performance.mark(endMark);
      performance.measure(name, startMark, endMark);
      
      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
    };
  }

  // Async operation wrapper with performance tracking
  async trackAsyncOperation<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: any
  ): Promise<T> {
    const transaction = Sentry.startTransaction({
      name,
      op: "async.operation",
      data: metadata,
    });

    const stopMeasure = this.startMeasure(name, metadata);
    const startTime = Date.now();

    try {
      const result = await operation();
      transaction.setStatus("ok");
      return result;
    } catch (error) {
      transaction.setStatus("internal_error");
      throw error;
    } finally {
      stopMeasure();
      transaction.finish();
      
      const duration = Date.now() - startTime;
      logger.debug("Async operation completed", {
        operation: name,
        duration: `${duration}ms`,
        metadata,
      });
    }
  }

  // Get current performance stats
  getStats(): {
    memory: NodeJS.MemoryUsage;
    uptime: number;
    eventLoopUtilization?: any;
  } {
    const stats = {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      eventLoopUtilization: undefined as any,
    };

    // Event loop utilization (Node.js 14.10+)
    if (performance.eventLoopUtilization) {
      stats.eventLoopUtilization = performance.eventLoopUtilization();
    }

    return stats;
  }

  // Cleanup
  shutdown(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    if (this.eventLoopMonitor) {
      clearInterval(this.eventLoopMonitor);
    }
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Middleware for Express
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
      
      // Record metrics
      performanceMonitor.measureHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
      
      // Add performance headers
      res.set("X-Response-Time", `${duration.toFixed(2)}ms`);
      
      // Call original end
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

// Database query performance tracking
export function trackDatabaseQuery(
  operation: string,
  model: string
): () => void {
  const start = Date.now();
  
  return () => {
    const duration = Date.now() - start;
    performanceMonitor.measureDbQuery(operation, model, duration);
  };
}

// Cache performance tracking
export function trackCacheOperation(
  operation: "get" | "set" | "delete",
  hit: boolean
): void {
  performanceMonitor.recordCacheOperation(operation, hit);
}