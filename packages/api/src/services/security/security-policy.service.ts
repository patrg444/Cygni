import { PrismaClient } from "@prisma/client";
import { getAuditLogger } from "../audit/audit-logger.service";
import logger from "../../lib/logger";
import * as bcrypt from "bcryptjs";

export interface SecurityPolicy {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAge: number; // days
    preventReuse: number; // number of previous passwords
  };
  sessionPolicy: {
    maxDuration: number; // minutes
    idleTimeout: number; // minutes
    maxConcurrent: number;
    requireMFA: boolean;
  };
  accessPolicy: {
    maxLoginAttempts: number;
    lockoutDuration: number; // minutes
    requireEmailVerification: boolean;
    allowedIPRanges: string[];
    blockedIPRanges: string[];
  };
  dataPolicy: {
    encryptionRequired: boolean;
    retentionDays: number;
    gdprCompliant: boolean;
    backupFrequency: string; // daily, weekly, monthly
  };
}

export interface SecurityViolation {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  userId?: string;
  teamId?: string;
  ipAddress?: string;
  details: any;
  timestamp: Date;
  resolved: boolean;
}

export class SecurityPolicyService {
  private prisma: PrismaClient;
  private auditLogger = getAuditLogger(this.prisma);
  private defaultPolicy: SecurityPolicy = {
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90,
      preventReuse: 5,
    },
    sessionPolicy: {
      maxDuration: 480, // 8 hours
      idleTimeout: 30,
      maxConcurrent: 3,
      requireMFA: false, // Would be true in production
    },
    accessPolicy: {
      maxLoginAttempts: 5,
      lockoutDuration: 30,
      requireEmailVerification: true,
      allowedIPRanges: [],
      blockedIPRanges: [],
    },
    dataPolicy: {
      encryptionRequired: true,
      retentionDays: 2555, // 7 years
      gdprCompliant: true,
      backupFrequency: "daily",
    },
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Get security policy for team
  async getSecurityPolicy(teamId: string): Promise<SecurityPolicy> {
    // In production, this would fetch team-specific policies
    // For now, return default policy with team overrides
    return this.defaultPolicy;
  }

  // Validate password against policy
  async validatePassword(
    password: string,
    userId?: string,
    teamId?: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    const policy = await this.getSecurityPolicy(teamId || "default");
    const errors: string[] = [];

    // Length check
    if (password.length < policy.passwordPolicy.minLength) {
      errors.push(`Password must be at least ${policy.passwordPolicy.minLength} characters`);
    }

    // Uppercase check
    if (policy.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    // Lowercase check
    if (policy.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    // Number check
    if (policy.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }

    // Special character check
    if (policy.passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push("Password must contain at least one special character");
    }

    // Check password history if userId provided
    if (userId && policy.passwordPolicy.preventReuse > 0) {
      const isReused = await this.checkPasswordReuse(userId, password, policy.passwordPolicy.preventReuse);
      if (isReused) {
        errors.push(`Password cannot be one of your last ${policy.passwordPolicy.preventReuse} passwords`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Check if password was recently used
  private async checkPasswordReuse(
    userId: string,
    password: string,
    preventReuse: number
  ): Promise<boolean> {
    // This would check password history in production
    // For now, return false
    return false;
  }

  // Validate session
  async validateSession(
    userId: string,
    teamId: string,
    sessionData: {
      createdAt: Date;
      lastActivity: Date;
      ipAddress: string;
    }
  ): Promise<{ valid: boolean; reason?: string }> {
    const policy = await this.getSecurityPolicy(teamId);
    const now = new Date();

    // Check session duration
    const sessionAge = (now.getTime() - sessionData.createdAt.getTime()) / 1000 / 60;
    if (sessionAge > policy.sessionPolicy.maxDuration) {
      return { valid: false, reason: "Session expired" };
    }

    // Check idle timeout
    const idleTime = (now.getTime() - sessionData.lastActivity.getTime()) / 1000 / 60;
    if (idleTime > policy.sessionPolicy.idleTimeout) {
      return { valid: false, reason: "Session idle timeout" };
    }

    // Check IP restrictions
    if (!this.isIPAllowed(sessionData.ipAddress, policy.accessPolicy)) {
      return { valid: false, reason: "IP address not allowed" };
    }

    // Check concurrent sessions
    const activeSessions = await this.countActiveSessions(userId);
    if (activeSessions > policy.sessionPolicy.maxConcurrent) {
      return { valid: false, reason: "Too many concurrent sessions" };
    }

    return { valid: true };
  }

  // Check if IP is allowed
  private isIPAllowed(ipAddress: string, accessPolicy: any): boolean {
    // Check blocked IPs first
    if (accessPolicy.blockedIPRanges.length > 0) {
      for (const range of accessPolicy.blockedIPRanges) {
        if (this.isIPInRange(ipAddress, range)) {
          return false;
        }
      }
    }

    // If allowed ranges specified, IP must be in one of them
    if (accessPolicy.allowedIPRanges.length > 0) {
      for (const range of accessPolicy.allowedIPRanges) {
        if (this.isIPInRange(ipAddress, range)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  // Check if IP is in CIDR range
  private isIPInRange(ip: string, range: string): boolean {
    // Simplified check - in production would use proper CIDR validation
    if (range === ip) return true;
    if (range.includes("/32")) return range.replace("/32", "") === ip;
    // More complex CIDR checks would go here
    return false;
  }

  // Count active sessions for user
  private async countActiveSessions(userId: string): Promise<number> {
    // This would count active JWT tokens or sessions in production
    // For now, return a simulated count
    return 1;
  }

  // Check login attempts
  async checkLoginAttempts(
    email: string,
    ipAddress: string,
    teamId?: string
  ): Promise<{ allowed: boolean; remainingAttempts?: number; lockoutUntil?: Date }> {
    const policy = await this.getSecurityPolicy(teamId || "default");
    
    // Get recent failed attempts
    const recentAttempts = await this.prisma.auditLog.count({
      where: {
        action: "user.login_failed",
        actorEmail: email,
        timestamp: {
          gte: new Date(Date.now() - policy.accessPolicy.lockoutDuration * 60 * 1000),
        },
      },
    });

    if (recentAttempts >= policy.accessPolicy.maxLoginAttempts) {
      const lockoutUntil = new Date(
        Date.now() + policy.accessPolicy.lockoutDuration * 60 * 1000
      );
      
      await this.reportSecurityViolation({
        type: "account_lockout",
        severity: "medium",
        details: {
          email,
          ipAddress,
          attempts: recentAttempts,
        },
      });

      return {
        allowed: false,
        lockoutUntil,
      };
    }

    return {
      allowed: true,
      remainingAttempts: policy.accessPolicy.maxLoginAttempts - recentAttempts,
    };
  }

  // Report security violation
  async reportSecurityViolation(
    violation: Omit<SecurityViolation, "id" | "timestamp" | "resolved">
  ): Promise<void> {
    const violationRecord: SecurityViolation = {
      id: `vio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...violation,
      timestamp: new Date(),
      resolved: false,
    };

    // Log to audit system
    await this.auditLogger.log({
      action: `security.violation.${violation.type}`,
      actorType: violation.userId ? "user" : "system",
      resourceType: "security_violation",
      resourceId: violationRecord.id,
      teamId: violation.teamId,
      metadata: violation.details,
    });

    // In production, would also:
    // - Send alerts to security team
    // - Trigger automated responses
    // - Update security metrics

    logger.warn("Security violation detected", violationRecord);
  }

  // Check data encryption compliance
  async checkEncryptionCompliance(teamId: string): Promise<{
    compliant: boolean;
    issues: string[];
  }> {
    const policy = await this.getSecurityPolicy(teamId);
    const issues: string[] = [];

    if (!policy.dataPolicy.encryptionRequired) {
      return { compliant: true, issues: [] };
    }

    // Check OAuth tokens encryption
    const unencryptedTokens = await this.prisma.oAuthAccount.count({
      where: {
        user: { teamId },
        OR: [
          { accessToken: { not: null, equals: "" } },
          { refreshToken: { not: null, equals: "" } },
        ],
      },
    });

    if (unencryptedTokens > 0) {
      issues.push(`${unencryptedTokens} OAuth tokens not properly encrypted`);
    }

    // Check other sensitive data
    // In production, would check all sensitive fields

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  // Enforce data retention policy
  async enforceDataRetention(teamId: string): Promise<{
    deleted: number;
    errors: string[];
  }> {
    const policy = await this.getSecurityPolicy(teamId);
    const cutoffDate = new Date(
      Date.now() - policy.dataPolicy.retentionDays * 24 * 60 * 60 * 1000
    );
    
    let deleted = 0;
    const errors: string[] = [];

    try {
      // Delete old audit logs
      const deletedAuditLogs = await this.prisma.auditLog.deleteMany({
        where: {
          teamId,
          timestamp: { lt: cutoffDate },
        },
      });
      deleted += deletedAuditLogs.count;

      // Delete old notifications
      const deletedNotifications = await this.prisma.notification.deleteMany({
        where: {
          user: { teamId },
          createdAt: { lt: cutoffDate },
        },
      });
      deleted += deletedNotifications.count;

      // Log retention enforcement
      await this.auditLogger.log({
        action: "security.retention_enforced",
        actorType: "system" as any,
        resourceType: "data_retention",
        teamId,
        metadata: {
          cutoffDate,
          deletedRecords: deleted,
        },
      });
    } catch (error) {
      errors.push(`Retention enforcement error: ${error}`);
      logger.error("Data retention enforcement failed", { error, teamId });
    }

    return { deleted, errors };
  }

  // Generate security report
  async generateSecurityReport(teamId: string): Promise<{
    policy: SecurityPolicy;
    violations: SecurityViolation[];
    compliance: {
      encryption: boolean;
      retention: boolean;
      access: boolean;
      overall: boolean;
    };
    metrics: {
      failedLogins: number;
      securityEvents: number;
      activeUsers: number;
      mfaAdoption: number;
    };
  }> {
    const policy = await this.getSecurityPolicy(teamId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get recent violations
    const violations = await this.getRecentViolations(teamId, thirtyDaysAgo);

    // Check compliance
    const encryptionCheck = await this.checkEncryptionCompliance(teamId);
    const compliance = {
      encryption: encryptionCheck.compliant,
      retention: true, // Simplified for now
      access: true, // Simplified for now
      overall: encryptionCheck.compliant,
    };

    // Gather metrics
    const metrics = {
      failedLogins: await this.prisma.auditLog.count({
        where: {
          teamId,
          action: "user.login_failed",
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      securityEvents: await this.prisma.auditLog.count({
        where: {
          teamId,
          riskLevel: { in: ["high", "critical"] },
          timestamp: { gte: thirtyDaysAgo },
        },
      }),
      activeUsers: await this.prisma.user.count({
        where: {
          teamId,
          status: "active",
          lastLoginAt: { gte: thirtyDaysAgo },
        },
      }),
      mfaAdoption: 0, // Would calculate actual MFA adoption
    };

    return {
      policy,
      violations,
      compliance,
      metrics,
    };
  }

  // Get recent security violations
  private async getRecentViolations(
    teamId: string,
    since: Date
  ): Promise<SecurityViolation[]> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        teamId,
        action: { startsWith: "security.violation" },
        timestamp: { gte: since },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    return auditLogs.map(log => ({
      id: log.id,
      type: log.action.replace("security.violation.", ""),
      severity: log.riskLevel as any,
      userId: log.actorId || undefined,
      teamId: log.teamId || undefined,
      ipAddress: log.actorIp || undefined,
      details: log.metadata,
      timestamp: log.timestamp,
      resolved: false,
    }));
  }

  // Initialize security policies for new team
  async initializeTeamSecurity(teamId: string): Promise<void> {
    // Set up default security policies
    // In production, would store team-specific policies

    await this.auditLogger.log({
      action: "security.initialized",
      actorType: "system" as any,
      resourceType: "team",
      resourceId: teamId,
      teamId,
      metadata: {
        policies: ["password", "session", "access", "data"],
      },
    });

    logger.info("Security policies initialized for team", { teamId });
  }
}

// Singleton instance
let securityPolicyService: SecurityPolicyService;

export function getSecurityPolicyService(prisma: PrismaClient): SecurityPolicyService {
  if (!securityPolicyService) {
    securityPolicyService = new SecurityPolicyService(prisma);
  }
  return securityPolicyService;
}