import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "../../lib/encryption";
import { JWTRotationService } from "./jwt-rotation.service";
import logger from "../../lib/logger";
import { getAuditLogger } from "../audit/audit-logger.service";
import { AuditEventType, ActorType } from "../audit/audit-events";

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
  html_url: string;
  type: string;
  site_admin: boolean;
  company: string | null;
  blog: string | null;
  location: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  scope: string;
}

export class GitHubOAuthService {
  private prisma: PrismaClient;
  private jwtService: JWTRotationService;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(prisma: PrismaClient, jwtService: JWTRotationService) {
    this.prisma = prisma;
    this.jwtService = jwtService;
    this.clientId = process.env.GITHUB_CLIENT_ID || "";
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
    this.redirectUri = process.env.GITHUB_REDIRECT_URI || "http://localhost:3000/api/auth/github/callback";

    if (!this.clientId || !this.clientSecret) {
      logger.warn("GitHub OAuth credentials not configured");
    }
  }

  // Generate OAuth authorization URL
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: "read:user user:email",
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code: string): Promise<OAuthTokens> {
    try {
      const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error_description || response.data.error);
      }

      return response.data;
    } catch (error) {
      logger.error("Failed to exchange code for token", { error });
      throw new Error("Failed to authenticate with GitHub");
    }
  }

  // Get GitHub user information
  async getGitHubUser(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to get GitHub user", { error });
      throw new Error("Failed to get user information from GitHub");
    }
  }

  // Get user's primary email if not public
  async getGitHubUserEmails(accessToken: string): Promise<GitHubEmail[]> {
    try {
      const response = await axios.get("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to get GitHub user emails", { error });
      throw new Error("Failed to get user emails from GitHub");
    }
  }

  // Handle OAuth callback and create/update user
  async handleOAuthCallback(code: string, requestContext: any): Promise<{
    user: any;
    team: any;
    token: string;
    isNewUser: boolean;
  }> {
    const auditLogger = getAuditLogger(this.prisma);

    // Exchange code for token
    const tokens = await this.exchangeCodeForToken(code);

    // Get user information
    const githubUser = await this.getGitHubUser(tokens.access_token);

    // Get primary email if not public
    let email = githubUser.email;
    if (!email) {
      const emails = await this.getGitHubUserEmails(tokens.access_token);
      const primaryEmail = emails.find(e => e.primary && e.verified);
      if (!primaryEmail) {
        throw new Error("No verified email found on GitHub account");
      }
      email = primaryEmail.email;
    }

    // Check if OAuth account already exists
    let oauthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "github",
          providerAccountId: githubUser.id.toString(),
        },
      },
      include: {
        user: {
          include: {
            team: true,
          },
        },
      },
    });

    let user;
    let team;
    let isNewUser = false;

    if (oauthAccount) {
      // Update tokens and login existing user
      await this.prisma.oAuthAccount.update({
        where: { id: oauthAccount.id },
        data: {
          accessToken: encrypt(tokens.access_token),
          tokenType: tokens.token_type,
          scope: tokens.scope,
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          profileUrl: githubUser.html_url,
        },
      });

      user = oauthAccount.user;
      team = oauthAccount.user.team;

      // Update last login
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Audit log
      await auditLogger.logUserAction(
        AuditEventType.USER_LOGIN,
        user.id,
        requestContext,
        { provider: "github", githubUsername: githubUser.login }
      );
    } else {
      // Check if user with email exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        include: { team: true },
      });

      if (existingUser) {
        // Link GitHub account to existing user
        await this.prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: "github",
            providerAccountId: githubUser.id.toString(),
            accessToken: encrypt(tokens.access_token),
            tokenType: tokens.token_type,
            scope: tokens.scope,
            username: githubUser.login,
            avatarUrl: githubUser.avatar_url,
            profileUrl: githubUser.html_url,
          },
        });

        user = existingUser;
        team = existingUser.team;

        // Audit log
        await auditLogger.log({
          action: "user.oauth_linked",
          actorType: ActorType.USER,
          resourceType: "user",
          resourceId: user.id,
          teamId: team.id,
          metadata: { provider: "github", githubUsername: githubUser.login },
        }, requestContext);
      } else {
        // Create new user and team
        isNewUser = true;
        const teamName = githubUser.company || `${githubUser.name || githubUser.login}'s Team`;

        const result = await this.prisma.team.create({
          data: {
            name: teamName,
            users: {
              create: {
                email,
                name: githubUser.name || githubUser.login,
                role: "owner",
                status: "active",
                oauthAccounts: {
                  create: {
                    provider: "github",
                    providerAccountId: githubUser.id.toString(),
                    accessToken: encrypt(tokens.access_token),
                    tokenType: tokens.token_type,
                    scope: tokens.scope,
                    username: githubUser.login,
                    avatarUrl: githubUser.avatar_url,
                    profileUrl: githubUser.html_url,
                  },
                },
              },
            },
          },
          include: {
            users: {
              include: {
                oauthAccounts: true,
              },
            },
          },
        });

        user = result.users[0];
        team = result;

        // Audit log
        await auditLogger.logUserAction(
          AuditEventType.USER_CREATED,
          user.id,
          requestContext,
          { 
            provider: "github", 
            githubUsername: githubUser.login,
            teamName,
          }
        );
      }
    }

    // Generate JWT
    const token = this.jwtService.signToken({
      userId: user.id,
      teamId: team.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      team: {
        id: team.id,
        name: team.name,
      },
      token,
      isNewUser,
    };
  }

  // Get user's GitHub organizations
  async getUserOrganizations(userId: string): Promise<any[]> {
    const oauthAccount = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: "github",
      },
    });

    if (!oauthAccount || !oauthAccount.accessToken) {
      return [];
    }

    try {
      const accessToken = decrypt(oauthAccount.accessToken);
      const response = await axios.get("https://api.github.com/user/orgs", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to get user organizations", { error });
      return [];
    }
  }

  // Revoke GitHub access
  async revokeAccess(userId: string): Promise<void> {
    const oauthAccount = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: "github",
      },
    });

    if (!oauthAccount) {
      throw new Error("GitHub account not linked");
    }

    // Delete OAuth account
    await this.prisma.oAuthAccount.delete({
      where: { id: oauthAccount.id },
    });

    logger.info("GitHub access revoked", { userId });
  }

  // Check if user has specific GitHub permissions
  async checkGitHubPermissions(userId: string, repo: string): Promise<{
    hasAccess: boolean;
    permissions?: any;
  }> {
    const oauthAccount = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: "github",
      },
    });

    if (!oauthAccount || !oauthAccount.accessToken) {
      return { hasAccess: false };
    }

    try {
      const accessToken = decrypt(oauthAccount.accessToken);
      const response = await axios.get(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      return {
        hasAccess: true,
        permissions: response.data.permissions,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { hasAccess: false };
      }
      throw error;
    }
  }
}