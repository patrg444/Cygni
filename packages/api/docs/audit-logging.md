# Audit Logging Guide

## Overview

Cygni's audit logging system provides comprehensive tracking of all security-relevant events and API actions for compliance, security monitoring, and forensic analysis. The system captures who did what, when, and from where, with automatic risk assessment and retention management.

## Architecture

### Components

1. **Audit Logger Service** - Core logging engine with batching
2. **Audit Middleware** - Automatic API request/response logging
3. **Event Types** - Predefined security and compliance events
4. **Risk Assessment** - Automatic risk level assignment
5. **Retention Service** - Automated log archival and deletion
6. **Query API** - Secure access to audit logs

### Data Flow

```
API Request → Audit Middleware → Audit Logger → Batch Queue
                                       ↓
                                  Database
                                       ↓
                              Retention Service → Archive (S3)
```

## Audit Event Categories

### Authentication & Access
- `user.login` - Successful login
- `user.logout` - User logout
- `user.login_failed` - Failed login attempt
- `user.password_reset` - Password reset request
- `user.password_changed` - Password change
- `user.mfa_enabled/disabled` - MFA changes

### User Management
- `user.created` - New user account
- `user.updated` - User profile update
- `user.deleted` - User deletion
- `user.suspended` - Account suspension
- `user.role_changed` - Permission changes

### Team & Organization
- `team.created` - New team/organization
- `team.updated` - Team settings change
- `team.member_added` - New team member
- `team.member_removed` - Member removal
- `team.plan_changed` - Subscription change

### Infrastructure
- `project.created/updated/deleted` - Project lifecycle
- `deployment.created` - New deployment
- `deployment.failed` - Deployment failure
- `deployment.rollback` - Rollback action

### Security Events
- `security.alert_triggered` - Security alert
- `security.rate_limit_exceeded` - Rate limiting
- `security.suspicious_activity` - Anomaly detection
- `security.access_denied` - Authorization failure
- `security.ip_blocked` - IP blocking

### Data Operations
- `data.exported` - Data export
- `data.imported` - Data import
- `data.deleted` - Data deletion
- `data.sensitive_accessed` - Sensitive data access

### Billing & Payments
- `payment.method_added` - Payment method
- `payment.succeeded/failed` - Payment status
- `subscription.created/updated/cancelled` - Subscription changes

### Compliance
- `compliance.audit_exported` - Audit log export
- `compliance.retention_changed` - Policy update
- `compliance.gdpr_request` - GDPR request
- `compliance.gdpr_deleted` - GDPR deletion

## Risk Levels

Each event is automatically assigned a risk level:

| Level | Description | Examples | Action Required |
|-------|-------------|----------|-----------------|
| LOW | Normal operations | Login, read operations | None |
| MEDIUM | Configuration changes | User updates, settings | Monitor |
| HIGH | Sensitive operations | Deletions, exports | Review |
| CRITICAL | Security events | Failed logins, breaches | Alert |

## Implementation

### Automatic Logging

The audit middleware automatically logs all API requests:

```typescript
// Applied globally in server.ts
app.use(auditMiddleware);
```

### Manual Logging

For custom events:

```typescript
import { logAuditEvent } from './middleware/audit.middleware';
import { AuditEventType } from './services/audit/audit-events';

// Log a custom event
await logAuditEvent(
  AuditEventType.DATA_EXPORTED,
  'report',
  reportId,
  {
    user: req.user,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  },
  {
    metadata: {
      format: 'csv',
      recordCount: 1000,
    }
  }
);
```

### Sensitive Operations

Add explicit audit logging for sensitive operations:

```typescript
router.delete('/api/users/:id', 
  auditSensitiveOperation(AuditEventType.USER_DELETED, 'user'),
  async (req, res) => {
    // Delete operation
  }
);
```

## API Endpoints

### Query Audit Logs

```http
GET /api/audit/logs?startDate=2024-01-01&limit=100
Authorization: Bearer <admin-token>

Response:
{
  "logs": [
    {
      "id": "abc123",
      "timestamp": "2024-01-15T10:30:00Z",
      "action": "user.login",
      "actorEmail": "user@example.com",
      "actorIp": "192.168.1.1",
      "resourceType": "auth",
      "riskLevel": "low",
      "metadata": {...}
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1523
  }
}
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| actorId | string | Filter by user ID |
| action | string | Filter by event type |
| resourceType | string | Filter by resource |
| resourceId | string | Filter by specific resource |
| startDate | ISO 8601 | Start of date range |
| endDate | ISO 8601 | End of date range |
| riskLevel | string | Filter by risk level |
| limit | number | Results per page (max 1000) |
| offset | number | Pagination offset |

### Get Audit Statistics

```http
GET /api/audit/stats?days=30
Authorization: Bearer <admin-token>

Response:
{
  "stats": {
    "totalEvents": 15234,
    "byAction": [...],
    "byRiskLevel": [...],
    "topActors": [...],
    "period": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    }
  }
}
```

### Export Audit Logs

```http
GET /api/audit/export?format=csv&startDate=2024-01-01
Authorization: Bearer <admin-token>

Response: CSV file download
```

### Manage Retention Policy

```http
PUT /api/audit/retention
Authorization: Bearer <owner-token>
Content-Type: application/json

{
  "retentionDays": 365,
  "archiveEnabled": true,
  "archiveLocation": "s3://audit-archive"
}
```

## Retention & Archival

### Default Retention

- **Default**: 90 days
- **Configurable**: 30 days to 10 years
- **Archival**: Optional S3/Azure backup

### Retention Process

1. Daily job runs at 2 AM UTC
2. Identifies logs older than retention period
3. Archives to S3 if enabled (compressed JSON)
4. Deletes from database
5. Logs retention action

### Archive Format

```json
{
  "timestamp": "2024-01-15T02:00:00Z",
  "count": 1000,
  "logs": [...]
}
```

Stored as: `s3://bucket/audit-logs/{teamId}/{timestamp}.json.gz`

## Security Considerations

### Access Control

- Only admins can view audit logs
- Only owners can change retention policy
- Audit log exports are logged
- No PII in audit logs (sanitized)

### Data Protection

```typescript
// Sensitive fields are automatically redacted
const sanitizeData = (data) => {
  // Redacts: password, token, secret, privateKey, creditCard, cvv, ssn
};
```

### Immutability

- Audit logs cannot be modified
- Deletion only through retention policy
- All actions logged, including audit access

## Compliance

### SOC2 Requirements

- ✅ User activity logging
- ✅ System access logging
- ✅ Change management tracking
- ✅ Security event monitoring
- ✅ Log retention policies
- ✅ Log integrity protection

### GDPR Compliance

- User data access tracking
- Deletion request logging
- Export capabilities
- Configurable retention
- Right to be forgotten support

### HIPAA Considerations

- PHI access logging
- Minimum necessary tracking
- Audit log encryption
- Access reports

## Monitoring & Alerts

### Key Metrics

```promql
# Failed login attempts
sum(rate(audit_logs_total{action="user.login_failed"}[5m]))

# High-risk events
sum(audit_logs_total{risk_level="critical"})

# Audit log growth rate
rate(audit_logs_total[1h])

# Top actors by event count
topk(10, sum by (actor_email) (audit_logs_total))
```

### Alert Rules

```yaml
- alert: HighFailedLoginRate
  expr: rate(audit_logs_total{action="user.login_failed"}[5m]) > 10
  annotations:
    summary: "High rate of failed login attempts"

- alert: SuspiciousActivity
  expr: audit_logs_total{risk_level="critical"} > 5
  annotations:
    summary: "Multiple critical security events detected"

- alert: AuditLogRetentionFailure
  expr: audit_retention_failures > 0
  annotations:
    summary: "Audit log retention job failed"
```

## Best Practices

### Development

1. **Log Meaningful Events**: Focus on security and compliance
2. **Include Context**: User, IP, user agent, request details
3. **Avoid Over-Logging**: Don't log every read operation
4. **Sanitize Data**: Never log passwords or tokens
5. **Use Event Types**: Stick to predefined event types

### Operations

1. **Regular Reviews**: Monthly audit log analysis
2. **Retention Planning**: Balance compliance vs storage
3. **Access Monitoring**: Track who views audit logs
4. **Export Backups**: Regular compliance exports
5. **Test Recovery**: Verify archive restoration

### Compliance

1. **Document Policies**: Written audit log procedures
2. **Train Staff**: Audit log importance and access
3. **Regular Audits**: Verify logging completeness
4. **Incident Response**: Use logs for investigation
5. **Report Generation**: Compliance reporting

## Troubleshooting

### Missing Logs

1. Check middleware is applied
2. Verify batch flushing
3. Check database connectivity
4. Review error logs

### Performance Issues

1. Adjust batch size (default: 100)
2. Increase flush interval (default: 5s)
3. Add database indexes
4. Archive old logs

### Query Performance

```sql
-- Ensure indexes exist
CREATE INDEX idx_audit_timestamp ON "AuditLog"(timestamp);
CREATE INDEX idx_audit_actor ON "AuditLog"(actorId);
CREATE INDEX idx_audit_team ON "AuditLog"(teamId);
CREATE INDEX idx_audit_action ON "AuditLog"(action);
```

## Integration Examples

### SIEM Integration

```javascript
// Forward to Splunk/ELK
const forwardToSiem = async (log) => {
  await fetch('https://siem.company.com/audit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SIEM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(log),
  });
};
```

### Slack Notifications

```javascript
// Alert on critical events
if (log.riskLevel === 'critical') {
  await slack.send({
    channel: '#security-alerts',
    text: `🚨 Critical audit event: ${log.action}`,
    attachments: [{
      fields: [
        { title: 'Actor', value: log.actorEmail },
        { title: 'Resource', value: log.resourceType },
        { title: 'IP', value: log.actorIp },
      ],
    }],
  });
}
```

## Migration Guide

### Enabling Audit Logging

1. Run database migrations
2. Configure retention policy
3. Apply middleware
4. Test with non-production
5. Enable in production

### Upgrading

When upgrading the audit system:
1. Export existing logs
2. Run migration scripts
3. Verify data integrity
4. Update retention policies
5. Test query performance