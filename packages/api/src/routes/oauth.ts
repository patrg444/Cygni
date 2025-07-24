import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import { jwtService, jwtMiddleware } from "./auth";
import { GitHubOAuthService } from "../services/auth/github-oauth.service";
import { getAuditLogger } from "../services/audit/audit-logger.service";
import { AuditEventType } from "../services/audit/audit-events";
import logger from "../lib/logger";
import { recordAuthentication } from "../lib/metrics";

const router = Router();
const prisma = new PrismaClient();
const githubOAuth = new GitHubOAuthService(prisma, jwtService);

// Store state parameters temporarily (in production, use Redis)
const stateStore = new Map<string, { timestamp: number; redirectUrl?: string }>();

// Clean up old state entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
      stateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

// GET /api/auth/github - Initiate GitHub OAuth flow
router.get("/auth/github", (req: Request, res: Response) => {
  try {
    const state = uuidv4();
    const redirectUrl = req.query.redirect as string || "/dashboard";
    
    // Store state for verification
    stateStore.set(state, {
      timestamp: Date.now(),
      redirectUrl,
    });
    
    const authUrl = githubOAuth.getAuthorizationUrl(state);
    
    logger.info("GitHub OAuth flow initiated", { 
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    
    res.redirect(authUrl);
  } catch (error) {
    logger.error("Failed to initiate GitHub OAuth", { error });
    res.redirect("/login?error=oauth_init_failed");
  }
});

// GET /api/auth/github/callback - Handle GitHub OAuth callback
router.get("/auth/github/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error: githubError } = req.query;
    
    if (githubError) {
      logger.warn("GitHub OAuth error", { error: githubError });
      return res.redirect("/login?error=github_denied");
    }
    
    if (!code || !state) {
      return res.redirect("/login?error=missing_params");
    }
    
    // Verify state
    const stateData = stateStore.get(state as string);
    if (!stateData) {
      logger.warn("Invalid OAuth state", { state });
      return res.redirect("/login?error=invalid_state");
    }
    
    stateStore.delete(state as string);
    
    // Exchange code for token and create/login user
    const result = await githubOAuth.handleOAuthCallback(code as string, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      method: req.method,
      path: req.path,
    });
    
    recordAuthentication("github", true);
    
    // Redirect with token (in production, use secure cookie)
    const redirectUrl = stateData.redirectUrl || "/dashboard";
    const params = new URLSearchParams({
      token: result.token,
      isNewUser: result.isNewUser.toString(),
    });
    
    res.redirect(`${redirectUrl}?${params.toString()}`);
  } catch (error) {
    logger.error("GitHub OAuth callback failed", { error });
    recordAuthentication("github", false);
    res.redirect("/login?error=oauth_failed");
  }
});

// POST /api/auth/link/github - Link GitHub account to existing user
router.post(
  "/auth/link/github",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { oauthAccounts: true },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if already linked
      const existingGitHub = user.oauthAccounts.find(acc => acc.provider === "github");
      if (existingGitHub) {
        return res.status(400).json({ error: "GitHub account already linked" });
      }
      
      // Generate state for linking flow
      const state = uuidv4();
      stateStore.set(state, {
        timestamp: Date.now(),
        redirectUrl: "/settings/integrations",
      });
      
      const authUrl = githubOAuth.getAuthorizationUrl(state);
      
      res.json({ authUrl });
    } catch (error) {
      logger.error("Failed to initiate GitHub linking", { error });
      res.status(500).json({ error: "Failed to link GitHub account" });
    }
  }
);

// DELETE /api/auth/link/github - Unlink GitHub account
router.delete(
  "/auth/link/github",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { oauthAccounts: true },
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user has password (can't unlink if no password)
      if (!user.password && user.oauthAccounts.length === 1) {
        return res.status(400).json({ 
          error: "Cannot unlink last authentication method. Set a password first." 
        });
      }
      
      await githubOAuth.revokeAccess(req.user.userId);
      
      const auditLogger = getAuditLogger(prisma);
      await auditLogger.log({
        action: "user.oauth_unlinked",
        actorType: "user" as any,
        resourceType: "user",
        resourceId: req.user.userId,
        teamId: req.user.teamId,
        metadata: { provider: "github" },
      }, {
        user: req.user,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      res.json({ message: "GitHub account unlinked successfully" });
    } catch (error) {
      logger.error("Failed to unlink GitHub account", { error });
      res.status(500).json({ error: "Failed to unlink GitHub account" });
    }
  }
);

// GET /api/auth/providers - Get linked OAuth providers
router.get(
  "/auth/providers",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const oauthAccounts = await prisma.oAuthAccount.findMany({
        where: { userId: req.user.userId },
        select: {
          provider: true,
          username: true,
          avatarUrl: true,
          createdAt: true,
        },
      });
      
      const providers = oauthAccounts.map(account => ({
        provider: account.provider,
        username: account.username,
        avatarUrl: account.avatarUrl,
        linkedAt: account.createdAt,
      }));
      
      res.json({ providers });
    } catch (error) {
      logger.error("Failed to get OAuth providers", { error });
      res.status(500).json({ error: "Failed to get linked providers" });
    }
  }
);

// GET /api/github/orgs - Get user's GitHub organizations
router.get(
  "/github/orgs",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const orgs = await githubOAuth.getUserOrganizations(req.user.userId);
      res.json({ organizations: orgs });
    } catch (error) {
      logger.error("Failed to get GitHub organizations", { error });
      res.status(500).json({ error: "Failed to get GitHub organizations" });
    }
  }
);

// POST /api/github/check-repo - Check if user has access to a GitHub repo
router.post(
  "/github/check-repo",
  jwtMiddleware(jwtService),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { repo } = req.body;
      
      if (!repo || typeof repo !== "string") {
        return res.status(400).json({ error: "Repository name required" });
      }
      
      const result = await githubOAuth.checkGitHubPermissions(req.user.userId, repo);
      
      res.json(result);
    } catch (error) {
      logger.error("Failed to check GitHub permissions", { error });
      res.status(500).json({ error: "Failed to check repository access" });
    }
  }
);

export { router as oauthRouter };