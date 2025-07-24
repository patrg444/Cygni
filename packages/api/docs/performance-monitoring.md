# Performance Monitoring & Optimization

## Overview

The API includes comprehensive performance monitoring and optimization features to ensure optimal application performance at scale.

## Features

### 1. Real-time Performance Metrics

- **HTTP Request Duration**: Tracks response times for all endpoints
- **Database Query Performance**: Monitors query execution times
- **Cache Hit Rates**: Measures cache effectiveness
- **Memory Usage**: Tracks heap and RSS memory consumption
- **Event Loop Monitoring**: Detects event loop blocking

### 2. Automatic Performance Tracking

All operations are automatically tracked:

```typescript
// HTTP requests are automatically tracked
app.use(performanceMiddleware());

// Database queries are tracked via Prisma middleware
const stopTracking = trackDatabaseQuery(operation, model);

// Cache operations are tracked
trackCacheOperation("get", true); // Cache hit
trackCacheOperation("get", false); // Cache miss
```

### 3. Performance Optimization Service

The optimization service provides:

- Query result caching
- Batch operation support
- Cursor-based pagination
- Connection pool monitoring
- Optimization recommendations

## Usage

### Cached Queries

Optimize frequently accessed data with caching:

```typescript
const optimizationService = getOptimizationService(prisma);

// Cache query results
const users = await optimizationService.cachedQuery(
  "active-users",
  () => prisma.user.findMany({ where: { status: "active" } }),
  300000 // 5 minute TTL
);
```

### Batch Operations

Process large datasets efficiently:

```typescript
const results = await optimizationService.batchOperation(
  items,
  async (batch) => {
    return prisma.record.createMany({ data: batch });
  },
  100 // Batch size
);
```

### Cursor Pagination

Handle large result sets with cursor pagination:

```typescript
const optimizer = getOptimizationService(prisma);

for await (const page of optimizer.cursorPaginate(prisma.user, 100)) {
  // Process each page of 100 users
  await processUsers(page);
}
```

## Performance Metrics

### Prometheus Metrics

All performance metrics are exposed in Prometheus format:

```
# HTTP request duration
http_request_duration_seconds{method="GET",route="/api/users",status_code="200"} 0.123

# Database query duration
db_query_duration_seconds{operation="findMany",model="User"} 0.045

# Cache operations
cache_operations_total{operation="get",result="hit"} 1234
cache_operations_total{operation="get",result="miss"} 567

# Memory usage
nodejs_memory_usage_bytes{type="heapUsed"} 134217728

# Event loop lag
nodejs_event_loop_lag_seconds 0.002
```

### Custom Performance Measurements

Track custom operations:

```typescript
const stopMeasure = performanceMonitor.startMeasure("custom-operation", {
  userId: "123",
  operation: "data-processing"
});

// Perform operation
await processData();

stopMeasure(); // Records the measurement
```

### Async Operation Tracking

Track async operations with automatic error handling:

```typescript
const result = await performanceMonitor.trackAsyncOperation(
  "external-api-call",
  async () => {
    return await externalAPI.getData();
  },
  { endpoint: "/api/external" }
);
```

## API Endpoints

### GET /api/performance/stats

Get current performance statistics:

```json
{
  "system": {
    "uptime": 3600,
    "memory": {
      "heapUsed": "123.45MB",
      "heapTotal": "256.00MB"
    },
    "eventLoop": {
      "utilization": 0.15
    }
  },
  "recommendations": {
    "slowQueries": [],
    "indexSuggestions": [
      "Consider adding indexes for frequently queried fields"
    ],
    "cacheRecommendations": []
  }
}
```

### GET /api/performance/metrics

Get raw Prometheus metrics (admin only).

### POST /api/performance/analyze

Analyze specific operation performance:

```json
{
  "operation": "user-search",
  "duration": 1500
}
```

Response:
```json
{
  "operation": "user-search",
  "duration": 1500,
  "performance": "poor",
  "suggestions": [
    "Consider implementing caching for this operation",
    "Review database queries for optimization opportunities"
  ]
}
```

### GET /api/performance/slow-queries

Get slow query log (admin only).

### POST /api/performance/optimize

Run optimization tasks:

```json
{
  "task": "analyze" // or "vacuum", "reindex"
}
```

## Performance Best Practices

### 1. Use Caching Strategically

```typescript
// Cache expensive computations
const result = await optimizationService.cachedQuery(
  `team-stats-${teamId}`,
  () => calculateTeamStats(teamId),
  3600000 // 1 hour
);
```

### 2. Batch Database Operations

```typescript
// Instead of multiple individual inserts
for (const item of items) {
  await prisma.item.create({ data: item });
}

// Use batch operations
await optimizationService.batchOperation(
  items,
  (batch) => prisma.item.createMany({ data: batch }),
  1000
);
```

### 3. Implement Cursor Pagination

```typescript
// For large datasets
for await (const page of optimizer.cursorPaginate(prisma.logs, 500)) {
  await processLogs(page);
}
```

### 4. Monitor Event Loop

Keep the event loop responsive:

```typescript
// Break up CPU-intensive tasks
async function processLargeDataset(data: any[]) {
  for (let i = 0; i < data.length; i++) {
    await processItem(data[i]);
    
    // Yield to event loop every 100 items
    if (i % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}
```

## Alerts and Monitoring

### Automatic Alerts

The system automatically alerts on:

- High memory usage (>90% heap utilization)
- Slow queries (>1 second)
- High event loop lag (>100ms)
- Connection pool exhaustion

### Integration with Monitoring Tools

Performance metrics integrate with:

- **Prometheus**: Scrape metrics endpoint
- **Grafana**: Visualize performance dashboards
- **Sentry**: Track performance transactions
- **Custom Webhooks**: Real-time alerts

## Troubleshooting

### High Memory Usage

1. Check for memory leaks in event listeners
2. Review cache TTL settings
3. Implement cache eviction policies
4. Use streaming for large datasets

### Slow Database Queries

1. Run `EXPLAIN ANALYZE` on slow queries
2. Add appropriate indexes
3. Optimize query patterns
4. Consider query result caching

### Event Loop Blocking

1. Move CPU-intensive tasks to worker threads
2. Use `setImmediate()` to yield control
3. Implement proper async/await patterns
4. Avoid synchronous file operations

## Configuration

Environment variables for performance tuning:

```bash
# Cache settings
QUERY_CACHE_TTL=300000       # 5 minutes
MAX_CACHE_SIZE=1000          # Maximum cache entries

# Connection pool
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Performance thresholds
SLOW_QUERY_THRESHOLD=1000    # 1 second
HIGH_MEMORY_THRESHOLD=0.9    # 90%
```