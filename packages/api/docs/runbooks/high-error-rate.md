# Runbook: High Error Rate

**Alert Name**: High Error Rate  
**Severity**: Critical  
**Threshold**: Error rate > 5% for 5 minutes  

## Overview

This alert fires when the API error rate (5xx responses) exceeds 5% of total requests for a sustained period. This indicates a significant portion of user requests are failing, impacting service reliability.

## Impact

### User Impact
- Users experiencing failed requests
- Degraded functionality across the platform
- Potential data loss if writes are failing
- Customer frustration and support tickets

### Business Impact
- Loss of customer trust
- Increased support burden
- Potential SLA violations
- Risk of customer churn

### Technical Impact
- Service instability
- Cascading failures possible
- Database connection exhaustion
- Memory/resource leaks

## Diagnosis

### 1. Immediate Checks

```bash
# Check current error rate
curl -s http://localhost:4000/metrics | grep http_requests_total

# View recent error logs
kubectl logs -n production -l app=cygni-api --tail=100 | grep ERROR

# Check system resources
kubectl top pods -n production -l app=cygni-api
```

### 2. Identify Error Patterns

Check Grafana dashboard: https://grafana.cygni.dev/d/api-errors

Look for:
- Specific endpoints with high error rates
- Error types (timeouts, 500s, 502s, 503s)
- Correlation with deployment times
- Geographic patterns

### 3. Common Root Causes

1. **Database Issues**
   - Connection pool exhaustion
   - Slow queries causing timeouts
   - Database server issues

2. **Memory Issues**
   - Memory leaks
   - Heap exhaustion
   - Garbage collection pressure

3. **External Service Failures**
   - Stripe API issues
   - AWS service degradation
   - Third-party integrations

4. **Code Issues**
   - Unhandled exceptions
   - Race conditions
   - Invalid deployments

## Resolution

### Immediate Mitigation

1. **Scale Up Services** (if resource-related)
```bash
kubectl scale deployment cygni-api -n production --replicas=10
```

2. **Enable Circuit Breakers**
```bash
kubectl set env deployment/cygni-api -n production CIRCUIT_BREAKER_ENABLED=true
```

3. **Rollback Recent Deployment** (if deployment-related)
```bash
# List recent deployments
kubectl rollout history deployment/cygni-api -n production

# Rollback to previous version
kubectl rollout undo deployment/cygni-api -n production
```

4. **Restart Unhealthy Pods**
```bash
# Delete pods with high error rates
kubectl delete pod -n production -l app=cygni-api,version=current
```

### Root Cause Analysis

1. **Analyze Error Logs**
```bash
# Export recent errors for analysis
kubectl logs -n production -l app=cygni-api --since=1h > /tmp/error-logs.txt
grep -E "ERROR|FATAL|Exception" /tmp/error-logs.txt | sort | uniq -c | sort -nr
```

2. **Check Database Performance**
```sql
-- Check slow queries
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
WHERE mean_exec_time > 1000 
ORDER BY mean_exec_time DESC;

-- Check connection count
SELECT count(*) FROM pg_stat_activity;
```

3. **Memory Analysis**
```bash
# Get heap dump from affected pod
kubectl exec -n production <pod-name> -- kill -3 1
kubectl cp production/<pod-name>:/tmp/heapdump.hprof ./heapdump.hprof
```

### Long-term Fixes

1. **Code Fixes**
   - Add proper error handling
   - Implement retry logic
   - Add request validation

2. **Infrastructure Improvements**
   - Increase connection pool size
   - Add caching layers
   - Implement rate limiting

3. **Monitoring Enhancements**
   - Add more granular metrics
   - Create error budget tracking
   - Implement synthetic monitoring

## Prevention

### Code Review Checklist
- [ ] All database queries have timeouts
- [ ] Error handling for all external calls
- [ ] Proper input validation
- [ ] Resource cleanup in finally blocks
- [ ] Circuit breaker patterns for external services

### Pre-deployment Checks
- [ ] Load testing completed
- [ ] Error rate baseline established
- [ ] Rollback plan documented
- [ ] Feature flags configured

### Monitoring Improvements
- [ ] Error rate alerts per endpoint
- [ ] Latency percentile tracking
- [ ] Resource utilization alerts
- [ ] Dependency health checks

## Communication

### Status Page Update
```
Title: API Elevated Error Rate
Status: Investigating
Message: We are currently experiencing elevated error rates on our API. 
Our team is actively investigating and working on a resolution.
```

### Internal Communication
- Slack: #incidents channel
- PagerDuty: Auto-escalation after 15 minutes
- Email: engineering@cygni.dev for major incidents

### Customer Communication (if > 30 minutes)
```
Subject: Cygni Platform - Service Degradation

We are currently experiencing elevated error rates affecting some API requests. 
Our engineering team has identified the issue and is working on a resolution.

Impact: Some API requests may fail or timeout
Timeline: We expect to resolve this within the next hour

We apologize for any inconvenience and will update you once resolved.
```

## Post-Incident

### Required Actions
1. Create incident report within 24 hours
2. Schedule blameless post-mortem
3. Update runbook with new findings
4. Create tickets for prevention measures

### Metrics to Track
- Time to detection
- Time to resolution
- Customer impact (failed requests)
- Root cause category

## Related Runbooks
- [Database Connection Exhaustion](./database-connection-exhaustion.md)
- [High Memory Usage](./high-memory-usage.md)
- [API Down](./api-down.md)

## Tools and Resources
- Grafana: https://grafana.cygni.dev/d/api-errors
- Logs: https://logs.cygni.dev
- APM: https://apm.cygni.dev
- Kubectl cheatsheet: https://docs.cygni.dev/k8s-commands