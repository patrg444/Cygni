import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { getOnboardingService } from "../services/onboarding/onboarding.service";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    teamId: string;
    role: string;
  };
}

// GET /api/onboarding/status - Get onboarding status
router.get(
  "/onboarding/status",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const onboardingService = getOnboardingService(prisma);
      
      // Get onboarding progress
      const progress = await onboardingService.getOnboardingProgress(authReq.user!.userId);
      
      if (!progress) {
        // Initialize onboarding for new users
        const newProgress = await onboardingService.initializeOnboarding(
          authReq.user!.userId,
          authReq.user!.teamId
        );
        
        const steps = await onboardingService.getOnboardingSteps(authReq.user!.userId);
        const tips = await onboardingService.getOnboardingTips(authReq.user!.userId);
        
        return res.json({
          initialized: true,
          progress: newProgress,
          steps,
          tips,
        });
      }
      
      const steps = await onboardingService.getOnboardingSteps(authReq.user!.userId);
      const tips = await onboardingService.getOnboardingTips(authReq.user!.userId);
      
      res.json({
        initialized: true,
        progress,
        steps,
        tips,
      });
    } catch (error) {
      logger.error("Failed to get onboarding status", { error });
      res.status(500).json({ error: "Failed to get onboarding status" });
    }
  }
);

// POST /api/onboarding/complete-step - Mark a step as complete
router.post(
  "/onboarding/complete-step",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        stepId: z.string(),
        metadata: z.any().optional(),
      });
      
      const { stepId, metadata } = schema.parse(req.body);
      
      const onboardingService = getOnboardingService(prisma);
      const progress = await onboardingService.completeStep(
        authReq.user!.userId,
        stepId
      );
      
      // Log step completion
      logger.info("Onboarding step completed", {
        userId: authReq.user!.userId,
        stepId,
        metadata,
      });
      
      res.json({
        success: true,
        progress,
        message: `Step '${stepId}' completed successfully`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to complete onboarding step", { error });
      res.status(500).json({ error: "Failed to complete step" });
    }
  }
);

// POST /api/onboarding/skip - Skip onboarding
router.post(
  "/onboarding/skip",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const onboardingService = getOnboardingService(prisma);
      await onboardingService.skipOnboarding(authReq.user!.userId);
      
      logger.info("Onboarding skipped", { userId: authReq.user!.userId });
      
      res.json({
        success: true,
        message: "Onboarding skipped successfully",
      });
    } catch (error) {
      logger.error("Failed to skip onboarding", { error });
      res.status(500).json({ error: "Failed to skip onboarding" });
    }
  }
);

// GET /api/onboarding/checklist - Get interactive checklist
router.get(
  "/onboarding/checklist",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const onboardingService = getOnboardingService(prisma);
      const steps = await onboardingService.getOnboardingSteps(authReq.user!.userId);
      
      // Add interactive elements to each step
      const interactiveChecklist = steps.map(step => {
        const actions: any = {
          verify_email: {
            type: "button",
            label: "Resend Verification Email",
            endpoint: "/api/auth/resend-verification",
          },
          create_project: {
            type: "tutorial",
            label: "Show Me How",
            content: {
              title: "Creating Your First Project",
              steps: [
                "Install the Cygni CLI: npm install -g @cygni/cli",
                "Navigate to your project directory",
                "Run: cygni deploy",
                "Your app will be live in seconds!",
              ],
              videoUrl: "/tutorials/first-deployment.mp4",
            },
          },
          invite_team: {
            type: "form",
            label: "Invite Team Members",
            fields: [
              { name: "email", type: "email", placeholder: "teammate@company.com" },
              { name: "role", type: "select", options: ["member", "admin"] },
            ],
            endpoint: "/api/teams/invite",
          },
          setup_domain: {
            type: "guide",
            label: "Domain Setup Guide",
            link: "/docs/domains/custom-domains",
          },
          explore_features: {
            type: "cards",
            label: "Feature Explorer",
            items: [
              {
                title: "Monitoring",
                description: "Track performance and uptime",
                link: "/dashboard/monitoring",
                icon: "chart",
              },
              {
                title: "Security",
                description: "Manage access and compliance",
                link: "/dashboard/security",
                icon: "shield",
              },
              {
                title: "Scaling",
                description: "Handle millions of requests",
                link: "/docs/scaling",
                icon: "trending-up",
              },
            ],
          },
        };
        
        return {
          ...step,
          interactive: actions[step.id] || null,
        };
      });
      
      res.json({
        checklist: interactiveChecklist,
        completedCount: steps.filter(s => s.completed).length,
        totalCount: steps.length,
        requiredCount: steps.filter(s => s.required).length,
      });
    } catch (error) {
      logger.error("Failed to get onboarding checklist", { error });
      res.status(500).json({ error: "Failed to get checklist" });
    }
  }
);

// GET /api/onboarding/analytics - Get onboarding analytics (admin only)
router.get(
  "/onboarding/analytics",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view analytics
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const onboardingService = getOnboardingService(prisma);
      const analytics = await onboardingService.getOnboardingAnalytics(
        authReq.user!.teamId
      );
      
      res.json(analytics);
    } catch (error) {
      logger.error("Failed to get onboarding analytics", { error });
      res.status(500).json({ error: "Failed to get analytics" });
    }
  }
);

// POST /api/onboarding/feedback - Submit onboarding feedback
router.post(
  "/onboarding/feedback",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        rating: z.number().min(1).max(5),
        feedback: z.string().optional(),
        completedSteps: z.array(z.string()),
        timeSpent: z.number(), // minutes
      });
      
      const data = schema.parse(req.body);
      
      // Store feedback (in a real app, this would go to a feedback table)
      logger.info("Onboarding feedback received", {
        userId: authReq.user!.userId,
        ...data,
      });
      
      // Update user metadata with feedback
      await prisma.user.update({
        where: { id: authReq.user!.userId },
        data: {
          metadata: {
            onboardingFeedback: {
              ...data,
              submittedAt: new Date(),
            },
          },
        } as any,
      });
      
      res.json({
        success: true,
        message: "Thank you for your feedback!",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to submit onboarding feedback", { error });
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  }
);

export { router as onboardingRouter };