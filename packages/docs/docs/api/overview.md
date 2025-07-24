---
sidebar_position: 1
---

# API Overview

The Cygni API provides programmatic access to all platform features. Use it to integrate Cygni into your workflows, build custom tools, or automate deployments.

## Base URL

```
https://api.cygni.dev/v1
```

## Authentication

All API requests require authentication using a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://api.cygni.dev/v1/projects
```

### Getting an API Token

1. Log in to your [Cygni Dashboard](https://app.cygni.dev)
2. Navigate to Settings → API Tokens
3. Click "Create New Token"
4. Copy your token (it won't be shown again)

### Token Security

- Tokens don't expire but can be revoked
- Use environment variables to store tokens
- Never commit tokens to version control
- Create separate tokens for different uses

## Rate Limits

API rate limits depend on your plan:

| Plan | Requests/Minute | Requests/Hour |
|------|----------------|---------------|
| Free | 100 | 1,000 |
| Pro | 1,000 | 10,000 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Response Format

All responses are JSON:

```json
{
  "data": {
    // Response data
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Error Responses

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid project name",
    "details": {
      "field": "name",
      "reason": "Must be alphanumeric with hyphens"
    }
  },
  "meta": {
    "requestId": "req_xyz789",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

## Pagination

List endpoints support pagination:

```bash
GET /v1/projects?page=2&limit=20
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "page": 2,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

## Filtering

Most list endpoints support filtering:

```bash
# Filter by status
GET /v1/projects?status=active

# Filter by date
GET /v1/deployments?since=2024-01-01

# Multiple filters
GET /v1/deployments?projectId=proj_123&status=success
```

## Sorting

Sort results with the `sort` parameter:

```bash
# Sort by created date (newest first)
GET /v1/projects?sort=-createdAt

# Sort by name (ascending)
GET /v1/projects?sort=name
```

## Webhooks

Configure webhooks to receive real-time events:

```bash
POST /v1/webhooks
{
  "url": "https://your-app.com/webhooks/cygni",
  "events": ["deployment.success", "deployment.failed"],
  "secret": "your-webhook-secret"
}
```

## SDK Support

Official SDKs available:

- [Node.js/TypeScript](https://github.com/cygni/cygni-node)
- [Python](https://github.com/cygni/cygni-python)
- [Go](https://github.com/cygni/cygni-go)
- [Ruby](https://github.com/cygni/cygni-ruby)

### Node.js Example

```javascript
import { CygniClient } from '@cygni/sdk';

const client = new CygniClient({
  apiKey: process.env.CYGNI_API_KEY
});

// List projects
const projects = await client.projects.list();

// Deploy a project
const deployment = await client.deployments.create({
  projectId: 'proj_123',
  branch: 'main'
});
```

## API Endpoints

### Core Resources

- [Projects](/docs/api/projects) - Manage applications
- [Deployments](/docs/api/deployments) - Deploy and manage versions
- [Domains](/docs/api/domains) - Custom domain management
- [Environment Variables](/docs/api/env) - Secrets and configuration

### Platform Features

- [Teams](/docs/api/teams) - Team and user management
- [Billing](/docs/api/billing) - Usage and subscriptions
- [Metrics](/docs/api/metrics) - Performance data
- [Logs](/docs/api/logs) - Application logs

### Security

- [API Tokens](/docs/api/tokens) - Token management
- [Audit Logs](/docs/api/audit) - Security events
- [Permissions](/docs/api/permissions) - Access control

## Best Practices

1. **Use Webhooks** - For real-time updates instead of polling
2. **Cache Responses** - Reduce API calls for static data
3. **Handle Errors** - Implement exponential backoff for retries
4. **Use Pagination** - Don't fetch all records at once
5. **Secure Tokens** - Rotate tokens regularly

## Need Help?

- Check our [API Reference](/docs/api/reference)
- Join our [Discord community](https://discord.gg/cygni)
- Email api-support@cygni.dev