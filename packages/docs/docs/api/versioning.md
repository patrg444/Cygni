---
sidebar_position: 6
---

# API Versioning

Cygni uses URL-based versioning to ensure backward compatibility while continuously improving the platform.

## Overview

- **Current Version**: v2
- **Default Version**: v1 (for backward compatibility)
- **Versioning Strategy**: URL path-based (e.g., `/api/v1/`, `/api/v2/`)

## Using API Versions

### Specifying Version

Include the version in your API endpoint URL:

```bash
# Version 1
curl https://api.cygni.dev/api/v1/projects \
  -H "Authorization: Bearer YOUR_TOKEN"

# Version 2 (recommended)
curl https://api.cygni.dev/api/v2/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Default Behavior

If no version is specified, requests default to v1:

```bash
# Defaults to v1
curl https://api.cygni.dev/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Version Information

### Check Available Versions

```bash
GET /api/versions
```

Response:
```json
{
  "currentVersion": "v2",
  "defaultVersion": "v1",
  "versions": [
    {
      "version": "v1",
      "deprecated": false,
      "current": false,
      "default": true
    },
    {
      "version": "v2",
      "deprecated": false,
      "current": true,
      "default": false
    }
  ]
}
```

### Response Headers

Every API response includes version information:

```
X-API-Version: v2
X-API-Current-Version: v2
```

## What's New in v2

### Enhanced Project Management

The v2 API provides richer project management capabilities:

```typescript
// v2: Enhanced project listing with filtering
const response = await fetch('/api/v2/projects?status=active&page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { projects, pagination } = await response.json();
```

### New Endpoints

#### Deployments API
```typescript
// Create deployment
const deployment = await fetch('/api/v2/deployments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectId: 'project-123',
    environment: 'production',
    branch: 'main'
  })
});

// Stream deployment logs
const logs = await fetch('/api/v2/deployments/dep-123/logs?follow=true', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

#### User Management
```typescript
// Get current user profile
const profile = await fetch('/api/v2/users/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// List team users (admin only)
const users = await fetch('/api/v2/users?page=1&limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Improved Response Format

v2 responses include consistent pagination and metadata:

```json
{
  "projects": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

## Migration Guide

### From v1 to v2

1. **Update Base URLs**
   ```javascript
   // Old
   const API_BASE = 'https://api.cygni.dev/api';
   
   // New
   const API_BASE = 'https://api.cygni.dev/api/v2';
   ```

2. **Handle Pagination**
   ```javascript
   // v1
   const projects = response.data;
   
   // v2
   const { projects, pagination } = response.data;
   ```

3. **Use New Features**
   ```javascript
   // Take advantage of v2 filtering
   const activeProjects = await client.get('/projects', {
     params: {
       status: 'active',
       sortBy: 'updatedAt',
       sortOrder: 'desc'
     }
   });
   ```

## Version Support Policy

- **Deprecation Notice**: At least 6 months advance notice
- **End-of-Life**: Minimum 3 months after deprecation announcement
- **Migration Support**: Dedicated guides and tooling provided

## SDK Support

Our official SDKs handle versioning automatically:

```javascript
import { CygniClient } from '@cygni/sdk';

const client = new CygniClient({
  apiKey: process.env.CYGNI_API_KEY,
  version: 'v2' // Optional, defaults to latest stable
});

// SDK automatically uses correct endpoints
const projects = await client.projects.list({
  status: 'active',
  page: 1
});
```

## Best Practices

1. **Always specify version explicitly** in production code
2. **Monitor deprecation headers** in API responses
3. **Test with new versions** before they become default
4. **Use versioned SDKs** for automatic compatibility

## Backward Compatibility

Within a major version, we guarantee:

- ✅ No removal of existing endpoints
- ✅ No changes to required parameters
- ✅ No removal of response fields
- ✅ Addition of optional parameters is allowed
- ✅ Addition of response fields is allowed

## Getting Help

- **API Reference**: See version-specific docs
- **Migration Assistance**: support@cygni.dev
- **Status Updates**: status.cygni.dev