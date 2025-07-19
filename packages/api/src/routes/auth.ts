import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { JWTRotationService } from "../services/auth/jwt-rotation.service";

const router = Router();
const prisma = new PrismaClient();
const jwtService = new JWTRotationService(prisma);

// Start JWT rotation job
jwtService.startRotationJob();

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Signup schema
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  teamName: z.string().min(2),
});

// POST /api/auth/signup
router.post("/auth/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, name, teamName } = signupSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create team and user
    const team = await prisma.team.create({
      data: {
        name: teamName,
        users: {
          create: {
            email,
            password: passwordHash,
            name,
            role: "owner",
          },
        },
      },
      include: {
        users: true,
      },
    });

    const user = team.users[0];

    // Generate JWT
    const token = jwtService.signToken({
      userId: user.id,
      teamId: team.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        team: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const token = jwtService.signToken({
      userId: user.id,
      teamId: user.teamId,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      team: {
        id: user.team.id,
        name: user.team.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/.well-known/jwks.json - Public key endpoint
router.get(
  "/auth/.well-known/jwks.json",
  async (_req: Request, res: Response) => {
    try {
      const jwks = await jwtService.getJWKS();

      // Cache for 1 hour
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(jwks);
    } catch (error) {
      console.error("JWKS error:", error);
      res.status(500).json({ error: "Failed to get JWKS" });
    }
  },
);

// POST /api/auth/refresh - Refresh token
router.post("/auth/refresh", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // Verify existing token
    const payload = await jwtService.verifyToken(token);

    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { team: true },
    });

    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    // Issue new token
    const newToken = jwtService.signToken({
      userId: user.id,
      teamId: user.teamId,
      email: user.email,
      role: user.role,
    });

    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// GET /api/auth/me - Get current user
router.get("/auth/me", async (req: Request & { user?: any }, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      team: {
        include: {
          projects: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    team: {
      id: user.team.id,
      name: user.team.name,
      projects: user.team.projects,
    },
  });
});

export { router as authRouter, jwtService };
