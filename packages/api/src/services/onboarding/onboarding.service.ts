import { PrismaClient } from "@prisma/client";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notification/notification.service";
import logger from "../../lib/logger";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  action?: string;
  metadata?: any;
}

export interface OnboardingProgress {
  userId: string;
  teamId: string;
  currentStep: string;
  completedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
  metadata: any;
}

export class OnboardingService {
  private prisma: PrismaClient;
  private emailService: EmailService;
  private notificationService: NotificationService;

  // Define onboarding steps
  private readonly ONBOARDING_STEPS: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to Cygni",
      description: "Get started with your account setup",
      completed: false,
      required: true,
    },
    {
      id: "verify_email",
      title: "Verify Your Email",
      description: "Confirm your email address to enable all features",
      completed: false,
      required: true,
      action: "verify_email",
    },
    {
      id: "create_project",
      title: "Create Your First Project",
      description: "Deploy your first application to Cygni",
      completed: false,
      required: true,
      action: "create_project",
    },
    {
      id: "invite_team",
      title: "Invite Team Members",
      description: "Collaborate with your team on Cygni",
      completed: false,
      required: false,
      action: "invite_team",
    },
    {
      id: "setup_domain",
      title: "Add a Custom Domain",
      description: "Connect your own domain to your projects",
      completed: false,
      required: false,
      action: "setup_domain",
    },
    {
      id: "explore_features",
      title: "Explore Advanced Features",
      description: "Learn about monitoring, scaling, and security",
      completed: false,
      required: false,
      action: "explore_features",
    },
  ];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.emailService = new EmailService();
    this.notificationService = new NotificationService(prisma);
  }

  // Initialize onboarding for a new user
  async initializeOnboarding(userId: string, teamId: string): Promise<OnboardingProgress> {
    try {
      // Check if onboarding already exists
      const existing = await this.getOnboardingProgress(userId);
      if (existing) {
        return existing;
      }

      // Create new onboarding progress
      const progress: OnboardingProgress = {
        userId,
        teamId,
        currentStep: "welcome",
        completedSteps: [],
        startedAt: new Date(),
        metadata: {
          source: "signup",
          version: "1.0",
        },
      };

      // Store in database (using user metadata for now)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          metadata: {
            onboarding: progress,
          },
        } as any,
      });

      // Send welcome email
      await this.sendWelcomeEmail(userId);

      // Create welcome notification
      await this.notificationService.createNotification({
        userId,
        type: "onboarding",
        severity: "info",
        title: "Welcome to Cygni! 🚀",
        message: "Let's get you started with deploying your first application.",
        data: {
          step: "welcome",
          action: "start_onboarding",
        },
      });

      logger.info("Onboarding initialized", { userId, teamId });
      return progress;
    } catch (error) {
      logger.error("Failed to initialize onboarding", { error, userId });
      throw error;
    }
  }

  // Get current onboarding progress
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !(user as any).metadata?.onboarding) {
        return null;
      }

      return (user as any).metadata.onboarding;
    } catch (error) {
      logger.error("Failed to get onboarding progress", { error, userId });
      return null;
    }
  }

  // Get onboarding steps with current progress
  async getOnboardingSteps(userId: string): Promise<OnboardingStep[]> {
    const progress = await this.getOnboardingProgress(userId);
    if (!progress) {
      return this.ONBOARDING_STEPS;
    }

    // Mark completed steps
    return this.ONBOARDING_STEPS.map(step => ({
      ...step,
      completed: progress.completedSteps.includes(step.id),
    }));
  }

  // Complete an onboarding step
  async completeStep(userId: string, stepId: string): Promise<OnboardingProgress> {
    try {
      const progress = await this.getOnboardingProgress(userId);
      if (!progress) {
        throw new Error("Onboarding not initialized");
      }

      // Check if step already completed
      if (progress.completedSteps.includes(stepId)) {
        return progress;
      }

      // Add to completed steps
      progress.completedSteps.push(stepId);

      // Find next incomplete required step
      const steps = this.ONBOARDING_STEPS;
      const currentIndex = steps.findIndex(s => s.id === stepId);
      let nextStep = null;

      for (let i = currentIndex + 1; i < steps.length; i++) {
        if (!progress.completedSteps.includes(steps[i].id)) {
          nextStep = steps[i];
          break;
        }
      }

      // Update current step
      if (nextStep) {
        progress.currentStep = nextStep.id;
      } else {
        // All steps completed
        progress.completedAt = new Date();
        await this.onOnboardingComplete(userId, progress);
      }

      // Save progress
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          metadata: {
            onboarding: progress,
          },
        } as any,
      });

      // Send step completion notification
      await this.sendStepCompletionNotification(userId, stepId, nextStep);

      logger.info("Onboarding step completed", { userId, stepId, nextStep: nextStep?.id });
      return progress;
    } catch (error) {
      logger.error("Failed to complete onboarding step", { error, userId, stepId });
      throw error;
    }
  }

  // Skip onboarding (for experienced users)
  async skipOnboarding(userId: string): Promise<void> {
    try {
      const progress = await this.getOnboardingProgress(userId);
      if (!progress) {
        throw new Error("Onboarding not initialized");
      }

      // Mark all steps as completed
      progress.completedSteps = this.ONBOARDING_STEPS.map(s => s.id);
      progress.completedAt = new Date();
      progress.metadata.skipped = true;

      // Save progress
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          metadata: {
            onboarding: progress,
          },
        } as any,
      });

      logger.info("Onboarding skipped", { userId });
    } catch (error) {
      logger.error("Failed to skip onboarding", { error, userId });
      throw error;
    }
  }

  // Get onboarding tips based on current progress
  async getOnboardingTips(userId: string): Promise<{
    currentTip: string;
    nextAction: string;
    progress: number;
  }> {
    const progress = await this.getOnboardingProgress(userId);
    if (!progress) {
      return {
        currentTip: "Welcome! Start by creating your first project.",
        nextAction: "create_project",
        progress: 0,
      };
    }

    const totalSteps = this.ONBOARDING_STEPS.filter(s => s.required).length;
    const completedRequired = this.ONBOARDING_STEPS
      .filter(s => s.required && progress.completedSteps.includes(s.id))
      .length;
    const progressPercent = Math.round((completedRequired / totalSteps) * 100);

    // Get current step
    const currentStep = this.ONBOARDING_STEPS.find(s => s.id === progress.currentStep);
    
    const tips: Record<string, string> = {
      welcome: "👋 Welcome to Cygni! Let's get your account set up.",
      verify_email: "📧 Check your inbox to verify your email address.",
      create_project: "🚀 Deploy your first app with 'cygni deploy' command.",
      invite_team: "👥 Working with others? Invite your team members.",
      setup_domain: "🌐 Make your app accessible on your own domain.",
      explore_features: "🎯 Discover monitoring, scaling, and security features.",
    };

    return {
      currentTip: tips[progress.currentStep] || "Keep going! You're doing great.",
      nextAction: currentStep?.action || "continue",
      progress: progressPercent,
    };
  }

  // Private helper methods

  private async sendWelcomeEmail(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) return;

      await this.emailService.sendEmail({
        to: user.email,
        subject: "Welcome to Cygni! 🚀",
        template: "welcome",
        data: {
          name: user.name || "Developer",
          dashboardUrl: `${process.env.DASHBOARD_URL}/onboarding`,
          docsUrl: `${process.env.DOCS_URL}/getting-started`,
        },
      });
    } catch (error) {
      logger.error("Failed to send welcome email", { error, userId });
    }
  }

  private async sendStepCompletionNotification(
    userId: string,
    completedStepId: string,
    nextStep: OnboardingStep | null
  ): Promise<void> {
    try {
      const completedStep = this.ONBOARDING_STEPS.find(s => s.id === completedStepId);
      if (!completedStep) return;

      await this.notificationService.createNotification({
        userId,
        type: "onboarding",
        severity: "success",
        title: `✅ ${completedStep.title} completed!`,
        message: nextStep
          ? `Great job! Next: ${nextStep.title}`
          : "Congratulations! You've completed the onboarding.",
        data: {
          completedStep: completedStepId,
          nextStep: nextStep?.id,
          action: nextStep?.action,
        },
      });
    } catch (error) {
      logger.error("Failed to send step completion notification", { error, userId });
    }
  }

  private async onOnboardingComplete(userId: string, progress: OnboardingProgress): Promise<void> {
    try {
      // Send completion email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (user) {
        await this.emailService.sendEmail({
          to: user.email,
          subject: "🎉 You're all set up!",
          template: "onboarding-complete",
          data: {
            name: user.name || "Developer",
            completionTime: Math.round(
              (progress.completedAt!.getTime() - progress.startedAt.getTime()) / 1000 / 60
            ), // minutes
            dashboardUrl: process.env.DASHBOARD_URL,
          },
        });
      }

      // Create completion notification
      await this.notificationService.createNotification({
        userId,
        type: "onboarding",
        severity: "success",
        title: "🎉 Onboarding Complete!",
        message: "You're all set up and ready to deploy amazing applications.",
        data: {
          completedAt: progress.completedAt,
          totalSteps: progress.completedSteps.length,
        },
      });

      // Grant achievement/badge (future feature)
      logger.info("Onboarding completed", { userId, duration: progress.completedAt!.getTime() - progress.startedAt.getTime() });
    } catch (error) {
      logger.error("Failed to handle onboarding completion", { error, userId });
    }
  }

  // Analytics methods

  async getOnboardingAnalytics(teamId: string): Promise<{
    totalUsers: number;
    completedOnboarding: number;
    averageCompletionTime: number;
    stepCompletionRates: Record<string, number>;
    dropOffPoints: string[];
  }> {
    try {
      const users = await this.prisma.user.findMany({
        where: { teamId },
      });

      let completedCount = 0;
      let totalCompletionTime = 0;
      const stepCompletions: Record<string, number> = {};
      const lastSteps: string[] = [];

      for (const user of users) {
        const metadata = (user as any).metadata;
        if (!metadata?.onboarding) continue;

        const progress = metadata.onboarding as OnboardingProgress;

        if (progress.completedAt) {
          completedCount++;
          totalCompletionTime += progress.completedAt.getTime() - progress.startedAt.getTime();
        } else {
          lastSteps.push(progress.currentStep);
        }

        for (const stepId of progress.completedSteps) {
          stepCompletions[stepId] = (stepCompletions[stepId] || 0) + 1;
        }
      }

      // Calculate step completion rates
      const stepRates: Record<string, number> = {};
      for (const step of this.ONBOARDING_STEPS) {
        stepRates[step.id] = Math.round(
          ((stepCompletions[step.id] || 0) / users.length) * 100
        );
      }

      // Find common drop-off points
      const dropOffCounts = lastSteps.reduce((acc, step) => {
        acc[step] = (acc[step] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const dropOffPoints = Object.entries(dropOffCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([step]) => step);

      return {
        totalUsers: users.length,
        completedOnboarding: completedCount,
        averageCompletionTime: completedCount > 0
          ? Math.round(totalCompletionTime / completedCount / 1000 / 60) // minutes
          : 0,
        stepCompletionRates: stepRates,
        dropOffPoints,
      };
    } catch (error) {
      logger.error("Failed to get onboarding analytics", { error, teamId });
      throw error;
    }
  }
}

// Export singleton instance
let onboardingService: OnboardingService | null = null;

export function getOnboardingService(prisma: PrismaClient): OnboardingService {
  if (!onboardingService) {
    onboardingService = new OnboardingService(prisma);
  }
  return onboardingService;
}