import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { SubscriptionManagerService } from "../services/billing/subscription-manager.service";

const prisma = new PrismaClient();
const subscriptionManager = new SubscriptionManagerService(prisma);

export interface PlanLimitOptions {
  resource: keyof SubscriptionManagerService["PLANS"]["free"]["features"];
  increment?: number;
}

/**
 * Middleware to check plan limits before allowing actions
 */
export function checkPlanLimit(options: PlanLimitOptions) {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user?.teamId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await subscriptionManager.checkPlanLimits(
        req.user.teamId,
        options.resource,
      );

      // If increment provided, check if adding it would exceed limit
      if (options.increment) {
        const wouldExceed =
          result.limit !== -1 && result.current + options.increment > result.limit;

        if (wouldExceed) {
          const plan = await subscriptionManager.getCurrentPlan(
            req.user.teamId,
          );

          return res.status(403).json({
            error: "Plan limit exceeded",
            details: {
              resource: options.resource,
              current: result.current,
              limit: result.limit,
              plan: plan.name,
            },
            upgrade: {
              message: `You've reached the ${options.resource} limit for the ${plan.name} plan. Upgrade to continue.`,
              url: "/settings/billing",
            },
          });
        }
      } else if (!result.allowed) {
        const plan = await subscriptionManager.getCurrentPlan(req.user.teamId);

        return res.status(403).json({
          error: "Plan limit exceeded",
          details: {
            resource: options.resource,
            current: result.current,
            limit: result.limit,
            plan: plan.name,
          },
          upgrade: {
            message: `You've reached the ${options.resource} limit for the ${plan.name} plan. Upgrade to continue.`,
            url: "/settings/billing",
          },
        });
      }

      // Attach limit info to request for reference
      (req as any).planLimits = result;

      next();
    } catch (error) {
      console.error("Plan limit check error:", error);
      res.status(500).json({ error: "Failed to check plan limits" });
    }
  };
}

/**
 * Middleware to check feature availability
 */
export function requireFeature(
  feature: keyof SubscriptionManagerService["PLANS"]["free"]["features"],
) {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user?.teamId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const plan = await subscriptionManager.getCurrentPlan(req.user.teamId);
      const hasFeature = plan.features[feature];

      if (!hasFeature) {
        return res.status(403).json({
          error: "Feature not available",
          details: {
            feature,
            plan: plan.name,
            available: false,
          },
          upgrade: {
            message: `${feature} is not available in the ${plan.name} plan. Upgrade to access this feature.`,
            url: "/settings/billing",
          },
        });
      }

      next();
    } catch (error) {
      console.error("Feature check error:", error);
      res.status(500).json({ error: "Failed to check feature availability" });
    }
  };
}