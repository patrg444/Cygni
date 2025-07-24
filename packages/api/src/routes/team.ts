import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { GitHubTeamService } from "../services/team/github-team.service";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();
const githubTeamService = new GitHubTeamService(prisma);

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    teamId: string;
    role: string;
  };
}

// POST /api/teams/invite/github - Invite team members by GitHub username
router.post(
  "/teams/invite/github",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins and owners can invite
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const schema = z.object({
        members: z.array(z.object({
          githubUsername: z.string(),
          role: z.enum(["member", "admin"]).default("member"),
        })).min(1).max(20),
      });
      
      const { members } = schema.parse(req.body);
      
      const result = await githubTeamService.inviteByGitHub(
        authReq.user.teamId,
        authReq.user.userId,
        members,
        {
          user: authReq.user,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        }
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to invite GitHub users", { error });
      res.status(500).json({ error: "Failed to send invitations" });
    }
  }
);

// GET /api/teams/invitations - Get pending team invitations
router.get(
  "/teams/invitations",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const invitations = await prisma.teamInvitation.findMany({
        where: {
          teamId: authReq.user!.teamId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      
      res.json({ invitations });
    } catch (error) {
      logger.error("Failed to get invitations", { error });
      res.status(500).json({ error: "Failed to get invitations" });
    }
  }
);

// DELETE /api/teams/invitations/:id - Cancel invitation
router.delete(
  "/teams/invitations/:id",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins and owners can cancel invitations
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const invitation = await prisma.teamInvitation.findFirst({
        where: {
          id: req.params.id,
          teamId: authReq.user.teamId,
          acceptedAt: null,
        },
      });
      
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      await prisma.teamInvitation.delete({
        where: { id: invitation.id },
      });
      
      res.json({ message: "Invitation cancelled" });
    } catch (error) {
      logger.error("Failed to cancel invitation", { error });
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  }
);

// GET /api/teams/members - Get team members with GitHub info
router.get(
  "/teams/members",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      const members = await githubTeamService.getTeamMembersWithGitHub(
        authReq.user!.teamId
      );
      
      res.json({ members });
    } catch (error) {
      logger.error("Failed to get team members", { error });
      res.status(500).json({ error: "Failed to get team members" });
    }
  }
);

// POST /api/teams/sync/github-org - Sync team from GitHub organization
router.post(
  "/teams/sync/github-org",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only owners can sync from GitHub org
      if (authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Only team owners can sync from GitHub" });
      }
      
      const schema = z.object({
        organization: z.string(),
      });
      
      const { organization } = schema.parse(req.body);
      
      const result = await githubTeamService.syncFromGitHubOrg(
        authReq.user.teamId,
        authReq.user.userId,
        organization,
        {
          user: authReq.user,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        }
      );
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to sync GitHub organization", { error });
      res.status(500).json({ error: "Failed to sync organization members" });
    }
  }
);

// PUT /api/teams/members/:userId/role - Update team member role
router.put(
  "/teams/members/:userId/role",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only owners can change roles
      if (authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Only team owners can change roles" });
      }
      
      const schema = z.object({
        role: z.enum(["member", "admin"]),
      });
      
      const { role } = schema.parse(req.body);
      const { userId } = req.params;
      
      // Can't change own role
      if (userId === authReq.user.userId) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }
      
      // Check user is in team
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: authReq.user.teamId,
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found in team" });
      }
      
      // Update role
      await prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      
      logger.info("Team member role updated", {
        teamId: authReq.user.teamId,
        userId,
        newRole: role,
        updatedBy: authReq.user.userId,
      });
      
      res.json({ message: "Role updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Failed to update role", { error });
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// DELETE /api/teams/members/:userId - Remove team member
router.delete(
  "/teams/members/:userId",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only owners and admins can remove members
      if (authReq.user?.role !== "owner" && authReq.user?.role !== "admin") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const { userId } = req.params;
      
      // Can't remove self
      if (userId === authReq.user.userId) {
        return res.status(400).json({ error: "Cannot remove yourself from team" });
      }
      
      // Check user is in team
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          teamId: authReq.user.teamId,
        },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found in team" });
      }
      
      // Don't remove last owner
      if (user.role === "owner") {
        const ownerCount = await prisma.user.count({
          where: {
            teamId: authReq.user.teamId,
            role: "owner",
          },
        });
        
        if (ownerCount <= 1) {
          return res.status(400).json({ error: "Cannot remove last team owner" });
        }
      }
      
      // Remove from team (soft delete - user still exists)
      await prisma.user.update({
        where: { id: userId },
        data: {
          teamId: null as any, // Remove team association
          status: "inactive",
        },
      });
      
      logger.info("Team member removed", {
        teamId: authReq.user.teamId,
        userId,
        removedBy: authReq.user.userId,
      });
      
      res.json({ message: "Member removed from team" });
    } catch (error) {
      logger.error("Failed to remove team member", { error });
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

export { router as teamRouter };