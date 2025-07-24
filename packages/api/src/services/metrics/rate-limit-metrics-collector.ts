import { PrismaClient } from "@prisma/client";
import { rateLimiterService } from "../rate-limit/rate-limiter.service";
import { rateLimitRemaining } from "../../lib/metrics";
import logger from "../../lib/logger";

export class RateLimitMetricsCollector {
  private prisma: PrismaClient;
  private collectionInterval: NodeJS.Timer | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  startCollection(): void {
    // Collect rate limit metrics every 30 seconds
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000);

    logger.info("Rate limit metrics collection started");
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Get a sample of active teams
      const activeTeams = await this.prisma.team.findMany({
        where: {
          subscriptionStatus: "active",
          lastActivityAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Active in last 24 hours
          },
        },
        select: {
          id: true,
          planId: true,
        },
        take: 100, // Sample up to 100 teams
      });

      // Collect rate limit remaining for each active team
      for (const team of activeTeams) {
        try {
          const tier = team.planId || "free";
          const info = await rateLimiterService.getRateLimitInfo(team.id, tier);
          
          rateLimitRemaining.set(
            { tier, team_id: team.id },
            info.remaining
          );
        } catch (error) {
          logger.error("Failed to collect rate limit metrics for team", {
            teamId: team.id,
            error,
          });
        }
      }
    } catch (error) {
      logger.error("Failed to collect rate limit metrics", { error });
    }
  }
}