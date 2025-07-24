import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { decrypt } from "../../lib/encryption";
import logger from "../../lib/logger";
import { getAuditLogger } from "../audit/audit-logger.service";
import { AuditEventType, ActorType } from "../audit/audit-events";

export interface GitHubTeamMember {
  githubUsername: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  role: "member" | "admin";
}

export class GitHubTeamService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Invite team members by GitHub username
  async inviteByGitHub(
    teamId: string,
    inviterId: string,
    members: GitHubTeamMember[],
    requestContext: any
  ): Promise<{
    invited: string[];
    failed: Array<{ username: string; reason: string }>;
  }> {
    const invited: string[] = [];
    const failed: Array<{ username: string; reason: string }> = [];
    const auditLogger = getAuditLogger(this.prisma);

    // Get inviter's GitHub token
    const inviterOAuth = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId: inviterId,
        provider: "github",
      },
    });

    if (!inviterOAuth || !inviterOAuth.accessToken) {
      throw new Error("Inviter must have GitHub account linked");
    }

    const accessToken = decrypt(inviterOAuth.accessToken);

    for (const member of members) {
      try {
        // Get GitHub user info
        const githubUser = await this.getGitHubUser(member.githubUsername, accessToken);
        
        if (!githubUser) {
          failed.push({
            username: member.githubUsername,
            reason: "GitHub user not found",
          });
          continue;
        }

        // Check if user already exists
        const existingUser = await this.prisma.user.findFirst({
          where: {
            OR: [
              { email: githubUser.email },
              {
                oauthAccounts: {
                  some: {
                    provider: "github",
                    providerAccountId: githubUser.id.toString(),
                  },
                },
              },
            ],
          },
        });

        if (existingUser) {
          if (existingUser.teamId === teamId) {
            failed.push({
              username: member.githubUsername,
              reason: "User already in team",
            });
            continue;
          } else {
            failed.push({
              username: member.githubUsername,
              reason: "User belongs to another team",
            });
            continue;
          }
        }

        // Create invitation
        const invitation = await this.prisma.teamInvitation.create({
          data: {
            teamId,
            invitedBy: inviterId,
            email: githubUser.email || `${member.githubUsername}@github.local`,
            role: member.role,
            githubUsername: member.githubUsername,
            githubUserId: githubUser.id.toString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });

        invited.push(member.githubUsername);

        // Send notification (in production, send email)
        logger.info("GitHub team invitation created", {
          teamId,
          githubUsername: member.githubUsername,
          invitationId: invitation.id,
        });

        // Audit log
        await auditLogger.log({
          action: AuditEventType.TEAM_MEMBER_ADDED,
          actorType: ActorType.USER,
          resourceType: "team_invitation",
          resourceId: invitation.id,
          teamId,
          metadata: {
            githubUsername: member.githubUsername,
            role: member.role,
            invitationType: "github",
          },
        }, requestContext);
      } catch (error) {
        logger.error("Failed to invite GitHub user", {
          username: member.githubUsername,
          error,
        });
        failed.push({
          username: member.githubUsername,
          reason: "Failed to process invitation",
        });
      }
    }

    return { invited, failed };
  }

  // Accept GitHub invitation
  async acceptGitHubInvitation(
    invitationToken: string,
    githubUserId: string,
    requestContext: any
  ): Promise<{
    user: any;
    team: any;
  }> {
    const invitation = await this.prisma.teamInvitation.findFirst({
      where: {
        id: invitationToken,
        githubUserId,
        expiresAt: { gt: new Date() },
        acceptedAt: null,
      },
      include: {
        team: true,
      },
    });

    if (!invitation) {
      throw new Error("Invalid or expired invitation");
    }

    // Get GitHub user's OAuth info
    const oauthAccount = await this.prisma.oAuthAccount.findFirst({
      where: {
        provider: "github",
        providerAccountId: githubUserId,
      },
      include: {
        user: true,
      },
    });

    let user;

    if (oauthAccount) {
      // User exists, just add to team
      user = await this.prisma.user.update({
        where: { id: oauthAccount.userId },
        data: {
          teamId: invitation.teamId,
          role: invitation.role,
        },
      });
    } else {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email: invitation.email,
          name: invitation.githubUsername,
          teamId: invitation.teamId,
          role: invitation.role,
          status: "active",
        },
      });
    }

    // Mark invitation as accepted
    await this.prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    // Audit log
    const auditLogger = getAuditLogger(this.prisma);
    await auditLogger.log({
      action: AuditEventType.TEAM_MEMBER_ADDED,
      actorType: ActorType.USER,
      resourceType: "user",
      resourceId: user.id,
      teamId: invitation.teamId,
      metadata: {
        invitationType: "github",
        role: invitation.role,
      },
    }, requestContext);

    return { user, team: invitation.team };
  }

  // Get team members with GitHub info
  async getTeamMembersWithGitHub(teamId: string): Promise<any[]> {
    const users = await this.prisma.user.findMany({
      where: { teamId },
      include: {
        oauthAccounts: {
          where: { provider: "github" },
          select: {
            username: true,
            avatarUrl: true,
            profileUrl: true,
          },
        },
      },
    });

    return users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      github: user.oauthAccounts[0] || null,
      joinedAt: user.createdAt,
    }));
  }

  // Helper to get GitHub user info
  private async getGitHubUser(username: string, accessToken: string): Promise<any> {
    try {
      const response = await axios.get(`https://api.github.com/users/${username}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Sync team members from GitHub organization
  async syncFromGitHubOrg(
    teamId: string,
    userId: string,
    orgName: string,
    requestContext: any
  ): Promise<{
    synced: number;
    errors: string[];
  }> {
    const synced = 0;
    const errors: string[] = [];

    // Get user's GitHub token
    const oauthAccount = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: "github",
      },
    });

    if (!oauthAccount || !oauthAccount.accessToken) {
      throw new Error("GitHub account not linked");
    }

    const accessToken = decrypt(oauthAccount.accessToken);

    try {
      // Get organization members
      const response = await axios.get(`https://api.github.com/orgs/${orgName}/members`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      const members = response.data;

      // Process each member
      for (const member of members) {
        try {
          // Check if already in team
          const existing = await this.prisma.user.findFirst({
            where: {
              teamId,
              oauthAccounts: {
                some: {
                  provider: "github",
                  providerAccountId: member.id.toString(),
                },
              },
            },
          });

          if (!existing) {
            // Create invitation
            await this.inviteByGitHub(teamId, userId, [{
              githubUsername: member.login,
              role: "member",
            }], requestContext);
          }
        } catch (error) {
          errors.push(`Failed to sync ${member.login}: ${error}`);
        }
      }

      return { synced: members.length - errors.length, errors };
    } catch (error) {
      logger.error("Failed to sync GitHub organization", { orgName, error });
      throw new Error("Failed to sync GitHub organization members");
    }
  }
}

// Extend Prisma schema with team invitation model
// Add this to your schema.prisma:
/*
model TeamInvitation {
  id            String    @id @default(cuid())
  teamId        String
  team          Team      @relation(fields: [teamId], references: [id])
  email         String
  role          String    @default("member")
  invitedBy     String
  inviter       User      @relation(fields: [invitedBy], references: [id])
  githubUsername String?
  githubUserId  String?
  acceptedAt    DateTime?
  expiresAt     DateTime
  createdAt     DateTime  @default(now())
  
  @@index([teamId])
  @@index([email])
  @@index([githubUserId])
}
*/