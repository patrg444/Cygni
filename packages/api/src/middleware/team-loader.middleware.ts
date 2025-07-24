import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import logger from "../lib/logger";

const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    teamId: string;
    userId: string;
    email: string;
  };
  team?: {
    id: string;
    name: string;
    planId: string;
    subscriptionStatus: string;
  };
}

export async function teamLoaderMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  
  // Skip if no user or team already loaded
  if (!authReq.user || authReq.team) {
    return next();
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id: authReq.user.teamId },
      select: {
        id: true,
        name: true,
        planId: true,
        subscriptionStatus: true,
      },
    });

    if (team) {
      authReq.team = team;
    } else {
      logger.warn("Team not found for authenticated user", {
        userId: authReq.user.userId,
        teamId: authReq.user.teamId,
      });
    }
  } catch (error) {
    logger.error("Failed to load team", {
      error: error instanceof Error ? error.message : error,
      userId: authReq.user.userId,
      teamId: authReq.user.teamId,
    });
  }

  next();
}