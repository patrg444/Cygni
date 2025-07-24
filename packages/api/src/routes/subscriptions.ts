import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { SubscriptionManagerService } from "../services/billing/subscription-manager.service";
import { jwtMiddleware } from "../services/auth/jwt-rotation.service";
import { jwtService } from "./auth";

const router = Router();
const prisma = new PrismaClient();
const subscriptionManager = new SubscriptionManagerService(prisma);

// Change plan schema
const changePlanSchema = z.object({
  planId: z.enum(["free", "starter", "pro", "enterprise"]),
});

// Add team member schema
const addTeamMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]),
});

// Update team member schema
const updateTeamMemberSchema = z.object({
  role: z.enum(["member", "admin"]),
});

// GET /api/subscriptions/plans - Get all available plans
router.get("/subscriptions/plans", async (_req: Request, res: Response) => {
  const plans = Object.values(SubscriptionManagerService.PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    features: plan.features,
  }));

  res.json({ plans });
});

// GET /api/subscriptions/current - Get current subscription
router.get(
  "/subscriptions/current",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const plan = await subscriptionManager.getCurrentPlan(req.user.teamId);
      const usage = await subscriptionManager.getUsageSummary(req.user.teamId);

      res.json({
        plan: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          features: plan.features,
        },
        usage: usage.usage,
      });
    } catch (error) {
      console.error("Get current subscription error:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  },
);

// POST /api/subscriptions/change-plan - Change subscription plan
router.post(
  "/subscriptions/change-plan",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners can change plans
      if (req.user.role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only team owners can change plans" });
      }

      const { planId } = changePlanSchema.parse(req.body);

      await subscriptionManager.changePlan(req.user.teamId, planId);

      res.json({
        success: true,
        message: `Successfully changed to ${planId} plan`,
      });
    } catch (error: any) {
      console.error("Change plan error:", error);
      res.status(400).json({ error: error.message });
    }
  },
);

// GET /api/subscriptions/check-limit - Check if action is allowed
router.get(
  "/subscriptions/check-limit",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const resource = req.query.resource as string;
      if (!resource) {
        return res.status(400).json({ error: "Resource parameter required" });
      }

      const result = await subscriptionManager.checkPlanLimits(
        req.user.teamId,
        resource as any,
      );

      res.json(result);
    } catch (error) {
      console.error("Check limit error:", error);
      res.status(500).json({ error: "Failed to check limit" });
    }
  },
);

// GET /api/subscriptions/usage-summary - Get detailed usage summary
router.get(
  "/subscriptions/usage-summary",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const summary = await subscriptionManager.getUsageSummary(
        req.user.teamId,
      );

      res.json(summary);
    } catch (error) {
      console.error("Get usage summary error:", error);
      res.status(500).json({ error: "Failed to get usage summary" });
    }
  },
);

// GET /api/subscriptions/team - Get team members
router.get(
  "/subscriptions/team",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: req.user.teamId },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      // Get current plan to check team member limit
      const plan = await subscriptionManager.getCurrentPlan(req.user.teamId);

      res.json({
        team: {
          id: team.id,
          name: team.name,
          createdAt: team.createdAt,
        },
        members: team.users,
        limits: {
          current: team.users.length,
          max: plan.features.maxTeamMembers,
        },
      });
    } catch (error) {
      console.error("Get team error:", error);
      res.status(500).json({ error: "Failed to get team" });
    }
  },
);

// POST /api/subscriptions/team/invite - Invite team member
router.post(
  "/subscriptions/team/invite",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners and admins can invite
      if (!["owner", "admin"].includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "Only admins can invite team members" });
      }

      const { email, role } = addTeamMemberSchema.parse(req.body);

      // Check team member limit
      const limitCheck = await subscriptionManager.checkPlanLimits(
        req.user.teamId,
        "maxTeamMembers",
      );

      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: `Team member limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to add more members.`,
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        if (existingUser.teamId === req.user.teamId) {
          return res
            .status(400)
            .json({ error: "User is already a team member" });
        }
        return res
          .status(400)
          .json({ error: "User already belongs to another team" });
      }

      // Create invitation (in production, send email with invite link)
      // For now, create user directly with temporary password
      const tempPassword = Math.random().toString(36).slice(-12);
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role,
          teamId: req.user.teamId,
          status: "pending", // Pending until they set their password
        },
      });

      // TODO: Send invitation email with password reset link

      res.json({
        success: true,
        message: `Invitation sent to ${email}`,
        userId: newUser.id,
      });
    } catch (error) {
      console.error("Invite team member error:", error);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  },
);

// PUT /api/subscriptions/team/:userId - Update team member
router.put(
  "/subscriptions/team/:userId",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners can update roles
      if (req.user.role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only team owners can update member roles" });
      }

      const { userId } = req.params;
      const { role } = updateTeamMemberSchema.parse(req.body);

      // Verify user is in same team
      const targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: req.user.teamId,
        },
      });

      if (!targetUser) {
        return res.status(404).json({ error: "Team member not found" });
      }

      // Cannot change owner role
      if (targetUser.role === "owner") {
        return res.status(400).json({ error: "Cannot change owner role" });
      }

      // Cannot demote last admin
      if (targetUser.role === "admin" && role !== "admin") {
        const adminCount = await prisma.user.count({
          where: {
            teamId: req.user.teamId,
            role: "admin",
          },
        });

        if (adminCount === 1) {
          return res
            .status(400)
            .json({ error: "Cannot remove last admin" });
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: { role },
      });

      res.json({
        success: true,
        message: `Updated role to ${role}`,
      });
    } catch (error) {
      console.error("Update team member error:", error);
      res.status(500).json({ error: "Failed to update team member" });
    }
  },
);

// DELETE /api/subscriptions/team/:userId - Remove team member
router.delete(
  "/subscriptions/team/:userId",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      // Only owners and admins can remove members
      if (!["owner", "admin"].includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "Only admins can remove team members" });
      }

      const { userId } = req.params;

      // Verify user is in same team
      const targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: req.user.teamId,
        },
      });

      if (!targetUser) {
        return res.status(404).json({ error: "Team member not found" });
      }

      // Cannot remove owner
      if (targetUser.role === "owner") {
        return res.status(400).json({ error: "Cannot remove team owner" });
      }

      // Cannot remove yourself
      if (targetUser.id === req.user.userId) {
        return res.status(400).json({ error: "Cannot remove yourself" });
      }

      // Soft delete - set status to removed
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: "removed",
          teamId: null as any, // Remove from team
        },
      });

      res.json({
        success: true,
        message: `Removed ${targetUser.email} from team`,
      });
    } catch (error) {
      console.error("Remove team member error:", error);
      res.status(500).json({ error: "Failed to remove team member" });
    }
  },
);

// GET /api/subscriptions/billing-info - Get billing information
router.get(
  "/subscriptions/billing-info",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: req.user.teamId },
        select: {
          billingEmail: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          subscriptionStatus: true,
          currentPeriodEnd: true,
        },
      });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      res.json({
        billingEmail: team.billingEmail,
        hasPaymentMethod: !!team.stripeCustomerId,
        subscriptionStatus: team.subscriptionStatus,
        currentPeriodEnd: team.currentPeriodEnd,
      });
    } catch (error) {
      console.error("Get billing info error:", error);
      res.status(500).json({ error: "Failed to get billing info" });
    }
  },
);

export { router as subscriptionsRouter };