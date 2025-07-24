# Error Tracking with Sentry

## Overview

The API uses Sentry for comprehensive error tracking, performance monitoring, and profiling in production environments.

## Configuration

### Environment Variables

```bash
# Required for error tracking
SENTRY_DSN=https://your-key@sentry.io/project-id

# Optional configuration
SENTRY_ENVIRONMENT=production  # Defaults to NODE_ENV
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of requests traced
SENTRY_PROFILES_SAMPLE_RATE=0.1  # 10% of traces profiled
```

## Features

### 1. Automatic Error Capturing

All unhandled errors are automatically captured with full context:

```typescript
// Errors are captured with:
- User context (ID, email)
- Request context (method, path, params)
- Team context
- Custom tags and metadata
```

### 2. Performance Monitoring

Track performance of API endpoints and database queries:

```typescript
// Automatic tracing for:
- Express routes
- Database queries (Prisma)
- External HTTP requests
- Custom transactions
```

### 3. Security & Privacy

Sensitive data is automatically filtered:

```typescript
// Redacted fields:
- Authorization headers
- Passwords
- API keys
- Credit card information
- Cookies
```

### 4. Custom Error Capturing

Use the utility functions for custom error tracking:

```typescript
import { captureException, captureEvent, measurePerformance } from "../lib/sentry";

// Capture exceptions with context
try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    user: { id: userId, email: userEmail },
    tags: { operation: "payment_processing" },
    extra: { orderId, amount }
  });
}

// Capture custom events
captureEvent("Payment processed", "info", {
  amount: 100,
  currency: "USD",
  customerId: "123"
});

// Measure performance
const result = await measurePerformance(
  "process_order",
  "order",
  async () => {
    return await processOrder(orderId);
  }
);
```

## Error Grouping

Errors are automatically grouped by:
- Error type and message
- Stack trace fingerprint
- Custom fingerprints for specific scenarios

## Alerting

Sentry alerts are configured for:
- Error rate spikes
- New error types
- Performance degradation
- Crash-free rate drops

## Ignored Errors

Common client-side errors are ignored:
- Network failures
- Browser-specific errors
- Canceled requests
- Expected validation errors

## Dashboard Access

Access the Sentry dashboard at: https://sentry.io/organizations/your-org/projects/

## Best Practices

1. **Add Context**: Always include relevant context when capturing errors
2. **Use Breadcrumbs**: Add breadcrumbs for important actions
3. **Set User Context**: Always set user context for authenticated requests
4. **Tag Appropriately**: Use consistent tags for filtering
5. **Monitor Performance**: Use transactions for critical operations

## Integration with Other Services

Sentry integrates with:
- Slack (error notifications)
- PagerDuty (critical alerts)
- GitHub (issue tracking)
- Jira (ticket creation)

## Debugging

Enable debug mode in development:

```bash
SENTRY_DEBUG=true npm run dev
```

View Sentry logs:
```bash
DEBUG=sentry:* npm run dev
```