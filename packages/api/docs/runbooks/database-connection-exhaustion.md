# Runbook: Database Connection Pool Exhaustion

**Alert Name**: Database Connection Pool Exhaustion  
**Severity**: Critical  
**Threshold**: < 10% idle connections for 5 minutes  

## Overview

This alert indicates the database connection pool is nearly exhausted, with fewer than 10% of connections available. This is a critical issue that will cause queries to fail and service degradation.

## Impact

### User Impact
- Failed database queries resulting in errors
- Slow response times as queries queue
- Complete service outage if pool exhausts
- Data inconsistency risks

### Business Impact
- Service unavailability
- Transaction failures
- Loss of revenue
- Data integrity concerns

### Technical Impact
- Query timeouts
- Connection wait queue buildup
- Cascading failures
- Potential deadlocks

## Diagnosis

### 1. Immediate Checks

```bash
# Check connection pool metrics
curl -s http://localhost:4000/metrics | grep database_connection_pool_size

# Connect to database and check connections
kubectl exec -it -n production deployment/cygni-api -- psql $DATABASE_URL -c "
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;"

# Check for long-running queries
kubectl exec -it -n production deployment/cygni-api -- psql $DATABASE_URL -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"
```

### 2. Identify Connection Consumers

```sql
-- Top connection consumers by application
SELECT application_name, count(*) as connections 
FROM pg_stat_activity 
GROUP BY application_name 
ORDER BY connections DESC;

-- Connections by state and user
SELECT usename, state, count(*) 
FROM pg_stat_activity 
GROUP BY usename, state 
ORDER BY count DESC;

-- Idle connections
SELECT pid, usename, application_name, state_change 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND state_change < now() - interval '10 minutes';
```

### 3. Common Root Causes

1. **Connection Leaks**
   - Connections not properly closed
   - Missing try-finally blocks
   - Transaction not committed/rolled back

2. **Long-Running Queries**
   - Missing indexes
   - Large table scans
   - Complex joins

3. **High Traffic**
   - Sudden traffic spike
   - DDoS attack
   - Viral content

4. **Configuration Issues**
   - Pool size too small
   - Timeout values incorrect
   - Connection lifetime too long

## Resolution

### Immediate Mitigation

1. **Kill Idle Connections**
```sql
-- Terminate idle connections older than 10 minutes
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND state_change < now() - interval '10 minutes';
```

2. **Kill Long-Running Queries**
```sql
-- Terminate queries running > 30 minutes
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state != 'idle' 
AND query_start < now() - interval '30 minutes';
```

3. **Increase Connection Pool (Temporary)**
```bash
# Scale up API instances to increase total pool
kubectl scale deployment cygni-api -n production --replicas=20

# Or update pool size per instance
kubectl set env deployment/cygni-api -n production DB_POOL_SIZE=50
```

4. **Enable Read Replicas**
```bash
# Route read queries to replicas
kubectl set env deployment/cygni-api -n production READ_REPLICA_ENABLED=true
```

### Root Cause Analysis

1. **Analyze Connection Patterns**
```sql
-- Connection duration histogram
SELECT 
  CASE 
    WHEN age < interval '1 second' THEN '< 1s'
    WHEN age < interval '10 seconds' THEN '1-10s'
    WHEN age < interval '1 minute' THEN '10-60s'
    WHEN age < interval '10 minutes' THEN '1-10m'
    ELSE '> 10m'
  END as duration,
  count(*)
FROM (
  SELECT now() - backend_start as age 
  FROM pg_stat_activity
) t
GROUP BY duration;
```

2. **Check for Leaked Connections**
```bash
# Look for connection leak patterns in logs
kubectl logs -n production -l app=cygni-api --tail=1000 | \
grep -E "connection|pool|timeout" | \
grep -v "closed properly"
```

3. **Query Performance Analysis**
```sql
-- Find slow queries consuming connections
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY total_exec_time DESC
LIMIT 20;
```

### Long-term Fixes

1. **Code Improvements**
   ```typescript
   // Always use try-finally for connections
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     // ... queries ...
     await client.query('COMMIT');
   } catch (e) {
     await client.query('ROLLBACK');
     throw e;
   } finally {
     client.release();
   }
   ```

2. **Connection Pool Tuning**
   ```env
   # Optimal settings
   DB_POOL_SIZE=25              # Per instance
   DB_POOL_IDLE_TIMEOUT=30000   # 30 seconds
   DB_POOL_CONNECTION_TIMEOUT=5000  # 5 seconds
   DB_STATEMENT_TIMEOUT=30000   # 30 seconds
   ```

3. **Database Optimization**
   - Add missing indexes
   - Partition large tables
   - Archive old data
   - Optimize slow queries

## Prevention

### Connection Management Best Practices
- [ ] Always release connections in finally blocks
- [ ] Use connection pooling middleware
- [ ] Set appropriate timeouts
- [ ] Monitor connection lifecycle
- [ ] Use read replicas for read queries

### Monitoring Enhancements
- [ ] Alert on connection pool usage > 80%
- [ ] Track connection age distribution
- [ ] Monitor query execution time
- [ ] Alert on connection leak patterns

### Code Review Checklist
- [ ] All database calls use try-finally
- [ ] Transactions are properly closed
- [ ] Connection timeouts are set
- [ ] Batch operations where possible
- [ ] Use prepared statements

## Communication

### Status Page Update
```
Title: Database Connectivity Issues
Status: Identified
Message: We've identified database connection pool exhaustion affecting service availability. 
Our team is actively working to resolve this issue.
```

### Engineering Communication
1. Slack: Post in #incidents with @here
2. Create PagerDuty incident if not auto-created
3. Update team via video call if > 15 minutes

## Post-Incident

### Required Actions
1. Document number of affected queries
2. Calculate customer impact
3. Review connection pool settings
4. Audit code for connection leaks
5. Plan capacity improvements

### Metrics to Review
- Peak connection usage
- Connection wait time
- Query failure rate
- Time to resolution

## Related Runbooks
- [Slow Database Queries](./slow-database-queries.md)
- [High Error Rate](./high-error-rate.md)
- [API Down](./api-down.md)

## Tools and Commands

### Useful Queries
```sql
-- Kill all connections from specific user
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE usename = 'app_user';

-- Show blocking queries
SELECT 
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking 
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

-- Connection pool efficiency
SELECT 
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle,
  (SELECT count(*) FROM pg_stat_activity) as total,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max;
```

### Monitoring Links
- Database metrics: https://grafana.cygni.dev/d/postgres
- Connection pool: https://grafana.cygni.dev/d/connection-pool
- Slow query log: https://logs.cygni.dev/postgres-slow