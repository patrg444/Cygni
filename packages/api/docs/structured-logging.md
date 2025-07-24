# Structured Logging Guide

## Overview

Cygni uses structured JSON logging throughout the platform for better observability, debugging, and monitoring. All logs include contextual information, request correlation IDs, and follow consistent formatting.

## Log Levels

We use standard log levels with specific use cases:

- **ERROR**: Application errors, exceptions, failed operations
- **WARN**: Warnings, degraded performance, recoverable issues
- **INFO**: Important business events, application state changes
- **HTTP**: HTTP request/response logging (subset of INFO)
- **DEBUG**: Detailed debugging information, not for production

## Request Correlation

Every API request is assigned a unique Request ID for tracing:

```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

This ID is:
- Generated if not provided in request headers
- Attached to all logs during request processing
- Returned in response headers
- Used to correlate logs across services

## Log Format

### Development Environment
Colorized, human-readable format:
```
2024-01-20 10:30:45:123 [info] User login successful {"userId":"user_123","email":"user@example.com","requestId":"550e8400-e29b-41d4-a716-446655440000"}
```

### Production Environment
JSON format for log aggregation:
```json
{
  "timestamp": "2024-01-20T10:30:45.123Z",
  "level": "info",
  "message": "User login successful",
  "userId": "user_123",
  "email": "user@example.com",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Common Log Fields

### Request Context
- `requestId` - Unique request identifier
- `method` - HTTP method (GET, POST, etc.)
- `path` - Request path
- `statusCode` - HTTP response code
- `responseTime` - Request duration in ms
- `ip` - Client IP address
- `userAgent` - Client user agent

### User Context
- `userId` - Authenticated user ID
- `teamId` - User's team ID
- `userEmail` - User email
- `userRole` - User role (owner, admin, member)

### Application Context
- `service` - Service name
- `environment` - Environment (production, staging, development)
- `region` - Deployment region
- `version` - Application version

## Logging Examples

### Basic Logging
```typescript
import logger from './lib/logger';

// Simple log
logger.info('Application started');

// With metadata
logger.info('User created', {
  userId: user.id,
  email: user.email,
  plan: 'starter'
});
```

### Request-Scoped Logging
```typescript
// In route handler
app.get('/api/users/:id', (req, res) => {
  req.logger.info('Fetching user', { userId: req.params.id });
  
  try {
    const user = await getUser(req.params.id);
    req.logger.debug('User fetched successfully', { user });
    res.json(user);
  } catch (error) {
    req.logger.error('Failed to fetch user', { 
      error: error.message,
      userId: req.params.id 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Error Logging
```typescript
import { logError } from './lib/logger';

try {
  await riskyOperation();
} catch (error) {
  logError(error, {
    operation: 'riskyOperation',
    userId: req.user.id,
    context: additionalContext
  });
}
```

### Performance Logging
```typescript
import { logDatabaseQuery, logServiceCall } from './lib/logger';

// Database query logging
const startTime = Date.now();
const result = await prisma.user.findMany();
logDatabaseQuery('findMany', 'User', Date.now() - startTime);

// External service call
const startTime = Date.now();
const response = await stripeClient.charges.create(charge);
logServiceCall('stripe', 'charges.create', Date.now() - startTime, true);
```

### Security Event Logging
```typescript
import { logSecurity } from './lib/logger';

// Failed login attempt
logSecurity('failed_login', 'medium', {
  email: attemptedEmail,
  ip: req.ip,
  reason: 'invalid_password'
});

// Unauthorized access
logSecurity('unauthorized_access', 'high', {
  userId: req.user?.id,
  resource: '/api/admin/users',
  action: 'DELETE'
});
```

### Deployment Logging
```typescript
import { logDeployment } from './lib/logger';

logDeployment('create', 'started', {
  projectId: project.id,
  deploymentId: deployment.id,
  provider: 'aws',
  region: 'us-east-1'
});

logDeployment('create', 'completed', {
  projectId: project.id,
  deploymentId: deployment.id,
  url: deployment.url,
  duration: '45s'
});
```

### Billing Event Logging
```typescript
import { logBilling } from './lib/logger';

logBilling('subscription_created', 29.00, 'USD', {
  teamId: team.id,
  plan: 'starter',
  stripeCustomerId: customer.id
});

logBilling('payment_failed', 99.00, 'USD', {
  teamId: team.id,
  reason: 'insufficient_funds',
  retryAt: nextRetry
});
```

## Configuration

### Environment Variables

```bash
# Log level (error, warn, info, http, debug)
LOG_LEVEL=info

# Enable file logging
LOG_FILE_ENABLED=true

# Log database queries
LOG_DB_QUERIES=false
```

### File Logging

When enabled, logs are written to:
- `logs/error.log` - Error level only (max 5 files, 10MB each)
- `logs/combined.log` - All levels (max 10 files, 10MB each)

Files rotate automatically when size limit is reached.

## Best Practices

### 1. Use Appropriate Log Levels
```typescript
// ❌ Bad
logger.info('Starting loop iteration', { i: 0 });
logger.error('User not found'); // Not an error if expected

// ✅ Good
logger.debug('Starting loop iteration', { i: 0 });
logger.warn('User not found', { userId: id });
```

### 2. Include Relevant Context
```typescript
// ❌ Bad
logger.error('Operation failed');

// ✅ Good
logger.error('Failed to process payment', {
  error: error.message,
  teamId: team.id,
  amount: charge.amount,
  currency: charge.currency,
  stripeError: error.code
});
```

### 3. Avoid Logging Sensitive Data
```typescript
// ❌ Bad
logger.info('User login', {
  email: user.email,
  password: req.body.password // Never log passwords!
});

// ✅ Good
logger.info('User login', {
  userId: user.id,
  email: user.email,
  ip: req.ip
});
```

### 4. Use Structured Fields
```typescript
// ❌ Bad
logger.info(`User ${userId} performed ${action} on ${resource}`);

// ✅ Good
logger.info('User action', {
  userId,
  action,
  resource,
  timestamp: new Date()
});
```

### 5. Log Boundaries
```typescript
// Log at service boundaries
async function processWebhook(payload) {
  logger.info('Webhook received', { 
    type: payload.type,
    id: payload.id 
  });
  
  try {
    const result = await handleWebhook(payload);
    logger.info('Webhook processed', { 
      type: payload.type,
      id: payload.id,
      success: true 
    });
    return result;
  } catch (error) {
    logger.error('Webhook processing failed', {
      type: payload.type,
      id: payload.id,
      error: error.message
    });
    throw error;
  }
}
```

## Log Aggregation

### CloudWatch Logs (AWS)
Logs are automatically sent to CloudWatch when running on AWS:
- Log group: `/ecs/cygni-api`
- Log stream: One per container instance
- Retention: 7 days (configurable)

### Local Development
View logs in console or tail log files:
```bash
# View all logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log

# Filter by request ID
grep "550e8400-e29b-41d4-a716-446655440000" logs/combined.log
```

### Search Examples
```bash
# Find all errors for a user
jq 'select(.level == "error" and .userId == "user_123")' logs/combined.log

# Find slow queries
jq 'select(.message == "Slow database query")' logs/combined.log

# Find failed payments
jq 'select(.billingEvent == "payment_failed")' logs/combined.log
```

## Monitoring & Alerting

### Key Metrics from Logs
- Error rate by endpoint
- Response time percentiles
- Slow query count
- Failed login attempts
- Payment failures
- Resource limit violations

### Alert Examples
```typescript
// Alert on high error rate
if (errorCount > threshold) {
  logger.error('High error rate detected', {
    errorCount,
    threshold,
    timeWindow: '5m',
    severity: 'critical'
  });
}

// Alert on slow performance
if (p95ResponseTime > 1000) {
  logger.warn('Slow response times', {
    p95: p95ResponseTime,
    p99: p99ResponseTime,
    endpoint: req.path
  });
}
```

## Troubleshooting

### Missing Request ID
If logs are missing request IDs:
1. Ensure `requestLoggingMiddleware` is first middleware
2. Check that routes use `req.logger` not global logger
3. Verify `X-Request-ID` header in responses

### Performance Impact
Structured logging has minimal overhead:
- Async log writes don't block requests
- File rotation happens in background
- Use appropriate log levels in production

### Log Volume
To reduce log volume:
1. Set `LOG_LEVEL=info` in production
2. Disable `LOG_DB_QUERIES` unless debugging
3. Use sampling for high-frequency events
4. Implement log retention policies