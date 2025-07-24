import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "../auth";
import logger from "../../lib/logger";

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

// GET /api/v2/users/me - Get current user profile
router.get(
  "/me",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const user = await prisma.user.findUnique({
        where: { id: authReq.user!.userId },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              plan: true,
              features: true,
            },
          },
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        team: user.team,
        metadata: user.metadata,
      });
    } catch (error) {
      logger.error("Failed to get user profile", { error });
      res.status(500).json({ error: "Failed to get user profile" });
    }
  }
);

// PUT /api/v2/users/me - Update current user profile
router.put(
  "/me",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const schema = z.object({
        name: z.string().optional(),
        metadata: z.any().optional(),
      });
      
      const data = schema.parse(req.body);
      
      const user = await prisma.user.update({
        where: { id: authReq.user!.userId },
        data,
      });
      
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        metadata: user.metadata,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to update user profile", { error });
      res.status(500).json({ error: "Failed to update user profile" });
    }
  }
);

// GET /api/v2/users - List team users (admin only)
router.get(
  "/",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can list users
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const { page = "1", limit = "10", search } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;
      
      const where = {
        teamId: authReq.user.teamId,
        ...(search && {
          OR: [
            { email: { contains: search as string, mode: "insensitive" as const } },
            { name: { contains: search as string, mode: "insensitive" as const } },
          ],
        }),
      };
      
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limitNum,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerified: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where }),
      ]);
      
      res.json({
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error("Failed to list users", { error });
      res.status(500).json({ error: "Failed to list users" });
    }
  }
);

// DELETE /api/v2/users/:userId - Remove user from team (admin only)
router.delete(
  "/:userId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;
    
    try {
      // Only admins can remove users
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      // Prevent self-deletion
      if (userId === authReq.user.userId) {
        return res.status(400).json({ error: "Cannot remove yourself" });
      }
      
      // Verify user belongs to team
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: authReq.user.teamId,
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent removing the last owner
      if (user.role === "owner") {
        const ownerCount = await prisma.user.count({
          where: {
            teamId: authReq.user.teamId,
            role: "owner",
          },
        });
        
        if (ownerCount <= 1) {
          return res.status(400).json({ error: "Cannot remove the last owner" });
        }
      }
      
      await prisma.user.delete({
        where: { id: userId },
      });
      
      res.json({ message: "User removed successfully" });
    } catch (error) {
      logger.error("Failed to remove user", { error });
      res.status(500).json({ error: "Failed to remove user" });
    }
  }
);

export { router as usersRouter };