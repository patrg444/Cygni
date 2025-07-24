# Role-Based Access Control (RBAC)

This document describes the RBAC implementation that provides fine-grained access control for CloudExpress resources.

## Overview

The RBAC system provides:
- Role-based permissions with custom roles
- Resource-specific access control
- Temporary permissions and roles
- Legacy role compatibility
- Audit trail for all permission changes

## Architecture

### Permission Model

```
User -> UserRole -> Role -> RolePermission -> Permission
  |
  +-> UserPermission -> Permission (direct grants)
  |
  +-> Legacy Role (owner/admin/member)
```

### Resource Permissions

```
Resource -> ResourcePolicy -> {
  read: ["role:viewer", "user:specific-user"],
  write: ["role:developer"],
  delete: ["role:admin"],
  share: ["role:owner"],
  admin: ["user:resource-owner"]
}
```

## Permission Structure

Permissions follow the pattern: `resource.action`

Examples:
- `projects.create`
- `deployments.read`
- `billing.update`
- `users.delete`

## Default Roles

### System Roles (Cannot be modified)

1. **viewer**
   - Read-only access to team resources
   - Permissions: `*.read`

2. **developer**
   - Create and manage deployments
   - Permissions: `projects.*`, `deployments.*`, `*.read`

3. **billing_admin**
   - Manage billing and subscriptions
   - Permissions: `billing.*`, `*.read`

### Legacy Roles (Backward Compatible)

1. **owner**
   - Full access to all resources
   - Cannot be revoked

2. **admin**
   - Manage most resources except billing
   - Create/update users and projects

3. **member**
   - Basic read/write access
   - Cannot delete resources or manage users

## Using Permissions

### Middleware

```typescript
import { requirePermission, requirePermissions } from "./middleware/permission.middleware";

// Single permission check
router.post(
  "/projects",
  requirePermission("projects", "create"),
  async (req, res) => {
    // User has permission to create projects
  }
);

// Multiple permissions (all required)
router.put(
  "/billing/subscription",
  requirePermissions([
    { resource: "billing", action: "read" },
    { resource: "billing", action: "update" }
  ]),
  async (req, res) => {
    // User has both permissions
  }
);

// Any permission
router.get(
  "/reports",
  requireAnyPermission([
    { resource: "reports", action: "read" },
    { resource: "analytics", action: "read" }
  ]),
  async (req, res) => {
    // User has at least one permission
  }
);
```

### In Route Handlers

```typescript
import { checkPermission } from "./middleware/permission.middleware";

router.get("/projects/:id", async (req, res) => {
  // Manual permission check
  const canEdit = await checkPermission(
    req,
    "projects",
    "update",
    req.params.id
  );
  
  res.json({
    project: { ... },
    canEdit,
  });
});
```

### Resource-Specific Permissions

```typescript
// Check access to specific resource
const hasAccess = await resourcePermissionService.checkResourceAccess({
  userId: req.user.userId,
  teamId: req.user.teamId,
  role: req.user.role,
  resourceType: "project",
  resourceId: projectId,
  action: "write",
});
```

## API Endpoints

### Permission Management

#### Get All Permissions
```
GET /api/permissions
```

Returns all available permissions grouped by resource.

#### Get User Permissions
```
GET /api/permissions/user/:userId
Authorization: Bearer <token>
Requires: users.read
```

Returns all permissions for a specific user.

### Role Management

#### Get Team Roles
```
GET /api/roles
Authorization: Bearer <token>
Requires: roles.read
```

#### Create Role
```
POST /api/roles
Authorization: Bearer <token>
Requires: roles.create
Content-Type: application/json

{
  "name": "content-editor",
  "description": "Can edit content",
  "permissions": [
    "projects.read",
    "projects.update",
    "deployments.read"
  ]
}
```

#### Update Role
```
PUT /api/roles/:roleId
Authorization: Bearer <token>
Requires: roles.update
Content-Type: application/json

{
  "name": "senior-developer",
  "permissions": [
    "projects.*",
    "deployments.*",
    "environments.*"
  ]
}
```

#### Delete Role
```
DELETE /api/roles/:roleId
Authorization: Bearer <token>
Requires: roles.delete
```

Note: Cannot delete system roles or roles with active users.

#### Assign Role to Users
```
POST /api/roles/:roleId/users
Authorization: Bearer <token>
Requires: users.update
Content-Type: application/json

{
  "userIds": ["user1", "user2"],
  "expiresAt": "2024-12-31T23:59:59Z" // Optional
}
```

#### Remove Role from User
```
DELETE /api/roles/:roleId/users/:userId
Authorization: Bearer <token>
Requires: users.update
```

### Direct Permission Grants

#### Grant Permission
```
POST /api/permissions/grant
Authorization: Bearer <token>
Requires: owner role
Content-Type: application/json

{
  "userId": "user123",
  "permissionId": "perm456",
  "expiresAt": "2024-06-30T23:59:59Z" // Optional
}
```

### Resource Permissions

#### Set Resource Permissions
```
POST /api/resources/:resourceType/:resourceId/permissions
Authorization: Bearer <token>
Requires: admin permission on resource
Content-Type: application/json

{
  "permissions": {
    "read": ["role:viewer", "user:john@example.com"],
    "write": ["role:developer"],
    "delete": ["role:admin"],
    "share": ["user:owner@example.com"]
  }
}
```

#### Get Resource Permissions
```
GET /api/resources/:resourceType/:resourceId/permissions
Authorization: Bearer <token>
Requires: read permission on resource
```

#### Share Resource
```
POST /api/resources/:resourceType/:resourceId/share
Authorization: Bearer <token>
Requires: share permission on resource
Content-Type: application/json

{
  "users": ["user1", "user2"],
  "roles": ["viewer"],
  "permissions": ["read", "write"]
}
```

#### Get My Shared Resources
```
GET /api/permissions/my-resources
Authorization: Bearer <token>
```

Returns all resources shared with the current user.

### Migration

#### Migrate Legacy Roles
```
POST /api/roles/migrate
Authorization: Bearer <token>
Requires: owner role
```

Migrates users from legacy roles to RBAC roles.

## Implementation Guide

### Creating Custom Permissions

```typescript
// In your initialization code
await permissionService.initializeDefaultPermissions();

// Add custom permissions
await prisma.permission.createMany({
  data: [
    {
      name: "reports.generate",
      resource: "reports",
      action: "generate",
      description: "Generate reports"
    },
    {
      name: "exports.download",
      resource: "exports",
      action: "download",
      description: "Download exports"
    }
  ]
});
```

### Creating Custom Roles

```typescript
const role = await roleService.createRole(teamId, {
  name: "report-viewer",
  description: "Can view and generate reports",
  permissions: [
    "reports.read",
    "reports.generate",
    "exports.download"
  ]
});
```

### Implementing Resource Permissions

```typescript
// When creating a resource
const project = await prisma.project.create({ data: projectData });

// Set initial permissions
await resourcePermissionService.setResourcePermissions(
  teamId,
  "project",
  project.id,
  {
    read: ["role:member"],
    write: [`user:${creatorId}`],
    admin: [`user:${creatorId}`]
  }
);
```

### Checking Permissions in Code

```typescript
// Service layer
async function updateProject(
  userId: string,
  teamId: string,
  projectId: string,
  data: any
) {
  // Check permission
  const hasPermission = await permissionService.hasPermission(
    { userId, teamId, role: user.role },
    { resource: "projects", action: "update", resourceId: projectId }
  );
  
  if (!hasPermission) {
    throw new Error("Permission denied");
  }
  
  // Update project
  return prisma.project.update({
    where: { id: projectId },
    data
  });
}
```

## Best Practices

1. **Use Least Privilege**: Grant only necessary permissions
2. **Prefer Roles**: Use roles instead of direct permission grants
3. **Set Expiration**: Use temporary permissions when appropriate
4. **Audit Changes**: All permission changes are logged
5. **Cache Permissions**: Permissions are cached for 5 minutes

## Security Considerations

1. **Owner Protection**: Team owners always have full access
2. **System Roles**: Cannot be modified or deleted
3. **Resource Policies**: Override general permissions
4. **Fail Closed**: No permission means no access
5. **Audit Trail**: All changes are logged

## Troubleshooting

### Common Issues

1. **"Permission denied" despite having role**
   - Check if resource has specific policy
   - Verify role has required permission
   - Check permission expiration

2. **"System roles cannot be modified"**
   - Clone the role instead
   - Create custom role with needed permissions

3. **"Role is assigned to users"**
   - Remove users from role first
   - Or mark role as inactive

4. **Slow permission checks**
   - Enable Redis caching
   - Check cache configuration
   - Review permission complexity

## Migration from Legacy System

1. **Existing Users**: Keep their current roles
2. **New Features**: Use RBAC permissions
3. **Gradual Migration**: Run `/api/roles/migrate`
4. **Backward Compatible**: Legacy roles still work

## Examples

### Project Manager Role
```json
{
  "name": "project-manager",
  "description": "Manage projects and deployments",
  "permissions": [
    "projects.*",
    "deployments.*",
    "environments.*",
    "users.read",
    "billing.read"
  ]
}
```

### Auditor Role
```json
{
  "name": "auditor",
  "description": "Read-only access with audit capabilities",
  "permissions": [
    "*.read",
    "audit.export",
    "reports.generate"
  ]
}
```

### Temporary Contractor Access
```typescript
// Grant temporary access
await permissionService.grantRole(
  contractorUserId,
  developerRoleId,
  grantedByUserId,
  new Date("2024-12-31")
);

// Or specific resource access
await resourcePermissionService.shareResource(
  teamId,
  "project",
  projectId,
  { users: [contractorUserId] },
  ["read", "write"]
);
```

## Performance

- Permission checks are cached for 5 minutes
- Resource policies are evaluated locally
- Batch operations available for bulk updates
- Indexes on all permission lookups

## Monitoring

Monitor these metrics:
- Permission check latency
- Cache hit rate
- Failed permission attempts
- Role assignment changes

Access audit logs for:
- Permission grants/revokes
- Role changes
- Resource sharing
- Access violations