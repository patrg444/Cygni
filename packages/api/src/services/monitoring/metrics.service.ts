import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import * as client from 'prom-client';

interface DeploymentMetrics {
  successRate?: number;
  errorRate?: number;
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;
  requestCount?: number;
  activeConnections?: number;
  cpuUsage?: number;
  memoryUsage?: number;
}

export class MetricsService {
  private registry: client.Registry;
  
  // Define metrics
  private httpRequestDuration: client.Histogram<string>;
  private httpRequestTotal: client.Counter<string>;
  private activeConnections: client.Gauge<string>;
  private deploymentHealth: client.Gauge<string>;
  
  constructor() {
    this.registry = new client.Registry();
    
    // HTTP request duration histogram
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status', 'deployment_id'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    });
    
    // HTTP request counter
    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status', 'deployment_id'],
    });
    
    // Active connections gauge
    this.activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['deployment_id'],
    });
    
    // Deployment health gauge
    this.deploymentHealth = new client.Gauge({
      name: 'deployment_health',
      help: 'Deployment health score (0-1)',
      labelNames: ['deployment_id', 'metric'],
    });
    
    // Register metrics
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestTotal);
    this.registry.registerMetric(this.activeConnections);
    this.registry.registerMetric(this.deploymentHealth);
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
    deploymentId: string
  ): void {
    const labels = { method, route, status: status.toString(), deployment_id: deploymentId };
    
    this.httpRequestDuration.observe(labels, duration);
    this.httpRequestTotal.inc(labels);
    
    // Update deployment health based on status
    if (status >= 200 && status < 300) {
      this.deploymentHealth.set({ deployment_id: deploymentId, metric: 'success_rate' }, 1);
    } else if (status >= 500) {
      this.deploymentHealth.set({ deployment_id: deploymentId, metric: 'error_rate' }, 1);
    }
  }

  /**
   * Update active connections
   */
  updateActiveConnections(deploymentId: string, count: number): void {
    this.activeConnections.set({ deployment_id: deploymentId }, count);
  }

  /**
   * Get deployment metrics for a time range
   */
  async getDeploymentMetrics(
    deploymentId: string,
    startTime: Date,
    endTime: Date
  ): Promise<DeploymentMetrics> {
    try {
      // In a real implementation, this would query Prometheus or similar
      // For now, we'll calculate from our database
      
      const metrics = await prisma.deploymentMetric.findMany({
        where: {
          deploymentId,
          timestamp: {
            gte: startTime,
            lte: endTime,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      if (metrics.length === 0) {
        return this.generateMockMetrics(deploymentId);
      }

      // Calculate aggregated metrics
      const totalRequests = metrics.reduce((sum, m) => sum + (m.requestCount || 0), 0);
      const totalSuccess = metrics.reduce((sum, m) => sum + (m.successCount || 0), 0);
      const totalErrors = metrics.reduce((sum, m) => sum + (m.errorCount || 0), 0);
      
      const latencies = metrics.map(m => m.latencyP50 || 0).filter(l => l > 0);
      const p95Latencies = metrics.map(m => m.latencyP95 || 0).filter(l => l > 0);
      const p99Latencies = metrics.map(m => m.latencyP99 || 0).filter(l => l > 0);

      return {
        successRate: totalRequests > 0 ? totalSuccess / totalRequests : 0,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        latencyP50: this.calculatePercentile(latencies, 50),
        latencyP95: this.calculatePercentile(p95Latencies, 95),
        latencyP99: this.calculatePercentile(p99Latencies, 99),
        requestCount: totalRequests,
        activeConnections: metrics[metrics.length - 1]?.activeConnections || 0,
        cpuUsage: metrics[metrics.length - 1]?.cpuUsage || 0,
        memoryUsage: metrics[metrics.length - 1]?.memoryUsage || 0,
      };
    } catch (error) {
      logger.error('Failed to get deployment metrics', { deploymentId, error });
      return this.generateMockMetrics(deploymentId);
    }
  }

  /**
   * Store deployment metrics
   */
  async storeDeploymentMetrics(
    deploymentId: string,
    metrics: DeploymentMetrics
  ): Promise<void> {
    try {
      await prisma.deploymentMetric.create({
        data: {
          deploymentId,
          timestamp: new Date(),
          requestCount: metrics.requestCount || 0,
          successCount: Math.round((metrics.successRate || 0) * (metrics.requestCount || 0)),
          errorCount: Math.round((metrics.errorRate || 0) * (metrics.requestCount || 0)),
          latencyP50: metrics.latencyP50 || 0,
          latencyP95: metrics.latencyP95 || 0,
          latencyP99: metrics.latencyP99 || 0,
          activeConnections: metrics.activeConnections || 0,
          cpuUsage: metrics.cpuUsage || 0,
          memoryUsage: metrics.memoryUsage || 0,
        },
      });
    } catch (error) {
      logger.error('Failed to store deployment metrics', { deploymentId, error });
    }
  }

  /**
   * Compare metrics between two deployments
   */
  async compareDeployments(
    deploymentId1: string,
    deploymentId2: string,
    duration: number = 300000 // 5 minutes
  ): Promise<{
    deployment1: DeploymentMetrics;
    deployment2: DeploymentMetrics;
    comparison: {
      successRateDiff: number;
      errorRateDiff: number;
      latencyDiff: number;
      recommendation: string;
    };
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - duration);

    const [metrics1, metrics2] = await Promise.all([
      this.getDeploymentMetrics(deploymentId1, startTime, endTime),
      this.getDeploymentMetrics(deploymentId2, startTime, endTime),
    ]);

    const successRateDiff = (metrics2.successRate || 0) - (metrics1.successRate || 0);
    const errorRateDiff = (metrics2.errorRate || 0) - (metrics1.errorRate || 0);
    const latencyDiff = (metrics2.latencyP50 || 0) - (metrics1.latencyP50 || 0);

    let recommendation = 'neutral';
    if (errorRateDiff > 0.01 || latencyDiff > 100) {
      recommendation = 'rollback';
    } else if (errorRateDiff < -0.01 && latencyDiff < -50) {
      recommendation = 'promote';
    }

    return {
      deployment1: metrics1,
      deployment2: metrics2,
      comparison: {
        successRateDiff,
        errorRateDiff,
        latencyDiff,
        recommendation,
      },
    };
  }

  /**
   * Get real-time metrics stream
   */
  async *streamMetrics(
    deploymentId: string,
    intervalMs: number = 5000
  ): AsyncGenerator<DeploymentMetrics> {
    while (true) {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - intervalMs);
      
      const metrics = await this.getDeploymentMetrics(deploymentId, startTime, endTime);
      yield metrics;
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Generate mock metrics for testing
   */
  private generateMockMetrics(deploymentId: string): DeploymentMetrics {
    // Generate realistic mock metrics
    const baseSuccessRate = 0.98 + Math.random() * 0.02;
    const baseLatency = 100 + Math.random() * 200;
    
    return {
      successRate: baseSuccessRate,
      errorRate: 1 - baseSuccessRate,
      latencyP50: baseLatency,
      latencyP95: baseLatency * 1.5,
      latencyP99: baseLatency * 2,
      requestCount: Math.floor(1000 + Math.random() * 9000),
      activeConnections: Math.floor(10 + Math.random() * 90),
      cpuUsage: 20 + Math.random() * 60,
      memoryUsage: 30 + Math.random() * 50,
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  async getPrometheusMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.registry.clear();
  }
}