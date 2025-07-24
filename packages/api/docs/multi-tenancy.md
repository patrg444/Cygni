# Multi-Tenancy Architecture

This document describes the multi-tenancy implementation that ensures complete data isolation between teams in the CloudExpress platform.

## Overview

CloudExpress implements a comprehensive multi-tenancy architecture with:
- Row-level security (RLS) at the database level
- Tenant context middleware for all requests
- Tenant-aware caching with Redis
- Automatic tenant filtering for all queries
- Cross-tenant reference validation
- Tenant-specific resource limits

## Architecture Components

### 1. Tenant Isolation Service

The `TenantIsolationService` provides core functionality for tenant isolation:

```typescript
import { getTenantIsolationService } from "./services/security/tenant-isolation.service";

const tenantService = getTenantIsolationService(prisma);

// Extract tenant context from request
const context = tenantService.extractTenantContext(req);

// Validate resource access
const hasAccess = await tenantService.validateResourceAccess(
  "project",
  projectId,
  context
);
```

### 2. Tenant Context Middleware

All authenticated requests automatically have tenant context applied:

```typescript
import { tenantContextMiddleware } from "./middleware/tenant-context.middleware";

// Apply globally
app.use(tenantContextMiddleware);

// Access in route handlers
router.get("/projects", async (req: TenantRequest, res) => {
  // Use tenant-scoped Prisma client
  const projects = await req.tenantPrisma.project.findMany();
  // Automatically filtered by teamId
});
```

### 3. Row-Level Security (RLS)

Prisma middleware automatically applies tenant filters:

```typescript
// Direct tenant models (have teamId field)
const projects = await prisma.project.findMany();
// Automatically adds: WHERE teamId = context.teamId

// Indirect tenant models (related through another model)
const deployments = await prisma.deployment.findMany();
// Automatically adds: WHERE project.teamId = context.teamId

// User-scoped models
const notifications = await prisma.notification.findMany();
// Automatically adds: WHERE userId = context.userId
```

### 4. Tenant-Aware Caching

Cache isolation ensures tenant data separation:

```typescript
import { getTenantCacheService } from "./services/cache/tenant-cache.service";

const cache = getTenantCacheService();

// Set cache value
await cache.set(teamId, "key", value, { ttl: 300 });

// Get cache value
const cached = await cache.get(teamId, "key");

// Cache-aside pattern
const data = await cache.getOrSet(
  teamId,
  "expensive-computation",
  async () => computeExpensiveData(),
  { ttl: 600 }
);
```

## Security Model

### Data Access Rules

1. **Team-Owned Resources**: Projects, Invoices, Audit Logs
   - Always filtered by `teamId`
   - Cannot access resources from other teams

2. **User-Owned Resources**: Notifications, OAuth Accounts
   - Always filtered by `userId`
   - Personal to each user

3. **Indirect Resources**: Deployments, Environments
   - Filtered through parent relationship
   - E.g., deployments filtered by `project.teamId`

### Permission Levels

- **Owner**: Full access to all team resources
- **Admin**: Can manage team members and most resources
- **Member**: Read/write access to team resources

## Implementation Guide

### 1. Setting Up Middleware

```typescript
// In server.ts
import { tenantContextMiddleware } from "./middleware/tenant-context.middleware";
import { enforceTenantIsolation } from "./middleware/tenant-context.middleware";

// Apply after authentication middleware
app.use(jwtMiddleware);
app.use(tenantContextMiddleware);

// Enforce isolation for specific routes
router.get(
  "/projects/:id",
  enforceTenantIsolation("project"),
  async (req, res) => {
    // Access already validated
  }
);
```

### 2. Using Tenant-Scoped Prisma

```typescript
// In route handlers
router.post("/projects", async (req: TenantRequest, res) => {
  // Use tenant-scoped client
  const project = await req.tenantPrisma.project.create({
    data: {
      name: req.body.name,
      slug: req.body.slug,
      // teamId automatically added
    },
  });
  
  res.json(project);
});
```

### 3. Validating Cross-Tenant References

```typescript
import { validateCrossTenantReferences } from "./middleware/tenant-context.middleware";

router.post(
  "/deployments",
  validateCrossTenantReferences("deployment", "project", "projectId"),
  async (req, res) => {
    // projectId already validated to belong to tenant
  }
);
```

### 4. Implementing Tenant Limits

```typescript
import { validateTenantLimits } from "./middleware/tenant-context.middleware";

// Limit teams to 10 projects
router.post(
  "/projects",
  validateTenantLimits("projects", 10),
  async (req, res) => {
    // Create project
  }
);
```

## Cache Strategy

### Cache Namespaces

Use namespaces to organize cached data:

```typescript
// User data
await cache.set(teamId, userId, userData, {
  namespace: "users",
  ttl: 300,
});

// Project data
await cache.set(teamId, projectId, projectData, {
  namespace: "projects",
  ttl: 600,
});

// Clear all project cache for a team
await cache.clearNamespace(teamId, "projects");
```

### Cache Warming

Pre-populate cache for frequently accessed data:

```typescript
await cache.warmCache(teamId, [
  {
    key: "team-settings",
    factory: () => getTeamSettings(teamId),
    options: { ttl: 3600 },
  },
  {
    key: "user-list",
    factory: () => getTeamUsers(teamId),
    options: { namespace: "users", ttl: 600 },
  },
]);
```

## Data Export and Deletion

### Export Tenant Data (GDPR Compliance)

```typescript
const exportData = await tenantService.exportTenantData(teamId);

// Returns:
{
  team: { ... },
  users: [ ... ],
  projects: [ ... ],
  invoices: [ ... ],
  auditLogs: [ ... ],
  exportedAt: "2024-01-15T10:30:00Z"
}
```

### Delete Tenant Data

```typescript
// Requires explicit confirmation
const result = await tenantService.deleteTenantData(teamId, true);

// Deletes all tenant data in correct order
// Respects foreign key constraints
```

## Monitoring and Debugging

### Tenant Statistics

```typescript
const stats = await tenantService.getTenantStats(teamId);

// Returns:
{
  users: 5,
  projects: 3,
  deployments: 12,
  storageGB: 4.5
}
```

### Cache Statistics

```typescript
const cacheStats = await cache.getStats(teamId);

// Returns:
{
  keys: 42,
  memoryUsage: 1048576 // bytes
}
```

### Audit Trail

All tenant operations are automatically logged:

```
- Resource access attempts
- Cross-tenant violations
- Data exports
- Permission changes
```

## Testing

### Unit Tests

```typescript
describe("Tenant Isolation", () => {
  it("should filter by tenant", async () => {
    const context = { teamId: "team1", userId: "user1", role: "owner" };
    const tenantPrisma = createTenantPrismaClient(prisma, context);
    
    const projects = await tenantPrisma.project.findMany();
    expect(projects.every(p => p.teamId === "team1")).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe("Tenant API", () => {
  it("should prevent cross-tenant access", async () => {
    const response = await request(app)
      .get("/api/projects/other-team-project-id")
      .set("Authorization", `Bearer ${team1Token}`);
      
    expect(response.status).toBe(403);
  });
});
```

## Best Practices

1. **Always use tenant-scoped Prisma**: Use `req.tenantPrisma` instead of raw `prisma`
2. **Validate references**: Use middleware to validate cross-model references
3. **Cache strategically**: Use appropriate TTLs and namespaces
4. **Monitor violations**: Log and alert on access violations
5. **Test isolation**: Include tenant isolation in your test suite

## Common Patterns

### Tenant-Aware Pagination

```typescript
router.get("/projects", async (req: TenantRequest, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  const projects = await req.tenantPrisma.project.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  
  const total = await req.tenantPrisma.project.count();
  
  res.json({
    data: projects,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
```

### Tenant-Aware Search

```typescript
router.get("/search", async (req: TenantRequest, res) => {
  const { q } = req.query;
  
  const results = await req.tenantPrisma.project.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
  });
  
  res.json(results);
});
```

### Tenant-Aware Aggregations

```typescript
router.get("/stats", async (req: TenantRequest, res) => {
  const stats = await req.tenantPrisma.usageEvent.aggregate({
    where: {
      timestamp: { gte: startOfMonth },
    },
    _sum: {
      quantity: true,
    },
    _count: true,
    groupBy: ["metricType"],
  });
  
  res.json(stats);
});
```

## Troubleshooting

### Common Issues

1. **"Access denied: No tenant context"**
   - Ensure authentication middleware runs before tenant middleware
   - Check that JWT contains teamId

2. **Resources from wrong tenant appearing**
   - Verify using `req.tenantPrisma` not raw `prisma`
   - Check for missing middleware on route

3. **Cache not isolated between tenants**
   - Ensure using tenant-aware cache service
   - Verify teamId is passed to all cache operations

4. **Cross-tenant reference allowed**
   - Add validation middleware to routes
   - Check foreign key relationships

## Migration Guide

For existing codebases, follow these steps:

1. Add tenant context middleware
2. Replace `prisma` with `req.tenantPrisma` in routes
3. Add validation middleware to routes with references
4. Implement tenant-aware caching
5. Add tenant isolation tests
6. Monitor for violations during rollout