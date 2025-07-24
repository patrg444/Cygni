# Runbook: API Down

**Alert Name**: API Down  
**Severity**: Critical  
**Threshold**: Health check failing for 1 minute  

## Overview

This is the most critical alert - the API health check endpoint is not responding, indicating a complete service outage. This requires immediate action as all platform functionality is unavailable.

## Impact

### User Impact
- Complete platform outage
- All API requests failing
- No access to deployments or management
- Data synchronization stopped

### Business Impact
- 100% service unavailability
- Complete revenue loss during outage
- Severe reputation damage
- SLA breach

### Technical Impact
- All services unreachable
- Health checks failing
- Load balancer removing instances
- Potential data loss if writes pending

## Diagnosis

### 1. Immediate Checks

```bash
# Test health endpoint directly
curl -w "@curl-format.txt" -o /dev/null -s https://api.cygni.dev/api/health

# Check all pod statuses
kubectl get pods -n production -l app=cygni-api

# Check recent pod events
kubectl describe pods -n production -l app=cygni-api | grep -A 10 Events

# Check deployment status
kubectl rollout status deployment/cygni-api -n production
```

### 2. Service Discovery

```bash
# Check if pods are registered with service
kubectl get endpoints -n production cygni-api-service

# Test internal service connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://cygni-api-service.production.svc.cluster.local:4000/api/health

# Check ingress/load balancer
kubectl get ingress -n production
kubectl describe ingress -n production cygni-ingress
```

### 3. Common Root Causes

1. **Deployment Issues**
   - Failed deployment
   - Image pull errors
   - Configuration errors
   - Resource limits hit

2. **Infrastructure Failures**
   - Node failures
   - Network partition
   - Storage issues
   - DNS problems

3. **Application Crashes**
   - Out of memory
   - Uncaught exceptions
   - Startup failures
   - Dependency issues

4. **External Dependencies**
   - Database unreachable
   - Redis down
   - AWS service issues

## Resolution

### Immediate Mitigation

1. **Check and Restart Pods**
```bash
# Force restart all pods
kubectl rollout restart deployment/cygni-api -n production

# If pods are stuck, delete them
kubectl delete pods -n production -l app=cygni-api --force --grace-period=0
```

2. **Rollback to Last Known Good**
```bash
# Check rollout history
kubectl rollout history deployment/cygni-api -n production

# Rollback to previous version
kubectl rollout undo deployment/cygni-api -n production

# Or rollback to specific revision
kubectl rollout undo deployment/cygni-api -n production --to-revision=2
```

3. **Scale and Redistribute**
```bash
# Scale up replicas
kubectl scale deployment cygni-api -n production --replicas=20

# Cordon problematic nodes
kubectl cordon node-xxx
kubectl drain node-xxx --ignore-daemonsets --delete-emptydir-data
```

4. **Emergency Direct Access**
```bash
# Port forward for direct debugging
kubectl port-forward -n production deployment/cygni-api 4000:4000

# Exec into pod for investigation
kubectl exec -it -n production deployment/cygni-api -- /bin/sh
```

### Root Cause Analysis

1. **Check Logs Across All Layers**
```bash
# Application logs
kubectl logs -n production -l app=cygni-api --tail=200 --timestamps

# Previous container logs (if restarted)
kubectl logs -n production -l app=cygni-api --previous

# Node logs
kubectl get nodes -o wide
kubectl describe node <node-name>

# Cluster events
kubectl get events -n production --sort-by='.lastTimestamp'
```

2. **Resource Analysis**
```bash
# Check resource usage
kubectl top pods -n production -l app=cygni-api
kubectl top nodes

# Check resource limits
kubectl describe deployment cygni-api -n production | grep -A 5 Limits

# Check persistent volume claims
kubectl get pvc -n production
```

3. **Dependency Verification**
```bash
# Test database connectivity
kubectl exec -it -n production deployment/cygni-api -- \
  psql $DATABASE_URL -c "SELECT 1"

# Test Redis connectivity
kubectl exec -it -n production deployment/cygni-api -- \
  redis-cli -h $REDIS_HOST ping

# Check external services
kubectl exec -it -n production deployment/cygni-api -- \
  curl -s https://api.stripe.com/v1/charges
```

### Recovery Verification

```bash
# Verify health endpoint
for i in {1..10}; do
  curl -s https://api.cygni.dev/api/health | jq .
  sleep 5
done

# Check all replicas are ready
kubectl get pods -n production -l app=cygni-api -o wide

# Verify load balancer targets
aws elbv2 describe-target-health \
  --target-group-arn $TARGET_GROUP_ARN
```

## Prevention

### Deployment Safety
- [ ] Use rolling updates with proper health checks
- [ ] Set appropriate readiness/liveness probes
- [ ] Implement deployment circuit breakers
- [ ] Use canary deployments for risky changes
- [ ] Always test rollback procedures

### High Availability
- [ ] Multi-AZ deployment
- [ ] Auto-scaling policies
- [ ] Resource quotas and limits
- [ ] Pod disruption budgets
- [ ] Node anti-affinity rules

### Monitoring
- [ ] Synthetic monitoring from multiple regions
- [ ] Deep health checks (database, cache, etc.)
- [ ] Resource utilization alerts
- [ ] Error budget tracking
- [ ] Deployment tracking

## Communication

### Immediate Notification (< 2 minutes)
```
Subject: 🔴 CRITICAL: Cygni API Complete Outage

The Cygni API is completely down. All health checks are failing.

Impact: Total platform outage - all customer services affected
Action: Engineering team investigating with highest priority

Status page has been updated. Will provide updates every 15 minutes.
```

### Status Page
```
Title: Major Service Outage
Status: Major Outage
Message: We are experiencing a complete service outage. All API functionality 
is currently unavailable. Our engineering team is working on emergency 
resolution. Updates every 15 minutes.
```

### Customer Communication (> 5 minutes)
- Email all customers about outage
- Post on Twitter/social media
- Update phone system message
- Prepare support team with scripts

## Escalation

### Escalation Timeline
- 0-2 min: Primary on-call
- 2-5 min: Secondary on-call
- 5-10 min: Engineering manager
- 10-15 min: VP of Engineering
- 15+ min: CTO

### War Room Protocol
1. Create Zoom bridge immediately
2. Assign roles:
   - Incident Commander
   - Technical Lead
   - Communications Lead
   - Scribe
3. Update status every 15 minutes
4. No side investigations without approval

## Post-Incident

### Immediate Actions
1. Confirm service fully restored
2. Monitor for 30 minutes
3. Send all-clear communication
4. Schedule post-mortem within 48 hours

### Post-Mortem Requirements
- Timeline of events
- Root cause analysis
- Customer impact assessment
- Action items with owners
- Process improvements

### SLA Impact
- Calculate downtime minutes
- Identify affected customers
- Prepare SLA credit calculations
- Update availability metrics

## Emergency Contacts

- On-call Phone: +1-xxx-xxx-xxxx
- Engineering Manager: manager@cygni.dev
- VP Engineering: vp-eng@cygni.dev
- CTO: cto@cygni.dev
- AWS Support: https://console.aws.amazon.com/support

## Related Runbooks
- [High Error Rate](./high-error-rate.md)
- [Database Connection Exhaustion](./database-connection-exhaustion.md)
- [Deployment Failures](./deployment-failures.md)

## Recovery Checklist

- [ ] Service responding to health checks
- [ ] All pods running and ready
- [ ] Load balancer targets healthy
- [ ] Metrics flowing normally
- [ ] No error spike after recovery
- [ ] Customer verification completed
- [ ] Status page updated
- [ ] Post-mortem scheduled