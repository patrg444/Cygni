# API Versioning

## Overview

The Cygni API uses URL-based versioning to ensure backward compatibility while allowing the platform to evolve. Each API version is accessible via a versioned URL path (e.g., `/api/v1/`, `/api/v2/`).

## Current Versions

- **v2** (Current) - Latest features and improvements
- **v1** (Supported) - Original API, maintained for backward compatibility

## Version Selection

### URL-Based Versioning

Include the version in the URL path:

```bash
# v1 API
GET https://api.cygni.dev/api/v1/projects

# v2 API
GET https://api.cygni.dev/api/v2/projects
```

### Default Version

If no version is specified, the API defaults to v1 for backward compatibility:

```bash
# Defaults to v1
GET https://api.cygni.dev/api/projects
```

## Version Information

### Get Available Versions

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
  ],
  "deprecationPolicy": {
    "notice": "Deprecated versions will be supported for at least 6 months after deprecation",
    "process": [...]
  }
}
```

### Check Current Request Version

```bash
GET /api/version
```

Response:
```json
{
  "version": "v2",
  "current": true,
  "deprecated": false
}
```

## Response Headers

Every API response includes version information in headers:

```
X-API-Version: v2
X-API-Current-Version: v2
```

For deprecated versions:
```
X-API-Deprecated: true
X-API-Deprecation-Date: 2024-12-31
X-API-End-Of-Life: 2025-06-30
X-API-Recommended-Version: v2
```

## Version Differences

### v1 vs v2 Comparison

| Feature | v1 | v2 |
|---------|----|----|
| Basic CRUD operations | ✅ | ✅ |
| Pagination | Basic | Enhanced with cursor support |
| Filtering | Limited | Advanced query parameters |
| Response format | Simple | Detailed with metadata |
| Rate limiting | Per IP | Per user/team |
| New endpoints | - | Projects, Deployments, Users |

### New in v2

1. **Enhanced Project Management**
   - `/api/v2/projects` - Advanced project operations
   - Filtering by status, search, custom sorting
   - Build configuration management

2. **Deployment API**
   - `/api/v2/deployments` - Full deployment lifecycle
   - Log streaming support
   - Rollback capabilities

3. **User Management**
   - `/api/v2/users/me` - Current user profile
   - `/api/v2/users` - Team user management

4. **Improved Response Format**
   ```json
   {
     "data": [...],
     "pagination": {
       "page": 1,
       "limit": 10,
       "total": 100,
       "totalPages": 10
     },
     "metadata": {
       "version": "v2",
       "timestamp": "2024-01-01T00:00:00Z"
     }
   }
   ```

## Migration Guide

### Migrating from v1 to v2

1. **Update Base URLs**
   ```bash
   # Old
   https://api.cygni.dev/api/projects
   
   # New
   https://api.cygni.dev/api/v2/projects
   ```

2. **Handle Pagination Changes**
   ```javascript
   // v1 response
   const projects = response.data; // Array
   
   // v2 response
   const { projects, pagination } = response.data;
   ```

3. **Update Error Handling**
   v2 provides more detailed error responses:
   ```json
   {
     "error": "Validation failed",
     "code": "VALIDATION_ERROR",
     "details": [
       {
         "field": "name",
         "message": "Name is required"
       }
     ]
   }
   ```

## Deprecation Policy

1. **Advance Notice**: Versions are marked deprecated at least 6 months before removal
2. **Deprecation Headers**: API responses include deprecation warnings
3. **Migration Period**: At least 3 months between end-of-life announcement and removal
4. **Documentation**: Migration guides provided for all breaking changes

## Version-Specific Features

### Using Version-Specific Endpoints

Some endpoints only exist in certain versions:

```javascript
// Only available in v2+
const response = await fetch('/api/v2/deployments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectId: 'project-123',
    environment: 'production'
  })
});
```

### Conditional Logic by Version

```javascript
// Check API version from response headers
const apiVersion = response.headers.get('X-API-Version');

if (apiVersion === 'v2') {
  // Use v2 features
  const { data, pagination } = await response.json();
} else {
  // v1 compatibility
  const data = await response.json();
}
```

## Best Practices

1. **Always Specify Version**: Explicitly include the API version in your requests
2. **Monitor Deprecation Headers**: Watch for deprecation warnings in responses
3. **Test with Latest Version**: Regularly test your integration with the latest API version
4. **Handle Version Errors**: Implement fallbacks for version-specific features

## SDK Support

Official SDKs handle versioning automatically:

```javascript
import { CygniClient } from '@cygni/sdk';

// Specify version during initialization
const client = new CygniClient({
  apiKey: 'your-api-key',
  version: 'v2' // Optional, defaults to latest stable
});

// SDK handles version-specific endpoints
const projects = await client.projects.list({
  status: 'active',
  page: 1,
  limit: 20
});
```

## Backwards Compatibility

We maintain backward compatibility within major versions:

- ✅ Adding new optional parameters
- ✅ Adding new endpoints
- ✅ Adding new fields to responses
- ❌ Removing endpoints (requires new version)
- ❌ Changing required parameters (requires new version)
- ❌ Removing response fields (requires new version)

## Support

- **Version Status**: Check `/api/versions` for current support status
- **Migration Help**: Contact support@cygni.dev for migration assistance
- **Changelog**: View detailed changes at docs.cygni.dev/changelog