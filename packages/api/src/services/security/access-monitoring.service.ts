import { PrismaClient } from "@prisma/client";
import { getAuditLogger } from "../audit/audit-logger.service";
import { getTenantCacheService } from "../cache/tenant-cache.service";
import logger from "../../lib/logger";

export interface AccessPattern {
  userId: string;
  teamId: string;
  patterns: {
    normalHours: { start: number; end: number }; // 0-23
    normalDays: number[]; // 0-6 (Sunday-Saturday)
    typicalLocations: string[]; // IP ranges or countries
    typicalDevices: string[]; // User agents
    averageRequestsPerHour: number;
    commonResources: string[];
  };
  lastUpdated: Date;
}

export interface AccessAnomaly {
  id: string;
  userId: string;
  teamId: string;
  type: "unusual_time" | "unusual_location" | "unusual_device" | "high_volume" | "suspicious_pattern" | "privilege_escalation";
  severity: "low" | "medium" | "high" | "critical";
  details: any;
  detected: Date;
  resolved: boolean;
  falsePositive: boolean;
}

export interface AccessMetrics {
  totalRequests: number;
  uniqueUsers: number;
  failedAttempts: number;
  anomalies: number;
  avgResponseTime: number;
  peakHour: number;
  topResources: Array<{ resource: string; count: number }>;
  riskScore: number;
}

export class AccessMonitoringService {
  private prisma: PrismaClient;
  private auditLogger = getAuditLogger(this.prisma);
  private cache = getTenantCacheService();
  
  // Thresholds for anomaly detection
  private thresholds = {
    requestsPerHourMultiplier: 3, // 3x normal rate
    unusualHourStart: 22, // 10 PM
    unusualHourEnd: 6, // 6 AM
    maxFailedAttempts: 5,
    suspiciousPatterns: [
      /\/api\/users\/\*/,
      /\/api\/billing\/\*/,
      /\/api\/audit\/export/,
    ],
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Monitor access in real-time
  async monitorAccess(
    userId: string,
    teamId: string,
    request: {
      ip: string;
      userAgent: string;
      method: string;
      path: string;
      timestamp: Date;
      statusCode: number;
    }
  ): Promise<AccessAnomaly[]> {
    const anomalies: AccessAnomaly[] = [];

    try {
      // Get user's normal patterns
      const patterns = await this.getUserAccessPatterns(userId, teamId);

      // Check for anomalies
      const timeAnomaly = this.checkTimeAnomaly(request.timestamp, patterns);
      if (timeAnomaly) anomalies.push(timeAnomaly);

      const locationAnomaly = await this.checkLocationAnomaly(request.ip, userId, patterns);
      if (locationAnomaly) anomalies.push(locationAnomaly);

      const deviceAnomaly = this.checkDeviceAnomaly(request.userAgent, patterns);
      if (deviceAnomaly) anomalies.push(deviceAnomaly);

      const volumeAnomaly = await this.checkVolumeAnomaly(userId, teamId);
      if (volumeAnomaly) anomalies.push(volumeAnomaly);

      const patternAnomaly = this.checkSuspiciousPattern(request);
      if (patternAnomaly) anomalies.push(patternAnomaly);

      // Check for privilege escalation attempts
      if (request.statusCode === 403) {
        const escalationAnomaly = await this.checkPrivilegeEscalation(userId, request);
        if (escalationAnomaly) anomalies.push(escalationAnomaly);
      }

      // Log anomalies
      for (const anomaly of anomalies) {
        await this.logAnomaly(anomaly);
      }

      // Update access patterns if no anomalies
      if (anomalies.length === 0) {
        await this.updateAccessPatterns(userId, teamId, request);
      }

      return anomalies;
    } catch (error) {
      logger.error("Access monitoring failed", { error, userId, teamId });
      return [];
    }
  }

  // Get user access patterns
  private async getUserAccessPatterns(
    userId: string,
    teamId: string
  ): Promise<AccessPattern> {
    // Try cache first
    const cached = await this.cache.get<AccessPattern>(
      teamId,
      `access-patterns:${userId}`,
      { namespace: "security" }
    );
    
    if (cached) return cached;

    // Build patterns from audit logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        actorId: userId,
        teamId,
        timestamp: { gte: thirtyDaysAgo },
        statusCode: { lt: 400 }, // Only successful requests
      },
      select: {
        timestamp: true,
        actorIp: true,
        actorUserAgent: true,
        path: true,
      },
    });

    // Analyze patterns
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};
    const ipAddresses = new Set<string>();
    const userAgents = new Set<string>();
    const resources = new Map<string, number>();

    for (const log of logs) {
      const hour = log.timestamp.getHours();
      const day = log.timestamp.getDay();
      
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
      
      if (log.actorIp) ipAddresses.add(log.actorIp);
      if (log.actorUserAgent) userAgents.add(log.actorUserAgent);
      if (log.path) {
        const resource = log.path.split("/")[2]; // Extract resource type
        resources.set(resource, (resources.get(resource) || 0) + 1);
      }
    }

    // Determine normal hours (when 80% of activity occurs)
    const sortedHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([hour]) => parseInt(hour));
    
    const normalHours = {
      start: Math.min(...sortedHours.slice(0, 8)),
      end: Math.max(...sortedHours.slice(0, 8)),
    };

    // Determine normal days
    const normalDays = Object.entries(dayCounts)
      .filter(([, count]) => count > logs.length / 14) // More than average
      .map(([day]) => parseInt(day));

    // Top resources
    const commonResources = Array.from(resources.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([resource]) => resource);

    const patterns: AccessPattern = {
      userId,
      teamId,
      patterns: {
        normalHours,
        normalDays,
        typicalLocations: Array.from(ipAddresses).slice(0, 10),
        typicalDevices: Array.from(userAgents).slice(0, 5),
        averageRequestsPerHour: logs.length / (30 * 24),
        commonResources,
      },
      lastUpdated: new Date(),
    };

    // Cache patterns
    await this.cache.set(teamId, `access-patterns:${userId}`, patterns, {
      namespace: "security",
      ttl: 3600, // 1 hour
    });

    return patterns;
  }

  // Check for time-based anomalies
  private checkTimeAnomaly(
    timestamp: Date,
    patterns: AccessPattern
  ): AccessAnomaly | null {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();

    // Check unusual hour
    if (
      hour < this.thresholds.unusualHourEnd ||
      hour > this.thresholds.unusualHourStart
    ) {
      if (
        hour < patterns.patterns.normalHours.start ||
        hour > patterns.patterns.normalHours.end
      ) {
        return {
          id: `anomaly_${Date.now()}_time`,
          userId: patterns.userId,
          teamId: patterns.teamId,
          type: "unusual_time",
          severity: "medium",
          details: {
            accessHour: hour,
            normalHours: patterns.patterns.normalHours,
            timestamp,
          },
          detected: new Date(),
          resolved: false,
          falsePositive: false,
        };
      }
    }

    // Check unusual day
    if (!patterns.patterns.normalDays.includes(day)) {
      return {
        id: `anomaly_${Date.now()}_day`,
        userId: patterns.userId,
        teamId: patterns.teamId,
        type: "unusual_time",
        severity: "low",
        details: {
          accessDay: day,
          normalDays: patterns.patterns.normalDays,
          timestamp,
        },
        detected: new Date(),
        resolved: false,
        falsePositive: false,
      };
    }

    return null;
  }

  // Check for location anomalies
  private async checkLocationAnomaly(
    ip: string,
    userId: string,
    patterns: AccessPattern
  ): Promise<AccessAnomaly | null> {
    // Simple check - is IP in typical locations?
    if (!patterns.patterns.typicalLocations.includes(ip)) {
      // Check if this is the first time from this location
      const previousAccess = await this.prisma.auditLog.findFirst({
        where: {
          actorId: userId,
          actorIp: ip,
          timestamp: { lt: new Date() },
        },
      });

      if (!previousAccess) {
        return {
          id: `anomaly_${Date.now()}_location`,
          userId: patterns.userId,
          teamId: patterns.teamId,
          type: "unusual_location",
          severity: "high",
          details: {
            newIp: ip,
            knownLocations: patterns.patterns.typicalLocations,
          },
          detected: new Date(),
          resolved: false,
          falsePositive: false,
        };
      }
    }

    return null;
  }

  // Check for device anomalies
  private checkDeviceAnomaly(
    userAgent: string,
    patterns: AccessPattern
  ): AccessAnomaly | null {
    if (!patterns.patterns.typicalDevices.includes(userAgent)) {
      return {
        id: `anomaly_${Date.now()}_device`,
        userId: patterns.userId,
        teamId: patterns.teamId,
        type: "unusual_device",
        severity: "medium",
        details: {
          newDevice: userAgent,
          knownDevices: patterns.patterns.typicalDevices,
        },
        detected: new Date(),
        resolved: false,
        falsePositive: false,
      };
    }

    return null;
  }

  // Check for volume anomalies
  private async checkVolumeAnomaly(
    userId: string,
    teamId: string
  ): Promise<AccessAnomaly | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentRequests = await this.prisma.auditLog.count({
      where: {
        actorId: userId,
        teamId,
        timestamp: { gte: oneHourAgo },
      },
    });

    const patterns = await this.getUserAccessPatterns(userId, teamId);
    const threshold = patterns.patterns.averageRequestsPerHour * this.thresholds.requestsPerHourMultiplier;

    if (recentRequests > threshold) {
      return {
        id: `anomaly_${Date.now()}_volume`,
        userId,
        teamId,
        type: "high_volume",
        severity: "high",
        details: {
          requests: recentRequests,
          threshold,
          average: patterns.patterns.averageRequestsPerHour,
        },
        detected: new Date(),
        resolved: false,
        falsePositive: false,
      };
    }

    return null;
  }

  // Check for suspicious patterns
  private checkSuspiciousPattern(request: any): AccessAnomaly | null {
    for (const pattern of this.thresholds.suspiciousPatterns) {
      if (pattern.test(request.path)) {
        return {
          id: `anomaly_${Date.now()}_pattern`,
          userId: request.userId,
          teamId: request.teamId,
          type: "suspicious_pattern",
          severity: "high",
          details: {
            path: request.path,
            method: request.method,
            pattern: pattern.toString(),
          },
          detected: new Date(),
          resolved: false,
          falsePositive: false,
        };
      }
    }

    return null;
  }

  // Check for privilege escalation attempts
  private async checkPrivilegeEscalation(
    userId: string,
    request: any
  ): Promise<AccessAnomaly | null> {
    // Count recent 403s
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const recentDenials = await this.prisma.auditLog.count({
      where: {
        actorId: userId,
        statusCode: 403,
        timestamp: { gte: fiveMinutesAgo },
      },
    });

    if (recentDenials >= this.thresholds.maxFailedAttempts) {
      return {
        id: `anomaly_${Date.now()}_escalation`,
        userId,
        teamId: request.teamId,
        type: "privilege_escalation",
        severity: "critical",
        details: {
          attempts: recentDenials,
          paths: [request.path],
          timeWindow: "5 minutes",
        },
        detected: new Date(),
        resolved: false,
        falsePositive: false,
      };
    }

    return null;
  }

  // Log anomaly
  private async logAnomaly(anomaly: AccessAnomaly): Promise<void> {
    await this.auditLogger.log({
      action: `security.anomaly.${anomaly.type}`,
      actorType: "user" as any,
      actorId: anomaly.userId,
      resourceType: "access_anomaly",
      resourceId: anomaly.id,
      teamId: anomaly.teamId,
      metadata: anomaly.details,
      riskLevel: anomaly.severity as any,
    });

    logger.warn("Access anomaly detected", anomaly);

    // In production, would also:
    // - Send alerts
    // - Trigger automated responses
    // - Update risk scores
  }

  // Update access patterns
  private async updateAccessPatterns(
    userId: string,
    teamId: string,
    request: any
  ): Promise<void> {
    // This would update the patterns based on new normal behavior
    // For now, just invalidate the cache
    await this.cache.delete(teamId, `access-patterns:${userId}`, {
      namespace: "security",
    });
  }

  // Get access metrics for a team
  async getAccessMetrics(
    teamId: string,
    period: { start: Date; end: Date }
  ): Promise<AccessMetrics> {
    const [
      totalRequests,
      uniqueUsers,
      failedAttempts,
      anomalies,
    ] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          teamId,
          timestamp: { gte: period.start, lte: period.end },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ["actorId"],
        where: {
          teamId,
          timestamp: { gte: period.start, lte: period.end },
          actorId: { not: null },
        },
      }).then(results => results.length),
      this.prisma.auditLog.count({
        where: {
          teamId,
          timestamp: { gte: period.start, lte: period.end },
          statusCode: { gte: 400 },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          teamId,
          timestamp: { gte: period.start, lte: period.end },
          action: { startsWith: "security.anomaly" },
        },
      }),
    ]);

    // Calculate average response time (simulated)
    const avgResponseTime = 150 + Math.random() * 100;

    // Get peak hour
    const hourlyRequests = await this.prisma.auditLog.groupBy({
      by: ["timestamp"],
      where: {
        teamId,
        timestamp: { gte: period.start, lte: period.end },
      },
      _count: true,
    });

    const hourCounts: Record<number, number> = {};
    hourlyRequests.forEach(hr => {
      const hour = hr.timestamp.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + hr._count;
    });

    const peakHour = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 0;

    // Get top resources
    const resourceRequests = await this.prisma.auditLog.groupBy({
      by: ["path"],
      where: {
        teamId,
        timestamp: { gte: period.start, lte: period.end },
        path: { not: null },
      },
      _count: true,
      orderBy: { _count: { path: "desc" } },
      take: 10,
    });

    const topResources = resourceRequests.map(rr => ({
      resource: rr.path?.split("/")[2] || "unknown",
      count: rr._count,
    }));

    // Calculate risk score (0-100)
    const riskFactors = {
      anomalyRate: (anomalies / totalRequests) * 100,
      failureRate: (failedAttempts / totalRequests) * 100,
      uniqueUserRate: (uniqueUsers / totalRequests) * 100,
    };

    const riskScore = Math.min(
      100,
      riskFactors.anomalyRate * 50 +
      riskFactors.failureRate * 30 +
      (100 - riskFactors.uniqueUserRate) * 20
    );

    return {
      totalRequests,
      uniqueUsers,
      failedAttempts,
      anomalies,
      avgResponseTime,
      peakHour: parseInt(peakHour as any),
      topResources,
      riskScore: Math.round(riskScore),
    };
  }

  // Get recent anomalies
  async getRecentAnomalies(
    teamId: string,
    limit: number = 50
  ): Promise<AccessAnomaly[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        teamId,
        action: { startsWith: "security.anomaly" },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return logs.map(log => ({
      id: log.id,
      userId: log.actorId || "",
      teamId: log.teamId || "",
      type: log.action.replace("security.anomaly.", "") as any,
      severity: log.riskLevel as any,
      details: log.metadata,
      detected: log.timestamp,
      resolved: false,
      falsePositive: false,
    }));
  }

  // Mark anomaly as resolved or false positive
  async updateAnomaly(
    anomalyId: string,
    update: { resolved?: boolean; falsePositive?: boolean }
  ): Promise<void> {
    await this.auditLogger.log({
      action: "security.anomaly.updated",
      actorType: "user" as any,
      resourceType: "access_anomaly",
      resourceId: anomalyId,
      metadata: update,
    });

    logger.info("Anomaly updated", { anomalyId, update });
  }

  // Generate access report
  async generateAccessReport(
    teamId: string,
    period: { start: Date; end: Date }
  ): Promise<{
    metrics: AccessMetrics;
    anomalies: AccessAnomaly[];
    recommendations: string[];
  }> {
    const metrics = await this.getAccessMetrics(teamId, period);
    const anomalies = await this.getRecentAnomalies(teamId, 100);
    
    const recommendations: string[] = [];

    if (metrics.riskScore > 70) {
      recommendations.push("High risk score detected - review security policies");
    }

    if (metrics.failedAttempts > metrics.totalRequests * 0.1) {
      recommendations.push("High failure rate - investigate authentication issues");
    }

    if (anomalies.filter(a => a.type === "privilege_escalation").length > 0) {
      recommendations.push("Privilege escalation attempts detected - review permissions");
    }

    const unusualTimeAnomalies = anomalies.filter(a => a.type === "unusual_time");
    if (unusualTimeAnomalies.length > 5) {
      recommendations.push("Multiple off-hours access detected - consider enabling MFA");
    }

    return {
      metrics,
      anomalies: anomalies.slice(0, 20), // Top 20
      recommendations,
    };
  }
}

// Singleton instance
let accessMonitoringService: AccessMonitoringService;

export function getAccessMonitoringService(prisma: PrismaClient): AccessMonitoringService {
  if (!accessMonitoringService) {
    accessMonitoringService = new AccessMonitoringService(prisma);
  }
  return accessMonitoringService;
}