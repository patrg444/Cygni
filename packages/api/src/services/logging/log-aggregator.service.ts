import { PrismaClient } from "@prisma/client";
import logger from "../../lib/logger";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";

export interface LogQuery {
  startTime?: Date;
  endTime?: Date;
  level?: string;
  userId?: string;
  teamId?: string;
  projectId?: string;
  requestId?: string;
  service?: string;
  message?: string;
  limit?: number;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  requestId?: string;
  userId?: string;
  teamId?: string;
  projectId?: string;
  [key: string]: any;
}

export interface LogStats {
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  avgResponseTime?: number;
  slowQueries: number;
  topErrors: Array<{ message: string; count: number }>;
  requestsPerMinute: Array<{ minute: string; count: number }>;
}

export class LogAggregatorService {
  private prisma: PrismaClient;
  private logDir: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logDir = process.env.LOG_DIR || "logs";
  }

  /**
   * Query logs from files
   */
  async queryLogs(query: LogQuery): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    const logFiles = await this.getLogFiles();

    for (const file of logFiles) {
      const fileLogs = await this.parseLogFile(file, query);
      logs.push(...fileLogs);
    }

    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (query.limit) {
      return logs.slice(0, query.limit);
    }

    return logs;
  }

  /**
   * Get log statistics for a time period
   */
  async getLogStats(startTime: Date, endTime: Date): Promise<LogStats> {
    const logs = await this.queryLogs({ startTime, endTime });

    // Count by level
    const errorCount = logs.filter((l) => l.level === "error").length;
    const warnCount = logs.filter((l) => l.level === "warn").length;

    // Calculate average response time
    const responseTimes = logs
      .filter((l) => l.responseTime)
      .map((l) => parseInt(l.responseTime));
    
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    // Count slow queries
    const slowQueries = logs.filter(
      (l) => l.message === "Slow database query"
    ).length;

    // Top errors
    const errorMap = new Map<string, number>();
    logs
      .filter((l) => l.level === "error")
      .forEach((log) => {
        const msg = log.message || "Unknown error";
        errorMap.set(msg, (errorMap.get(msg) || 0) + 1);
      });

    const topErrors = Array.from(errorMap.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Requests per minute
    const minuteMap = new Map<string, number>();
    logs
      .filter((l) => l.message === "HTTP request completed")
      .forEach((log) => {
        const minute = new Date(log.timestamp);
        minute.setSeconds(0);
        minute.setMilliseconds(0);
        const key = minute.toISOString();
        minuteMap.set(key, (minuteMap.get(key) || 0) + 1);
      });

    const requestsPerMinute = Array.from(minuteMap.entries())
      .map(([minute, count]) => ({ minute, count }))
      .sort((a, b) => a.minute.localeCompare(b.minute));

    return {
      totalLogs: logs.length,
      errorCount,
      warnCount,
      avgResponseTime,
      slowQueries,
      topErrors,
      requestsPerMinute,
    };
  }

  /**
   * Get user activity logs
   */
  async getUserActivity(
    userId: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<LogEntry[]> {
    return this.queryLogs({
      userId,
      startTime,
      endTime,
      limit: 100,
    });
  }

  /**
   * Get project deployment logs
   */
  async getDeploymentLogs(
    projectId: string,
    deploymentId?: string
  ): Promise<LogEntry[]> {
    const query: LogQuery = {
      projectId,
      message: "Deployment",
    };

    const logs = await this.queryLogs(query);

    if (deploymentId) {
      return logs.filter((l) => l.deploymentId === deploymentId);
    }

    return logs;
  }

  /**
   * Get error logs for debugging
   */
  async getErrorLogs(
    startTime: Date,
    endTime: Date,
    context?: { userId?: string; teamId?: string; projectId?: string }
  ): Promise<LogEntry[]> {
    return this.queryLogs({
      level: "error",
      startTime,
      endTime,
      ...context,
      limit: 100,
    });
  }

  /**
   * Get security event logs
   */
  async getSecurityLogs(
    startTime: Date,
    endTime: Date,
    severity?: string
  ): Promise<LogEntry[]> {
    const logs = await this.queryLogs({
      startTime,
      endTime,
      message: "Security event",
    });

    if (severity) {
      return logs.filter((l) => l.severity === severity);
    }

    return logs;
  }

  /**
   * Get billing event logs
   */
  async getBillingLogs(teamId: string): Promise<LogEntry[]> {
    return this.queryLogs({
      teamId,
      message: "Billing event",
      limit: 50,
    });
  }

  /**
   * Stream logs in real-time (for development)
   */
  async *streamLogs(filter?: Partial<LogQuery>): AsyncGenerator<LogEntry> {
    const logFile = path.join(this.logDir, "combined.log");

    // Start from end of file
    const stats = await fs.stat(logFile);
    let position = stats.size;

    while (true) {
      const newStats = await fs.stat(logFile);
      
      if (newStats.size > position) {
        // Read new content
        const stream = createReadStream(logFile, {
          start: position,
          end: newStats.size,
        });

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        for await (const line of rl) {
          try {
            const log = JSON.parse(line);
            if (this.matchesFilter(log, filter)) {
              yield log;
            }
          } catch {
            // Skip non-JSON lines
          }
        }

        position = newStats.size;
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Export logs for analysis
   */
  async exportLogs(
    query: LogQuery,
    format: "json" | "csv" = "json"
  ): Promise<string> {
    const logs = await this.queryLogs(query);

    if (format === "csv") {
      // CSV header
      const headers = [
        "timestamp",
        "level",
        "message",
        "requestId",
        "userId",
        "teamId",
        "projectId",
        "statusCode",
        "responseTime",
        "error",
      ];

      const rows = logs.map((log) =>
        headers
          .map((h) => {
            const value = log[h] || "";
            // Escape quotes and wrap in quotes if contains comma
            if (typeof value === "string" && value.includes(",")) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      );

      return [headers.join(","), ...rows].join("\n");
    }

    // JSON format
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Parse a log file
   */
  private async parseLogFile(
    filePath: string,
    query: LogQuery
  ): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    const fileStream = createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        const log = JSON.parse(line);
        
        if (this.matchesFilter(log, query)) {
          logs.push({
            ...log,
            timestamp: new Date(log.timestamp),
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return logs;
  }

  /**
   * Check if log matches filter
   */
  private matchesFilter(log: any, filter?: Partial<LogQuery>): boolean {
    if (!filter) return true;

    if (filter.startTime && new Date(log.timestamp) < filter.startTime) {
      return false;
    }

    if (filter.endTime && new Date(log.timestamp) > filter.endTime) {
      return false;
    }

    if (filter.level && log.level !== filter.level) {
      return false;
    }

    if (filter.userId && log.userId !== filter.userId) {
      return false;
    }

    if (filter.teamId && log.teamId !== filter.teamId) {
      return false;
    }

    if (filter.projectId && log.projectId !== filter.projectId) {
      return false;
    }

    if (filter.requestId && log.requestId !== filter.requestId) {
      return false;
    }

    if (filter.service && log.service !== filter.service) {
      return false;
    }

    if (filter.message && !log.message?.includes(filter.message)) {
      return false;
    }

    return true;
  }

  /**
   * Get available log files
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.logDir);
      return files
        .filter((f) => f.endsWith(".log"))
        .map((f) => path.join(this.logDir, f));
    } catch (error) {
      logger.warn("Log directory not found", { logDir: this.logDir });
      return [];
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(daysToKeep: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const files = await this.getLogFiles();

    for (const file of files) {
      const stats = await fs.stat(file);
      if (stats.mtime < cutoffDate) {
        await fs.unlink(file);
        logger.info("Deleted old log file", { file, age: stats.mtime });
      }
    }
  }
}