export enum AuditEventType {
  // Authentication Events
  USER_LOGIN = "user.login",
  USER_LOGOUT = "user.logout",
  USER_LOGIN_FAILED = "user.login_failed",
  USER_PASSWORD_RESET = "user.password_reset",
  USER_PASSWORD_CHANGED = "user.password_changed",
  USER_MFA_ENABLED = "user.mfa_enabled",
  USER_MFA_DISABLED = "user.mfa_disabled",
  
  // User Management
  USER_CREATED = "user.created",
  USER_UPDATED = "user.updated",
  USER_DELETED = "user.deleted",
  USER_SUSPENDED = "user.suspended",
  USER_REACTIVATED = "user.reactivated",
  USER_ROLE_CHANGED = "user.role_changed",
  
  // Team Management
  TEAM_CREATED = "team.created",
  TEAM_UPDATED = "team.updated",
  TEAM_DELETED = "team.deleted",
  TEAM_MEMBER_ADDED = "team.member_added",
  TEAM_MEMBER_REMOVED = "team.member_removed",
  TEAM_PLAN_CHANGED = "team.plan_changed",
  
  // Project Operations
  PROJECT_CREATED = "project.created",
  PROJECT_UPDATED = "project.updated",
  PROJECT_DELETED = "project.deleted",
  PROJECT_SUSPENDED = "project.suspended",
  PROJECT_REACTIVATED = "project.reactivated",
  
  // Deployment Events
  DEPLOYMENT_CREATED = "deployment.created",
  DEPLOYMENT_UPDATED = "deployment.updated",
  DEPLOYMENT_DELETED = "deployment.deleted",
  DEPLOYMENT_FAILED = "deployment.failed",
  DEPLOYMENT_ROLLBACK = "deployment.rollback",
  
  // API Key Management
  API_KEY_CREATED = "api_key.created",
  API_KEY_REVOKED = "api_key.revoked",
  API_KEY_ROTATED = "api_key.rotated",
  
  // Billing Events
  PAYMENT_METHOD_ADDED = "payment.method_added",
  PAYMENT_METHOD_REMOVED = "payment.method_removed",
  PAYMENT_SUCCEEDED = "payment.succeeded",
  PAYMENT_FAILED = "payment.failed",
  SUBSCRIPTION_CREATED = "subscription.created",
  SUBSCRIPTION_UPDATED = "subscription.updated",
  SUBSCRIPTION_CANCELLED = "subscription.cancelled",
  INVOICE_GENERATED = "invoice.generated",
  INVOICE_PAID = "invoice.paid",
  
  // Security Events
  SECURITY_ALERT_TRIGGERED = "security.alert_triggered",
  RATE_LIMIT_EXCEEDED = "security.rate_limit_exceeded",
  SUSPICIOUS_ACTIVITY = "security.suspicious_activity",
  ACCESS_DENIED = "security.access_denied",
  IP_BLOCKED = "security.ip_blocked",
  
  // Data Access
  DATA_EXPORTED = "data.exported",
  DATA_IMPORTED = "data.imported",
  DATA_DELETED = "data.deleted",
  SENSITIVE_DATA_ACCESSED = "data.sensitive_accessed",
  
  // Configuration Changes
  CONFIG_UPDATED = "config.updated",
  FEATURE_FLAG_CHANGED = "config.feature_flag_changed",
  INTEGRATION_ADDED = "config.integration_added",
  INTEGRATION_REMOVED = "config.integration_removed",
  
  // Compliance
  AUDIT_LOG_EXPORTED = "compliance.audit_exported",
  RETENTION_POLICY_CHANGED = "compliance.retention_changed",
  GDPR_REQUEST_RECEIVED = "compliance.gdpr_request",
  GDPR_DATA_DELETED = "compliance.gdpr_deleted",
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum ActorType {
  USER = "user",
  SYSTEM = "system",
  API_KEY = "api-key",
  WEBHOOK = "webhook",
  SCHEDULED_JOB = "scheduled-job",
}

// Risk level mapping for different event types
export const eventRiskLevels: Record<string, RiskLevel> = {
  // Low risk events
  [AuditEventType.USER_LOGIN]: RiskLevel.LOW,
  [AuditEventType.USER_LOGOUT]: RiskLevel.LOW,
  [AuditEventType.PROJECT_CREATED]: RiskLevel.LOW,
  [AuditEventType.DEPLOYMENT_CREATED]: RiskLevel.LOW,
  
  // Medium risk events
  [AuditEventType.USER_CREATED]: RiskLevel.MEDIUM,
  [AuditEventType.USER_UPDATED]: RiskLevel.MEDIUM,
  [AuditEventType.TEAM_MEMBER_ADDED]: RiskLevel.MEDIUM,
  [AuditEventType.PROJECT_UPDATED]: RiskLevel.MEDIUM,
  [AuditEventType.CONFIG_UPDATED]: RiskLevel.MEDIUM,
  [AuditEventType.PAYMENT_METHOD_ADDED]: RiskLevel.MEDIUM,
  
  // High risk events
  [AuditEventType.USER_DELETED]: RiskLevel.HIGH,
  [AuditEventType.USER_ROLE_CHANGED]: RiskLevel.HIGH,
  [AuditEventType.TEAM_DELETED]: RiskLevel.HIGH,
  [AuditEventType.PROJECT_DELETED]: RiskLevel.HIGH,
  [AuditEventType.API_KEY_CREATED]: RiskLevel.HIGH,
  [AuditEventType.DATA_EXPORTED]: RiskLevel.HIGH,
  [AuditEventType.SENSITIVE_DATA_ACCESSED]: RiskLevel.HIGH,
  [AuditEventType.PAYMENT_FAILED]: RiskLevel.HIGH,
  
  // Critical risk events
  [AuditEventType.USER_LOGIN_FAILED]: RiskLevel.CRITICAL,
  [AuditEventType.SECURITY_ALERT_TRIGGERED]: RiskLevel.CRITICAL,
  [AuditEventType.SUSPICIOUS_ACTIVITY]: RiskLevel.CRITICAL,
  [AuditEventType.ACCESS_DENIED]: RiskLevel.CRITICAL,
  [AuditEventType.IP_BLOCKED]: RiskLevel.CRITICAL,
  [AuditEventType.DATA_DELETED]: RiskLevel.CRITICAL,
  [AuditEventType.GDPR_DATA_DELETED]: RiskLevel.CRITICAL,
};

// Events that should trigger immediate alerts
export const alertableEvents = new Set([
  AuditEventType.USER_LOGIN_FAILED,
  AuditEventType.SECURITY_ALERT_TRIGGERED,
  AuditEventType.SUSPICIOUS_ACTIVITY,
  AuditEventType.ACCESS_DENIED,
  AuditEventType.IP_BLOCKED,
  AuditEventType.USER_DELETED,
  AuditEventType.TEAM_DELETED,
  AuditEventType.DATA_DELETED,
  AuditEventType.API_KEY_CREATED,
]);

// Events that require additional context
export const contextRequiredEvents = new Set([
  AuditEventType.USER_ROLE_CHANGED,
  AuditEventType.TEAM_PLAN_CHANGED,
  AuditEventType.CONFIG_UPDATED,
  AuditEventType.FEATURE_FLAG_CHANGED,
  AuditEventType.RETENTION_POLICY_CHANGED,
]);