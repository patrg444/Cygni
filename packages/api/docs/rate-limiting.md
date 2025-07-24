# Rate Limiting Guide

## Overview

Cygni implements a comprehensive rate limiting system to ensure fair usage, prevent abuse, and maintain platform stability. The system uses Redis for distributed rate limiting across multiple API instances and provides tiered limits based on subscription plans.

## Architecture

### Components

1. **Rate Limiter Service** - Core rate limiting logic with Redis backend
2. **Redis Store** - Distributed counter storage for multi-instance support
3. **Middleware** - Express middleware for request interception
4. **Metrics Collector** - Prometheus metrics for monitoring
5. **API Endpoints** - Rate limit status and management

### Rate Limiting Strategy

```
Request → Rate Limiter Middleware → Check Limits → Allow/Deny
                ↓                        ↓
           Redis Store              Track Metrics
                ↓                        ↓
          Distributed              Prometheus
           Counters                 Monitoring
```

## Rate Limit Tiers

### Subscription-Based Limits

| Plan       | Requests/15min | Requests/min (burst) | Requests/hour |
|------------|----------------|---------------------|---------------|
| Free       | 100            | 20                  | 400           |
| Starter    | 1,000          | 100                 | 4,000         |
| Pro        | 5,000          | 300                 | 20,000        |
| Enterprise | 20,000         | 1,000               | 80,000        |

### Endpoint-Specific Limits

Certain endpoints have stricter limits regardless of plan:

| Endpoint            | Limit        | Window  | Reason                    |
|---------------------|--------------|---------|---------------------------|
| `/api/auth/signup`  | 5 requests   | 1 hour  | Prevent spam accounts     |
| `/api/auth/login`   | 10 requests  | 15 min  | Prevent brute force       |
| `/api/deployments`  | 50 requests  | 1 hour  | Resource intensive        |
| `/api/payments`     | 20 requests  | 1 hour  | Payment provider limits   |
| `/api/export`       | 10 requests  | 24 hour | Heavy data processing     |

## Implementation Details

### Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642365600
Retry-After: 900 (only on 429 responses)
```

### Rate Limit Keys

Rate limits are tracked using composite keys:

- **Authenticated**: `rate-limit:{tier}:team:{teamId}`
- **Unauthenticated**: `rate-limit:ip:ip:{ipAddress}`
- **Endpoint-specific**: `rate-limit:endpoint:{endpoint}:{identifier}`

### Error Response

When rate limit is exceeded:

```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 900
}
```

HTTP Status: `429 Too Many Requests`

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false
RATE_LIMIT_SKIP_FAILED_REQUESTS=false

# Internal Service Token (bypasses rate limits)
INTERNAL_API_TOKEN=your-secret-token
```

### Custom Configuration

Modify rate limits in `/src/services/rate-limit/rate-limit-config.ts`:

```typescript
export const rateLimitTiers: RateLimitConfig = {
  custom: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // requests per window
    standardHeaders: true,
    legacyHeaders: false,
  },
};
```

## API Endpoints

### Check Rate Limit Status

```http
GET /api/rate-limit/status
Authorization: Bearer <token>

Response:
{
  "tier": "pro",
  "limit": 5000,
  "remaining": 4750,
  "reset": "2024-01-15T12:00:00Z",
  "window": 900000
}
```

### View Available Tiers

```http
GET /api/rate-limit/tiers

Response:
{
  "tiers": [
    {
      "name": "free",
      "limit": 100,
      "window": 900000,
      "windowMinutes": 15,
      "requestsPerMinute": 6
    },
    ...
  ]
}
```

### Reset Rate Limit (Admin Only)

```http
POST /api/rate-limit/reset
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "teamId": "team-123",
  "tier": "pro" // optional, resets all if not specified
}

Response:
{
  "message": "Rate limit reset successfully"
}
```

## Monitoring

### Prometheus Metrics

```promql
# Rate limit hits by tier
rate(rate_limit_hits_total[5m]) by (tier)

# Rate limit exceeded events
rate(rate_limit_exceeded_total[5m]) by (tier, endpoint)

# Remaining rate limit capacity
rate_limit_remaining{tier="pro"}

# Teams approaching limit (< 10% remaining)
rate_limit_remaining / rate_limit_limit < 0.1
```

### Grafana Dashboard

Monitor rate limiting with the provided dashboard:
- Current usage by tier
- Rate limit violations over time
- Top consumers by team
- Endpoint-specific limits

### Alerts

```yaml
- alert: HighRateLimitViolations
  expr: rate(rate_limit_exceeded_total[5m]) > 10
  for: 5m
  annotations:
    summary: "High rate of rate limit violations"
    description: "{{ $value }} rate limit violations per second"

- alert: TeamApproachingLimit
  expr: rate_limit_remaining / rate_limit_limit < 0.1
  for: 5m
  annotations:
    summary: "Team {{ $labels.team_id }} approaching rate limit"
```

## Client Implementation

### Handling Rate Limits

```javascript
async function apiCall(url, options) {
  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    
    console.log(`Rate limited. Waiting ${waitTime}ms before retry`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Retry the request
    return apiCall(url, options);
  }
  
  // Check remaining limits
  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining && parseInt(remaining) < 10) {
    console.warn(`Low rate limit remaining: ${remaining}`);
  }
  
  return response;
}
```

### Exponential Backoff

```javascript
async function apiCallWithBackoff(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status !== 429) {
        return response;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

## Best Practices

### For API Consumers

1. **Monitor Headers**: Always check rate limit headers in responses
2. **Implement Retry Logic**: Use exponential backoff for 429 responses
3. **Batch Operations**: Combine multiple operations where possible
4. **Cache Responses**: Reduce unnecessary API calls
5. **Use Webhooks**: For real-time updates instead of polling

### For Internal Services

1. **Use Service Tokens**: Bypass rate limits with `X-Internal-Token` header
2. **Implement Circuit Breakers**: Fail fast when approaching limits
3. **Monitor Usage**: Track API usage patterns
4. **Plan Capacity**: Upgrade plans before hitting limits

## Troubleshooting

### Common Issues

1. **"Too many requests" errors**
   - Check current usage: `GET /api/rate-limit/status`
   - Verify subscription plan is correct
   - Look for inefficient API usage patterns

2. **Rate limits not resetting**
   - Check Redis connectivity
   - Verify Redis key expiration is working
   - Check system clock synchronization

3. **Inconsistent limits across instances**
   - Ensure all instances use same Redis
   - Check Redis network latency
   - Verify rate limiter configuration

### Debug Commands

```bash
# Check Redis keys for a team
redis-cli KEYS "rate-limit:*:team:${TEAM_ID}"

# Get current count
redis-cli GET "rate-limit:pro:team:${TEAM_ID}"

# Check TTL
redis-cli TTL "rate-limit:pro:team:${TEAM_ID}"

# Manual reset (emergency)
redis-cli DEL "rate-limit:pro:team:${TEAM_ID}"
```

## Security Considerations

1. **IP Spoofing**: Use trusted proxy settings in production
2. **Token Security**: Rotate internal API tokens regularly
3. **DDoS Protection**: Combine with cloud-based DDoS protection
4. **Monitoring**: Alert on unusual patterns or bypass attempts

## Migration Guide

### Upgrading Plans

When a team upgrades their plan:
1. Rate limits apply immediately
2. Current period counters remain
3. New limits take effect on next request

### Custom Enterprise Limits

For enterprise customers needing custom limits:

```javascript
// Contact support to configure custom limits
{
  "teamId": "enterprise-customer",
  "limits": {
    "requests": 100000,
    "window": 3600000, // 1 hour
    "burst": 5000
  }
}
```

## FAQ

**Q: Are rate limits per user or per team?**
A: Rate limits are applied per team for authenticated requests and per IP for unauthenticated requests.

**Q: What happens to unused quota?**
A: Unused quota does not roll over to the next period.

**Q: Can I check my rate limit without making an API call?**
A: Yes, use `GET /api/rate-limit/status` which doesn't count against your limit.

**Q: How do I increase my rate limits?**
A: Upgrade your subscription plan or contact support for enterprise options.

**Q: Are webhook endpoints rate limited?**
A: Incoming webhooks have separate, more generous limits to ensure reliability.