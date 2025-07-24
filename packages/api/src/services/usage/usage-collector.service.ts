import { PrismaClient } from "@prisma/client";
import { ECS, CloudWatch } from "aws-sdk";
import { CronJob } from "cron";

interface ResourceUsage {
  projectId: string;
  serviceId: string;
  timestamp: Date;
  metrics: {
    cpuSeconds: number;
    memoryGbHours: number;
    storageGbHours: number;
    egressGb: number;
    requests: number;
  };
}

export class UsageCollectorService {
  private prisma: PrismaClient;
  private ecs: ECS;
  private cloudwatch: CloudWatch;
  private collectionJobs: Map<string, CronJob> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.ecs = new ECS({ region: process.env.AWS_REGION || "us-east-1" });
    this.cloudwatch = new CloudWatch({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }

  // Start collection jobs for all active projects
  async startCollectionJobs() {
    console.log("Starting usage collection jobs...");

    // Get all active projects
    const projects = await this.prisma.project.findMany({
      where: { status: "active" },
      include: {
        deployments: {
          where: { status: "active" },
        },
      },
    });

    for (const project of projects) {
      this.startProjectCollection(project.id);
    }

    // Start aggregation job (runs every hour)
    const aggregationJob = new CronJob(
      "0 * * * *", // Every hour
      async () => {
        try {
          await this.aggregateHourlyUsage();
        } catch (error) {
          console.error("Usage aggregation failed:", error);
        }
      },
      null,
      true,
      "UTC",
    );

    console.log(`Started usage collection for ${projects.length} projects`);
  }

  // Start collection for a specific project
  startProjectCollection(projectId: string) {
    // Skip if already collecting
    if (this.collectionJobs.has(projectId)) return;

    // Collect every 5 minutes
    const job = new CronJob(
      "*/5 * * * *",
      async () => {
        try {
          await this.collectProjectUsage(projectId);
        } catch (error) {
          console.error(`Usage collection failed for ${projectId}:`, error);
        }
      },
      null,
      true,
      "UTC",
    );

    this.collectionJobs.set(projectId, job);
  }

  // Stop collection for a project
  stopProjectCollection(projectId: string) {
    const job = this.collectionJobs.get(projectId);
    if (job) {
      job.stop();
      this.collectionJobs.delete(projectId);
    }
  }

  // Collect usage for a single project
  private async collectProjectUsage(projectId: string) {
    const deployments = await this.prisma.deployment.findMany({
      where: {
        projectId,
        status: "active",
      },
    });

    for (const deployment of deployments) {
      const usage = await this.collectDeploymentMetrics(deployment);
      if (usage) {
        await this.storeUsageMetrics(usage);
      }
    }
  }

  // Collect metrics from ECS/Fargate
  private async collectDeploymentMetrics(
    deployment: any,
  ): Promise<ResourceUsage | null> {
    try {
      const metadata = deployment.metadata as any;
      if (!metadata?.ecsServiceName || !metadata?.ecsClusterName) {
        return null;
      }

      // Get ECS service metrics
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

      // CPU utilization
      const cpuMetrics = await this.cloudwatch
        .getMetricStatistics({
          Namespace: "AWS/ECS",
          MetricName: "CPUUtilization",
          Dimensions: [
            { Name: "ServiceName", Value: metadata.ecsServiceName },
            { Name: "ClusterName", Value: metadata.ecsClusterName },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ["Average"],
        })
        .promise();

      // Memory utilization
      const memoryMetrics = await this.cloudwatch
        .getMetricStatistics({
          Namespace: "AWS/ECS",
          MetricName: "MemoryUtilization",
          Dimensions: [
            { Name: "ServiceName", Value: metadata.ecsServiceName },
            { Name: "ClusterName", Value: metadata.ecsClusterName },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ["Average"],
        })
        .promise();

      // Get task definition to know allocated resources
      const service = await this.ecs
        .describeServices({
          cluster: metadata.ecsClusterName,
          services: [metadata.ecsServiceName],
        })
        .promise();

      if (!service.services?.[0]) return null;

      const taskDef = await this.ecs
        .describeTaskDefinition({
          taskDefinition: service.services[0].taskDefinition!,
        })
        .promise();

      // Calculate resource usage
      const cpuUnits = parseInt(taskDef.taskDefinition!.cpu || "256");
      const memoryMb = parseInt(taskDef.taskDefinition!.memory || "512");
      const runningCount = service.services[0].runningCount || 0;

      const avgCpuPercent =
        cpuMetrics.Datapoints?.[0]?.Average || 0;
      const avgMemoryPercent =
        memoryMetrics.Datapoints?.[0]?.Average || 0;

      // Calculate actual usage
      const cpuSeconds = (cpuUnits / 1024) * (avgCpuPercent / 100) * 300 * runningCount; // 5 minutes in seconds
      const memoryGbHours = (memoryMb / 1024) * (avgMemoryPercent / 100) * (5 / 60) * runningCount; // 5 minutes in hours

      // Get ALB request count if available
      let requests = 0;
      if (metadata.albTargetGroupArn) {
        const requestMetrics = await this.cloudwatch
          .getMetricStatistics({
            Namespace: "AWS/ApplicationELB",
            MetricName: "RequestCount",
            Dimensions: [
              { Name: "TargetGroup", Value: metadata.albTargetGroupArn },
            ],
            StartTime: startTime,
            EndTime: endTime,
            Period: 300,
            Statistics: ["Sum"],
          })
          .promise();
        
        requests = requestMetrics.Datapoints?.[0]?.Sum || 0;
      }

      return {
        projectId: deployment.projectId,
        serviceId: deployment.id,
        timestamp: endTime,
        metrics: {
          cpuSeconds,
          memoryGbHours,
          storageGbHours: 0, // TODO: Implement EBS/EFS tracking
          egressGb: 0, // TODO: Implement network tracking
          requests,
        },
      };
    } catch (error) {
      console.error("Failed to collect deployment metrics:", error);
      return null;
    }
  }

  // Store usage metrics in database
  private async storeUsageMetrics(usage: ResourceUsage) {
    const events = [];

    // Store each metric type separately for easier aggregation
    if (usage.metrics.cpuSeconds > 0) {
      events.push({
        projectId: usage.projectId,
        serviceId: usage.serviceId,
        metricType: "cpu_seconds",
        quantity: usage.metrics.cpuSeconds,
        timestamp: usage.timestamp,
        region: process.env.AWS_REGION || "us-east-1",
      });
    }

    if (usage.metrics.memoryGbHours > 0) {
      events.push({
        projectId: usage.projectId,
        serviceId: usage.serviceId,
        metricType: "memory_gb_hours",
        quantity: usage.metrics.memoryGbHours,
        timestamp: usage.timestamp,
        region: process.env.AWS_REGION || "us-east-1",
      });
    }

    if (usage.metrics.requests > 0) {
      events.push({
        projectId: usage.projectId,
        serviceId: usage.serviceId,
        metricType: "requests",
        quantity: usage.metrics.requests,
        timestamp: usage.timestamp,
        region: process.env.AWS_REGION || "us-east-1",
      });
    }

    if (events.length > 0) {
      await this.prisma.usageEvent.createMany({ data: events });
    }
  }

  // Aggregate hourly usage for billing
  private async aggregateHourlyUsage() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Get all usage events from the last hour
    const events = await this.prisma.usageEvent.findMany({
      where: {
        timestamp: { gte: oneHourAgo },
      },
    });

    // Group by project and metric type
    const aggregated = new Map<string, Map<string, number>>();

    for (const event of events) {
      if (!aggregated.has(event.projectId)) {
        aggregated.set(event.projectId, new Map());
      }

      const projectUsage = aggregated.get(event.projectId)!;
      const current = projectUsage.get(event.metricType) || 0;
      projectUsage.set(
        event.metricType,
        current + event.quantity.toNumber(),
      );
    }

    // Check usage limits and send alerts
    for (const [projectId, usage] of aggregated) {
      await this.checkUsageLimits(projectId, usage);
    }
  }

  // Check if project exceeds usage limits
  private async checkUsageLimits(
    projectId: string,
    usage: Map<string, number>,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { team: true },
    });

    if (!project) return;

    // Calculate estimated monthly cost
    let estimatedCost = 0;
    estimatedCost += (usage.get("cpu_seconds") || 0) * (0.05 / 3600);
    estimatedCost += (usage.get("memory_gb_hours") || 0) * 0.01;
    estimatedCost += (usage.get("storage_gb_hours") || 0) * 0.0001;
    estimatedCost += (usage.get("egress_gb") || 0) * 0.09;
    estimatedCost += (usage.get("requests") || 0) * 0.0000002;

    // Extrapolate to monthly
    const hoursInMonth = 730;
    const monthlyEstimate = estimatedCost * hoursInMonth;

    // Check budget limits
    const budgetLimit = parseFloat(
      process.env.DEFAULT_BUDGET_LIMIT || "100",
    );

    if (monthlyEstimate > budgetLimit * 0.8 && !project.budgetExceededAt) {
      // Send budget warning
      await this.sendBudgetAlert(project, monthlyEstimate, budgetLimit);
    }

    if (monthlyEstimate > budgetLimit && !project.budgetExceededAt) {
      // Mark as budget exceeded
      await this.prisma.project.update({
        where: { id: projectId },
        data: { budgetExceededAt: new Date() },
      });

      // Send budget exceeded notification
      await this.sendBudgetExceededAlert(project, monthlyEstimate, budgetLimit);
    }
  }

  // Send budget warning alert
  private async sendBudgetAlert(
    project: any,
    estimate: number,
    limit: number,
  ) {
    const percentage = (estimate / limit) * 100;

    await this.prisma.notification.create({
      data: {
        userId: project.team.users?.[0]?.id, // TODO: Send to all team admins
        type: "budget_warning",
        severity: "warning",
        title: "Budget Warning",
        message: `Project "${project.name}" is at ${percentage.toFixed(
          0,
        )}% of its $${limit} monthly budget.`,
        data: {
          projectId: project.id,
          estimate,
          limit,
          percentage,
        },
      },
    });
  }

  // Send budget exceeded alert
  private async sendBudgetExceededAlert(
    project: any,
    estimate: number,
    limit: number,
  ) {
    await this.prisma.notification.create({
      data: {
        userId: project.team.users?.[0]?.id, // TODO: Send to all team admins
        type: "budget_exceeded",
        severity: "critical",
        title: "Budget Exceeded",
        message: `Project "${
          project.name
        }" has exceeded its $${limit} monthly budget. Estimated cost: $${estimate.toFixed(
          2,
        )}`,
        data: {
          projectId: project.id,
          estimate,
          limit,
        },
      },
    });
  }

  // Get usage analytics for a project
  async getProjectAnalytics(
    projectId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const usage = await this.prisma.usageEvent.groupBy({
      by: ["metricType", "timestamp"],
      where: {
        projectId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    // Format for charting
    const series = new Map<string, Array<{ timestamp: Date; value: number }>>();

    for (const point of usage) {
      if (!series.has(point.metricType)) {
        series.set(point.metricType, []);
      }

      series.get(point.metricType)!.push({
        timestamp: point.timestamp,
        value: point._sum.quantity?.toNumber() || 0,
      });
    }

    return {
      projectId,
      period: { start: startDate, end: endDate },
      series: Object.fromEntries(series),
    };
  }

  // Export usage data
  async exportUsageData(
    teamId: string,
    startDate: Date,
    endDate: Date,
    format: "csv" | "json" = "json",
  ) {
    const projects = await this.prisma.project.findMany({
      where: { teamId },
      select: { id: true, name: true },
    });

    const projectIds = projects.map((p) => p.id);

    const usage = await this.prisma.usageEvent.findMany({
      where: {
        projectId: { in: projectIds },
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    if (format === "csv") {
      const headers = [
        "timestamp",
        "projectId",
        "projectName",
        "serviceId",
        "metricType",
        "quantity",
        "region",
      ];

      const rows = usage.map((event) => {
        const project = projects.find((p) => p.id === event.projectId);
        return [
          event.timestamp.toISOString(),
          event.projectId,
          project?.name || "",
          event.serviceId || "",
          event.metricType,
          event.quantity.toString(),
          event.region || "",
        ];
      });

      return [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
    }

    return usage;
  }
}