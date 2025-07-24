# Runbook: High Memory Usage

**Alert Name**: High Memory Usage  
**Severity**: Warning  
**Threshold**: Node.js heap usage > 90% for 5 minutes  

## Overview

This alert indicates that the Node.js application is using more than 90% of its allocated heap memory. This is a warning sign that the application may crash due to out-of-memory (OOM) errors if not addressed promptly.

## Impact

### User Impact
- Slow response times due to garbage collection
- Potential request failures if OOM occurs
- Service instability
- Intermittent errors

### Business Impact
- Risk of service outage
- Degraded performance
- Customer complaints
- Potential data loss

### Technical Impact
- Excessive garbage collection
- Memory leaks accumulating
- Process crashes imminent
- Container restarts

## Diagnosis

### 1. Immediate Checks

```bash
# Check memory metrics
curl -s http://localhost:4000/metrics | grep nodejs_memory_usage_bytes

# View memory usage across pods
kubectl top pods -n production -l app=cygni-api --containers

# Check for recent OOM kills
kubectl get events -n production | grep OOMKilled

# View GC metrics
kubectl logs -n production -l app=cygni-api --tail=100 | grep "gc\|heap"
```

### 2. Memory Profiling

```bash
# Get heap snapshot
kubectl exec -it -n production deployment/cygni-api -- \
  curl -X POST http://localhost:4000/admin/heap-snapshot

# Download snapshot
kubectl cp production/cygni-api:/tmp/heap-snapshot.heapsnapshot ./

# Analyze with Chrome DevTools or heapdump module
```

### 3. Common Memory Issues

1. **Memory Leaks**
   - Event listener accumulation
   - Unclosed database connections
   - Global variable growth
   - Cache without eviction

2. **Large Data Processing**
   - Loading entire datasets
   - Unbounded arrays/maps
   - String concatenation
   - JSON parsing large payloads

3. **External Libraries**
   - Memory-intensive dependencies
   - Native module leaks
   - Improper cleanup

## Resolution

### Immediate Mitigation

1. **Restart Affected Pods**
```bash
# Rolling restart to clear memory
kubectl rollout restart deployment/cygni-api -n production

# Or delete specific high-memory pods
kubectl delete pod -n production <pod-name>
```

2. **Increase Memory Limits**
```bash
# Temporary increase while investigating
kubectl set resources deployment/cygni-api -n production \
  --requests=memory=1Gi \
  --limits=memory=2Gi
```

3. **Enable Memory Management**
```bash
# Force garbage collection
kubectl exec -it -n production deployment/cygni-api -- \
  node -e "global.gc()"

# Set max heap size
kubectl set env deployment/cygni-api -n production \
  NODE_OPTIONS="--max-old-space-size=1536"
```

4. **Reduce Load**
```bash
# Enable rate limiting
kubectl set env deployment/cygni-api -n production \
  RATE_LIMIT_ENABLED=true \
  RATE_LIMIT_MAX=100
```

### Memory Leak Detection

1. **Heap Comparison**
```javascript
// Take multiple snapshots over time
const heapdump = require('heapdump');

// Snapshot 1
heapdump.writeSnapshot('/tmp/heap-1.heapsnapshot');

// Wait 5 minutes...

// Snapshot 2
heapdump.writeSnapshot('/tmp/heap-2.heapsnapshot');

// Compare in Chrome DevTools
```

2. **Memory Monitoring Script**
```javascript
setInterval(() => {
  const used = process.memoryUsage();
  console.log({
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024),
    arrayBuffers: Math.round(used.arrayBuffers / 1024 / 1024)
  });
}, 10000);
```

3. **Common Leak Patterns**
```javascript
// Event listener leak
emitter.on('data', handler); // Missing: emitter.off('data', handler)

// Closure leak
function createClosure() {
  const bigData = new Array(1000000);
  return function() {
    return bigData.length; // Keeps bigData in memory
  };
}

// Cache leak
const cache = new Map();
function addToCache(key, value) {
  cache.set(key, value); // No eviction policy
}
```

## Prevention

### Code Best Practices
- [ ] Always remove event listeners
- [ ] Implement cache eviction policies
- [ ] Use streams for large data
- [ ] Avoid global variables
- [ ] Clean up timers and intervals

### Memory Management
- [ ] Set appropriate heap size limits
- [ ] Enable heap snapshots in production
- [ ] Use memory profiling in CI/CD
- [ ] Implement memory usage metrics
- [ ] Regular memory leak testing

### Monitoring Setup
```javascript
// Memory monitoring middleware
app.use((req, res, next) => {
  const startUsage = process.memoryUsage();
  
  res.on('finish', () => {
    const endUsage = process.memoryUsage();
    const delta = endUsage.heapUsed - startUsage.heapUsed;
    
    if (delta > 10 * 1024 * 1024) { // 10MB increase
      logger.warn('Large memory allocation', {
        path: req.path,
        method: req.method,
        delta: Math.round(delta / 1024 / 1024) + 'MB'
      });
    }
  });
  
  next();
});
```

## Long-term Solutions

1. **Architecture Changes**
   - Implement worker threads for CPU-intensive tasks
   - Use Redis for session storage
   - Offload file processing to S3
   - Implement job queues for async work

2. **Code Improvements**
   ```javascript
   // Use streaming for large data
   const stream = fs.createReadStream(largefile);
   stream.pipe(res);
   
   // Implement proper cleanup
   class ResourceManager {
     constructor() {
       this.resources = [];
     }
     
     add(resource) {
       this.resources.push(resource);
     }
     
     cleanup() {
       this.resources.forEach(r => r.close());
       this.resources = [];
     }
   }
   ```

3. **Deployment Configuration**
   ```yaml
   resources:
     requests:
       memory: "512Mi"
       cpu: "500m"
     limits:
       memory: "1Gi"
       cpu: "1000m"
   livenessProbe:
     httpGet:
       path: /health
       port: 4000
     initialDelaySeconds: 30
     periodSeconds: 10
   ```

## Post-Incident

### Analysis Steps
1. Analyze heap snapshots for leak sources
2. Review code changes in the last deployment
3. Check for unusual traffic patterns
4. Review third-party library updates
5. Document memory usage patterns

### Metrics to Track
- Peak memory usage by endpoint
- Memory growth over time
- GC frequency and duration
- Memory usage by pod
- OOM kill frequency

## Related Runbooks
- [High CPU Usage](./high-cpu-usage.md)
- [Slow Response Time](./slow-response-time.md)
- [API Down](./api-down.md)

## Tools and Resources
- Chrome DevTools: Memory profiler
- Node.js --inspect flag
- heapdump npm package
- clinic.js for profiling
- Memory leak tutorials: https://nodejs.org/en/docs/guides/