# Runbook: Slow Response Time

**Alert Name**: Slow Response Time  
**Severity**: Warning  
**Threshold**: 95th percentile response time > 2s for 10 minutes  

## Overview

This alert indicates that API response times are degraded, with the 95th percentile exceeding 2 seconds. While not a complete outage, this impacts user experience and may indicate underlying performance issues.

## Impact

### User Impact
- Slow page loads and API responses
- Timeouts on client applications  
- Degraded interactive features
- Poor user experience

### Business Impact
- Increased bounce rates
- Reduced user engagement
- Risk of customer complaints
- Potential SLA warnings

### Technical Impact
- Resource saturation
- Database performance issues
- Network congestion
- Cache misses

## Diagnosis

### 1. Immediate Checks

```bash
# Check response time metrics
curl -s http://localhost:4000/metrics | grep http_request_duration

# Identify slow endpoints
kubectl logs -n production -l app=cygni-api --tail=100 | \
  grep "request_duration" | \
  awk -F'request_duration=' '{print $2}' | \
  sort -nr | head -20

# Check current traffic levels
kubectl top pods -n production -l app=cygni-api
```

### 2. Performance Analysis

```sql
-- Slow queries in the last hour
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY total_exec_time DESC
LIMIT 20;

-- Missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  most_common_vals
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = pg_stats.tablename
    AND indexdef LIKE '%' || attname || '%'
  );
```

### 3. Common Causes

1. **Database Issues**
   - Slow queries
   - Missing indexes
   - Lock contention
   - Connection pool saturation

2. **Application Issues**
   - Memory pressure/GC
   - CPU throttling
   - Inefficient algorithms
   - External API delays

3. **Infrastructure Issues**
   - Network latency
   - Disk I/O bottlenecks
   - Node resource limits
   - Cache failures

## Resolution

### Quick Wins

1. **Enable Caching**
```bash
# Enable Redis caching
kubectl set env deployment/cygni-api -n production \
  REDIS_CACHE_ENABLED=true \
  CACHE_TTL=300
```

2. **Scale Horizontally**
```bash
# Add more replicas
kubectl scale deployment cygni-api -n production --replicas=15

# Enable HPA if not already
kubectl autoscale deployment cygni-api -n production \
  --min=10 --max=50 --cpu-percent=70
```

3. **Database Query Optimization**
```sql
-- Kill slow queries
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '2 minutes';

-- Update statistics
ANALYZE;

-- Add missing index (example)
CREATE INDEX CONCURRENTLY idx_deployments_created_at 
ON deployments(created_at) 
WHERE status = 'active';
```

### Performance Profiling

1. **Enable APM Tracing**
```bash
kubectl set env deployment/cygni-api -n production \
  APM_ENABLED=true \
  DD_TRACE_ENABLED=true
```

2. **CPU Profiling**
```bash
# Get CPU profile
kubectl exec -n production deployment/cygni-api -- \
  kill -USR1 1

# Download profile
kubectl cp production/cygni-api:/tmp/cpu-profile.prof ./cpu-profile.prof
```

3. **Memory Analysis**
```bash
# Heap snapshot
kubectl exec -n production deployment/cygni-api -- \
  kill -USR2 1

# Get heap dump
kubectl cp production/cygni-api:/tmp/heapdump.json ./heapdump.json
```

## Prevention

### Code Optimization
- [ ] Add database query timeouts
- [ ] Implement pagination for large datasets
- [ ] Use database indexes effectively
- [ ] Cache expensive computations
- [ ] Optimize N+1 queries

### Infrastructure
- [ ] Set up CDN for static assets
- [ ] Implement read replicas
- [ ] Use connection pooling
- [ ] Enable query caching
- [ ] Optimize container resources

### Monitoring
- [ ] Track p50, p95, p99 latencies
- [ ] Monitor slow query log
- [ ] Alert on cache hit rates
- [ ] Track API endpoint performance
- [ ] Monitor upstream dependencies

## Related Runbooks
- [Slow Database Queries](./slow-database-queries.md)
- [High Memory Usage](./high-memory-usage.md)
- [External Service Degraded](./external-service-degraded.md)