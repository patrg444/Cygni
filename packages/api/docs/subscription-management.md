# Subscription Management

## Overview

Cygni offers flexible subscription plans to meet the needs of different teams, from individuals to enterprises. Each plan includes resource limits and feature access.

## Subscription Plans

### Free Plan - $0/month
- 1 project
- 2 deployments
- 1 team member
- 100 CPU hours
- 200 Memory GB-hours
- 5 GB storage
- 10 GB bandwidth
- Basic SSL certificates
- 99% SLA

### Starter Plan - $29/month
- 3 projects
- 10 deployments
- 3 team members
- 500 CPU hours
- 1,000 Memory GB-hours
- 50 GB storage
- 100 GB bandwidth
- Custom domains
- Auto-scaling
- 99.5% SLA

### Professional Plan - $99/month
- 10 projects
- 50 deployments
- 10 team members
- 2,000 CPU hours
- 4,000 Memory GB-hours
- 200 GB storage
- 500 GB bandwidth
- Multi-region deployments
- 99.9% SLA

### Enterprise Plan - $499/month
- Unlimited projects
- Unlimited deployments
- Unlimited team members
- Unlimited resources
- Dedicated support
- 99.99% SLA
- Custom contracts available

## API Endpoints

### Plan Information

#### GET /api/subscriptions/plans
Get all available subscription plans.

Response:
```json
{
  "plans": [{
    "id": "starter",
    "name": "Starter",
    "description": "For small teams and projects",
    "monthlyPrice": 29,
    "features": {
      "maxProjects": 3,
      "maxDeployments": 10,
      "customDomains": true,
      ...
    }
  }]
}
```

#### GET /api/subscriptions/current
Get current subscription and usage.

Response:
```json
{
  "plan": {
    "id": "starter",
    "name": "Starter",
    "monthlyPrice": 29
  },
  "usage": {
    "projects": {
      "current": 2,
      "limit": 3,
      "percentage": 66.67
    },
    "resources": {
      "cpuHours": {
        "current": 245,
        "limit": 500,
        "percentage": 49
      }
    }
  }
}
```

### Plan Management

#### POST /api/subscriptions/change-plan
Change to a different subscription plan.

Request:
```json
{
  "planId": "pro"
}
```

Notes:
- Upgrades take effect immediately
- Downgrades require reducing usage first
- Prorated charges/credits are applied

#### GET /api/subscriptions/check-limit
Check if an action is allowed under current plan.

Query parameters:
- `resource` - The resource to check (e.g., "maxProjects")

Response:
```json
{
  "allowed": true,
  "limit": 3,
  "current": 2
}
```

### Team Management

#### GET /api/subscriptions/team
Get team members and limits.

Response:
```json
{
  "team": {
    "id": "team_123",
    "name": "My Team"
  },
  "members": [{
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "lastLoginAt": "2024-01-20T10:30:00Z"
  }],
  "limits": {
    "current": 2,
    "max": 3
  }
}
```

#### POST /api/subscriptions/team/invite
Invite a new team member.

Request:
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

Roles:
- `owner` - Full access, billing management
- `admin` - Manage projects and team
- `member` - Deploy and manage own projects

#### PUT /api/subscriptions/team/:userId
Update team member role.

Request:
```json
{
  "role": "admin"
}
```

#### DELETE /api/subscriptions/team/:userId
Remove team member from team.

### Billing Information

#### GET /api/subscriptions/billing-info
Get billing contact and status.

Response:
```json
{
  "billingEmail": "billing@company.com",
  "hasPaymentMethod": true,
  "subscriptionStatus": "active",
  "currentPeriodEnd": "2024-02-20T00:00:00Z"
}
```

## Plan Limit Enforcement

The API automatically enforces plan limits on:
- Creating new projects
- Adding deployments
- Inviting team members
- Resource usage

When limits are reached, API calls return:
```json
{
  "error": "Plan limit exceeded",
  "details": {
    "resource": "maxProjects",
    "current": 3,
    "limit": 3,
    "plan": "Starter"
  },
  "upgrade": {
    "message": "You've reached the maxProjects limit for the Starter plan. Upgrade to continue.",
    "url": "/settings/billing"
  }
}
```

## Middleware Usage

### Check Plan Limits
```typescript
import { checkPlanLimit } from './middleware/plan-limits';

// Check before creating project
router.post('/projects', 
  checkPlanLimit({ resource: 'maxProjects', increment: 1 }),
  createProjectHandler
);
```

### Require Feature
```typescript
import { requireFeature } from './middleware/plan-limits';

// Check feature availability
router.post('/deployments/multi-region',
  requireFeature('multiRegion'),
  deployMultiRegionHandler
);
```

## Usage Tracking

Resources are tracked automatically:
- CPU hours (vCPU usage)
- Memory GB-hours
- Storage GB
- Bandwidth GB
- API requests

Usage resets on the first day of each month.

## Upgrade/Downgrade Process

### Upgrading
1. Choose new plan
2. Confirm billing changes
3. Access new features immediately
4. Receive prorated credit

### Downgrading
1. Reduce usage below new plan limits
2. Choose lower plan
3. Confirm changes
4. Receive prorated refund

## Team Roles and Permissions

### Owner
- Change subscription plan
- Manage billing
- Add/remove team members
- All admin permissions

### Admin
- Create/delete projects
- Manage deployments
- Invite team members
- View usage and billing

### Member
- Create deployments
- View own projects
- Limited to assigned resources

## Best Practices

1. **Monitor Usage**: Check dashboard regularly
2. **Set Budgets**: Configure spending alerts
3. **Right-size**: Choose plan based on actual needs
4. **Team Management**: Use roles effectively
5. **Plan Ahead**: Upgrade before hitting limits