import { PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";
import { getAuditLogger } from "../audit/audit-logger.service";
import { getTenantCacheService } from "../cache/tenant-cache.service";
import logger from "../../lib/logger";

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  teamId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: any;
  timestamp: Date;
  status: "new" | "investigating" | "resolved" | "false_positive";
  assignedTo?: string;
  resolution?: string;
}

export enum SecurityEventType {
  // Authentication events
  LOGIN_FAILED = "login_failed",
  LOGIN_SUCCESS = "login_success",
  LOGIN_ANOMALY = "login_anomaly",
  PASSWORD_RESET = "password_reset",
  MFA_FAILED = "mfa_failed",
  
  // Authorization events
  UNAUTHORIZED_ACCESS = "unauthorized_access",
  PRIVILEGE_ESCALATION = "privilege_escalation",
  PERMISSION_DENIED = "permission_denied",
  
  // Data events
  DATA_EXPORT = "data_export",
  DATA_DELETION = "data_deletion",
  SENSITIVE_DATA_ACCESS = "sensitive_data_access",
  
  // System events
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  API_ABUSE = "api_abuse",
  
  // Compliance events
  POLICY_VIOLATION = "policy_violation",
  RETENTION_FAILURE = "retention_failure",
  ENCRYPTION_FAILURE = "encryption_failure",
}

export interface SecurityAlert {
  id: string;
  eventId: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommendations: string[];
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface SecurityMetrics {
  period: { start: Date; end: Date };
  eventCounts: Record<SecurityEventType, number>;
  severityCounts: Record<string, number>;
  topSources: Array<{ source: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  trends: {
    eventsPerDay: Array<{ date: string; count: number }>;
    severityTrend: Array<{ date: string; high: number; medium: number; low: number }>;
  };
  mttr: number; // Mean time to resolve (minutes)
  falsePositiveRate: number;
}

export class SecurityEventMonitorService extends EventEmitter {
  private prisma: PrismaClient;
  private auditLogger = getAuditLogger(this.prisma);
  private cache = getTenantCacheService();
  
  // Alert thresholds
  private thresholds = {
    failedLogins: 5,
    rateLimit: 100,
    dataExport: 1000, // records
    suspiciousPatterns: 3,
  };

  // Event patterns for detection
  private patterns = {
    bruteForce: /login_failed.*login_failed.*login_failed/,
    scanning: /404.*404.*404.*404/,
    injection: /(<script|SELECT.*FROM|DROP.*TABLE|alert\(|onerror=)/i,
    traversal: /(\.\.|\/etc\/|\/windows\/|%2e%2e)/i,
  };

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.setupEventHandlers();
  }

  // Set up internal event handlers
  private setupEventHandlers(): void {
    this.on("security_event", async (event: SecurityEvent) => {
      await this.processSecurityEvent(event);
    });

    this.on("alert", async (alert: SecurityAlert) => {
      await this.sendAlert(alert);
    });
  }

  // Log security event
  async logSecurityEvent(
    type: SecurityEventType,
    details: Partial<SecurityEvent>
  ): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity: this.determineSeverity(type, details),
      source: details.source || "system",
      teamId: details.teamId,
      userId: details.userId,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,
      details: details.details || {},
      timestamp: new Date(),
      status: "new",
    };

    // Store in audit log
    await this.auditLogger.log({
      action: `security.event.${type}`,
      actorType: details.userId ? "user" : "system",
      actorId: details.userId,
      teamId: details.teamId,
      metadata: event,
      riskLevel: event.severity as any,
    });

    // Emit for processing
    this.emit("security_event", event);

    logger.info("Security event logged", {
      type,
      severity: event.severity,
      teamId: event.teamId,
    });

    return event;
  }

  // Process security event
  private async processSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Check if event requires alert
      const shouldAlert = await this.shouldAlert(event);
      
      if (shouldAlert) {
        const alert = await this.createAlert(event);
        this.emit("alert", alert);
      }

      // Update security metrics
      await this.updateMetrics(event);

      // Check for patterns
      await this.detectPatterns(event);

      // Auto-respond to critical events
      if (event.severity === "critical") {
        await this.autoRespond(event);
      }
    } catch (error) {
      logger.error("Failed to process security event", { error, event });
    }
  }

  // Determine event severity
  private determineSeverity(
    type: SecurityEventType,
    details: Partial<SecurityEvent>
  ): "low" | "medium" | "high" | "critical" {
    // Critical events
    if ([
      SecurityEventType.PRIVILEGE_ESCALATION,
      SecurityEventType.DATA_DELETION,
      SecurityEventType.ENCRYPTION_FAILURE,
    ].includes(type)) {
      return "critical";
    }

    // High severity
    if ([
      SecurityEventType.UNAUTHORIZED_ACCESS,
      SecurityEventType.SENSITIVE_DATA_ACCESS,
      SecurityEventType.POLICY_VIOLATION,
    ].includes(type)) {
      return "high";
    }

    // Medium severity
    if ([
      SecurityEventType.LOGIN_ANOMALY,
      SecurityEventType.RATE_LIMIT_EXCEEDED,
      SecurityEventType.API_ABUSE,
    ].includes(type)) {
      return "medium";
    }

    // Check details for severity indicators
    if (details.details?.attempts && details.details.attempts > 10) {
      return "high";
    }

    return "low";
  }

  // Check if event should trigger alert
  private async shouldAlert(event: SecurityEvent): Promise<boolean> {
    // Always alert on critical
    if (event.severity === "critical") return true;

    // Check alert rules
    switch (event.type) {
      case SecurityEventType.LOGIN_FAILED:
        const recentFailures = await this.countRecentEvents(
          event.teamId || "",
          SecurityEventType.LOGIN_FAILED,
          5 // minutes
        );
        return recentFailures >= this.thresholds.failedLogins;

      case SecurityEventType.RATE_LIMIT_EXCEEDED:
        return true; // Always alert

      case SecurityEventType.DATA_EXPORT:
        return event.details?.recordCount > this.thresholds.dataExport;

      case SecurityEventType.SUSPICIOUS_ACTIVITY:
        return event.severity === "high";

      default:
        return event.severity === "high";
    }
  }

  // Create alert from event
  private async createAlert(event: SecurityEvent): Promise<SecurityAlert> {
    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      title: this.getAlertTitle(event),
      description: this.getAlertDescription(event),
      recommendations: this.getRecommendations(event),
      createdAt: new Date(),
      acknowledged: false,
    };

    // Store alert
    await this.cache.set(
      event.teamId || "system",
      `alert:${alert.id}`,
      alert,
      { namespace: "security", ttl: 86400 } // 24 hours
    );

    return alert;
  }

  // Get alert title
  private getAlertTitle(event: SecurityEvent): string {
    const titles: Record<SecurityEventType, string> = {
      [SecurityEventType.LOGIN_FAILED]: "Multiple Failed Login Attempts",
      [SecurityEventType.LOGIN_SUCCESS]: "Successful Login",
      [SecurityEventType.LOGIN_ANOMALY]: "Anomalous Login Detected",
      [SecurityEventType.PASSWORD_RESET]: "Password Reset Initiated",
      [SecurityEventType.MFA_FAILED]: "MFA Verification Failed",
      [SecurityEventType.UNAUTHORIZED_ACCESS]: "Unauthorized Access Attempt",
      [SecurityEventType.PRIVILEGE_ESCALATION]: "Privilege Escalation Detected",
      [SecurityEventType.PERMISSION_DENIED]: "Permission Denied",
      [SecurityEventType.DATA_EXPORT]: "Large Data Export",
      [SecurityEventType.DATA_DELETION]: "Data Deletion Event",
      [SecurityEventType.SENSITIVE_DATA_ACCESS]: "Sensitive Data Accessed",
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: "Rate Limit Exceeded",
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: "Suspicious Activity Detected",
      [SecurityEventType.API_ABUSE]: "API Abuse Detected",
      [SecurityEventType.POLICY_VIOLATION]: "Security Policy Violation",
      [SecurityEventType.RETENTION_FAILURE]: "Data Retention Failure",
      [SecurityEventType.ENCRYPTION_FAILURE]: "Encryption Failure",
    };

    return titles[event.type] || "Security Event";
  }

  // Get alert description
  private getAlertDescription(event: SecurityEvent): string {
    let description = `A ${event.severity} severity security event was detected`;
    
    if (event.userId) {
      description += ` for user ${event.userId}`;
    }
    
    if (event.ipAddress) {
      description += ` from IP ${event.ipAddress}`;
    }

    if (event.details?.message) {
      description += `. ${event.details.message}`;
    }

    return description;
  }

  // Get recommendations
  private getRecommendations(event: SecurityEvent): string[] {
    const recommendations: string[] = [];

    switch (event.type) {
      case SecurityEventType.LOGIN_FAILED:
        recommendations.push("Review login attempts for brute force patterns");
        recommendations.push("Consider implementing MFA for affected account");
        recommendations.push("Check if IP should be blocked");
        break;

      case SecurityEventType.PRIVILEGE_ESCALATION:
        recommendations.push("Review user permissions immediately");
        recommendations.push("Check audit logs for unauthorized changes");
        recommendations.push("Consider revoking access temporarily");
        break;

      case SecurityEventType.DATA_EXPORT:
        recommendations.push("Verify if export was authorized");
        recommendations.push("Review data classification policies");
        recommendations.push("Check for data exfiltration patterns");
        break;

      case SecurityEventType.RATE_LIMIT_EXCEEDED:
        recommendations.push("Investigate source of high traffic");
        recommendations.push("Consider adjusting rate limits");
        recommendations.push("Check for DDoS patterns");
        break;

      case SecurityEventType.ENCRYPTION_FAILURE:
        recommendations.push("Check encryption key configuration");
        recommendations.push("Review encrypted data integrity");
        recommendations.push("Consider key rotation");
        break;

      default:
        recommendations.push("Review security logs for context");
        recommendations.push("Investigate user activity patterns");
    }

    return recommendations;
  }

  // Send alert (in production would integrate with PagerDuty, Slack, etc.)
  private async sendAlert(alert: SecurityAlert): Promise<void> {
    logger.warn("Security alert created", alert);

    // In production:
    // - Send to PagerDuty for critical alerts
    // - Send to Slack for high alerts
    // - Send email for medium alerts
    // - Update security dashboard
  }

  // Count recent events
  private async countRecentEvents(
    teamId: string,
    eventType: SecurityEventType,
    minutes: number
  ): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000);

    return this.prisma.auditLog.count({
      where: {
        teamId,
        action: `security.event.${eventType}`,
        timestamp: { gte: since },
      },
    });
  }

  // Update security metrics
  private async updateMetrics(event: SecurityEvent): Promise<void> {
    const key = `security:metrics:${event.teamId || "system"}:${new Date().toISOString().split("T")[0]}`;
    
    const metrics = await this.cache.get<any>(
      event.teamId || "system",
      key,
      { namespace: "security" }
    ) || { events: {} };

    metrics.events[event.type] = (metrics.events[event.type] || 0) + 1;
    metrics.lastUpdated = new Date();

    await this.cache.set(
      event.teamId || "system",
      key,
      metrics,
      { namespace: "security", ttl: 86400 * 7 } // 7 days
    );
  }

  // Detect patterns
  private async detectPatterns(event: SecurityEvent): Promise<void> {
    // Get recent events
    const recentEvents = await this.getRecentEvents(event.teamId || "system", 10);
    
    // Check for brute force
    if (this.detectBruteForce(recentEvents)) {
      await this.logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        ...event,
        details: {
          pattern: "brute_force",
          events: recentEvents.length,
        },
      });
    }

    // Check for scanning
    if (this.detectScanning(recentEvents)) {
      await this.logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        ...event,
        details: {
          pattern: "scanning",
          events: recentEvents.length,
        },
      });
    }
  }

  // Detect brute force pattern
  private detectBruteForce(events: SecurityEvent[]): boolean {
    const failedLogins = events.filter(e => e.type === SecurityEventType.LOGIN_FAILED);
    return failedLogins.length >= this.thresholds.failedLogins;
  }

  // Detect scanning pattern
  private detectScanning(events: SecurityEvent[]): boolean {
    const deniedAccess = events.filter(e => 
      e.type === SecurityEventType.UNAUTHORIZED_ACCESS ||
      e.type === SecurityEventType.PERMISSION_DENIED
    );
    return deniedAccess.length >= this.thresholds.suspiciousPatterns;
  }

  // Auto-respond to critical events
  private async autoRespond(event: SecurityEvent): Promise<void> {
    logger.warn("Auto-responding to critical security event", { event });

    switch (event.type) {
      case SecurityEventType.PRIVILEGE_ESCALATION:
        // In production: Temporarily suspend user access
        break;

      case SecurityEventType.DATA_DELETION:
        // In production: Trigger immediate backup
        break;

      case SecurityEventType.ENCRYPTION_FAILURE:
        // In production: Disable affected features
        break;
    }
  }

  // Get recent events
  private async getRecentEvents(teamId: string, limit: number): Promise<SecurityEvent[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        teamId,
        action: { startsWith: "security.event" },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return logs.map(log => log.metadata as SecurityEvent);
  }

  // Get security metrics
  async getSecurityMetrics(
    teamId: string,
    period: { start: Date; end: Date }
  ): Promise<SecurityMetrics> {
    // Get all security events
    const events = await this.prisma.auditLog.findMany({
      where: {
        teamId,
        action: { startsWith: "security.event" },
        timestamp: {
          gte: period.start,
          lte: period.end,
        },
      },
    });

    // Calculate metrics
    const eventCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const sourceCounts: Map<string, number> = new Map();
    const userCounts: Map<string, number> = new Map();

    for (const log of events) {
      const event = log.metadata as SecurityEvent;
      
      // Count by type
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
      
      // Count by severity
      severityCounts[event.severity] = (severityCounts[event.severity] || 0) + 1;
      
      // Count by source
      if (event.source) {
        sourceCounts.set(event.source, (sourceCounts.get(event.source) || 0) + 1);
      }
      
      // Count by user
      if (event.userId) {
        userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1);
      }
    }

    // Get trends
    const trends = await this.calculateTrends(teamId, period);

    // Calculate MTTR
    const resolvedEvents = events.filter(e => 
      (e.metadata as SecurityEvent).status === "resolved"
    );
    const mttr = resolvedEvents.length > 0
      ? resolvedEvents.reduce((sum, e) => {
          const event = e.metadata as SecurityEvent;
          const resolved = event.resolution ? new Date(event.resolution) : new Date();
          return sum + (resolved.getTime() - e.timestamp.getTime());
        }, 0) / resolvedEvents.length / 60000 // Convert to minutes
      : 0;

    // Calculate false positive rate
    const falsePositives = events.filter(e => 
      (e.metadata as SecurityEvent).status === "false_positive"
    ).length;
    const falsePositiveRate = events.length > 0
      ? (falsePositives / events.length) * 100
      : 0;

    return {
      period,
      eventCounts: eventCounts as any,
      severityCounts,
      topSources: Array.from(sourceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([source, count]) => ({ source, count })),
      topUsers: Array.from(userCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([userId, count]) => ({ userId, count })),
      trends,
      mttr: Math.round(mttr),
      falsePositiveRate: Math.round(falsePositiveRate * 100) / 100,
    };
  }

  // Calculate trends
  private async calculateTrends(
    teamId: string,
    period: { start: Date; end: Date }
  ): Promise<any> {
    // This would aggregate events by day and severity
    // For now, return simulated data
    const days = Math.ceil(
      (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const eventsPerDay = [];
    const severityTrend = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(period.start);
      date.setDate(date.getDate() + i);
      
      eventsPerDay.push({
        date: date.toISOString().split("T")[0],
        count: Math.floor(Math.random() * 50) + 10,
      });
      
      severityTrend.push({
        date: date.toISOString().split("T")[0],
        high: Math.floor(Math.random() * 5),
        medium: Math.floor(Math.random() * 10),
        low: Math.floor(Math.random() * 20),
      });
    }
    
    return { eventsPerDay, severityTrend };
  }

  // Get active alerts
  async getActiveAlerts(teamId: string): Promise<SecurityAlert[]> {
    const pattern = `alert:*`;
    const alerts: SecurityAlert[] = [];
    
    // This would scan Redis for alerts
    // For now, return from recent events
    const recentEvents = await this.prisma.auditLog.findMany({
      where: {
        teamId,
        action: { startsWith: "security.event" },
        riskLevel: { in: ["high", "critical"] },
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      take: 10,
    });

    for (const log of recentEvents) {
      const event = log.metadata as SecurityEvent;
      if (event.severity === "high" || event.severity === "critical") {
        alerts.push(await this.createAlert(event));
      }
    }

    return alerts;
  }

  // Acknowledge alert
  async acknowledgeAlert(
    alertId: string,
    userId: string,
    teamId: string
  ): Promise<void> {
    const alert = await this.cache.get<SecurityAlert>(
      teamId,
      `alert:${alertId}`,
      { namespace: "security" }
    );

    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();

      await this.cache.set(
        teamId,
        `alert:${alertId}`,
        alert,
        { namespace: "security", ttl: 86400 }
      );

      logger.info("Security alert acknowledged", {
        alertId,
        userId,
        teamId,
      });
    }
  }

  // Update event status
  async updateEventStatus(
    eventId: string,
    status: "investigating" | "resolved" | "false_positive",
    resolution?: string
  ): Promise<void> {
    await this.auditLogger.log({
      action: "security.event.status_updated",
      actorType: "user" as any,
      resourceType: "security_event",
      resourceId: eventId,
      metadata: {
        status,
        resolution,
      },
    });

    logger.info("Security event status updated", {
      eventId,
      status,
    });
  }
}

// Singleton instance
let securityEventMonitor: SecurityEventMonitorService;

export function getSecurityEventMonitor(prisma: PrismaClient): SecurityEventMonitorService {
  if (!securityEventMonitor) {
    securityEventMonitor = new SecurityEventMonitorService(prisma);
  }
  return securityEventMonitor;
}