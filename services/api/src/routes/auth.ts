import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import * as argon2 from "argon2";
import { nanoid } from "nanoid";
import { prisma } from "../utils/prisma";
import { Role } from "../types/auth";

const signupSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Signup - stricter rate limit (5 per hour per IP)
  app.post(
    "/signup",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      try {
        const body = signupSchema.parse(request.body);

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { email: body.email },
        });

        if (existingUser) {
          return reply.status(400).send({ error: "Email already registered" });
        }

        // Hash password
        const hashedPassword = await argon2.hash(body.password);

        // Create user and organization in transaction
        const result = await prisma.$transaction(async (tx: any) => {
          // Create user
          const user = await tx.user.create({
            data: {
              email: body.email,
              name: body.name,
              password: hashedPassword,
            },
          });

          // Create organization
          const orgSlug =
            body.organizationName
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "") +
            "-" +
            nanoid(6);

          const organization = await tx.organization.create({
            data: {
              name: body.organizationName,
              slug: orgSlug,
              members: {
                create: {
                  userId: user.id,
                  role: Role.owner,
                },
              },
            },
          });

          return { user, organization };
        });

        // Generate JWT
        const token = await app.jwt.sign({
          sub: result.user.id,
          email: result.user.email,
          organizations: [
            {
              id: result.organization.id,
              role: Role.owner,
            },
          ],
        });

        // Generate refresh token
        const refreshToken = await app.jwt.sign(
          {
            sub: result.user.id,
            email: result.user.email,
            type: "refresh",
          },
          { expiresIn: "30d" },
        );

        return reply.status(201).send({
          token,
          refreshToken,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: Role.owner,
          },
          organization: {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.slug,
          },
        });
      } catch (error: any) {
        if (error.name === "ZodError") {
          return reply.status(400).send({
            error: "Validation failed",
            details: error.errors,
          });
        }
        throw error;
      }
    },
  );

  // Login - moderate rate limit (10 per minute per IP)
  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        include: {
          organizations: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Verify password
      const validPassword = await argon2.verify(user.password, body.password);
      if (!validPassword) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Generate JWT
      const token = await app.jwt.sign({
        sub: user.id,
        email: user.email,
        organizations: user.organizations.map((om: any) => ({
          id: om.organization.id,
          role: om.role,
        })),
      });

      // Generate refresh token
      const refreshToken = await app.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          type: "refresh",
        },
        { expiresIn: "30d" },
      );

      return {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        organizations: user.organizations.map((om: any) => ({
          id: om.organization.id,
          name: om.organization.name,
          slug: om.organization.slug,
          role: om.role,
        })),
      };
    },
  );

  // Refresh token
  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      return reply.status(400).send({ error: "Refresh token required" });
    }

    try {
      const decoded = (await app.jwt.verify(refreshToken)) as any;

      if (decoded.type !== "refresh") {
        return reply.status(401).send({ error: "Invalid token type" });
      }
      // Get user and fresh organization data
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const organizations = await prisma.organizationMember.findMany({
        where: { userId: user.id },
        include: { organization: true },
      });

      // Generate new token
      const token = await app.jwt.sign({
        sub: user.id,
        email: user.email,
        organizations: organizations.map((om: any) => ({
          id: om.organization.id,
          role: om.role,
        })),
      });

      // Generate new refresh token
      const newRefreshToken = await app.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          type: "refresh",
        },
        { expiresIn: "30d" },
      );

      return { token, refreshToken: newRefreshToken };
    } catch (error) {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // Get current user
  app.get(
    "/me",
    {
      preHandler: app.authenticate,
    },
    async (request, _reply) => {
      // Get fresh user data with organizations
      const user = await prisma.user.findUnique({
        where: { id: request.auth!.user.id },
        include: {
          organizations: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        organization: user.organizations[0]
          ? {
              id: user.organizations[0].organization.id,
              name: user.organizations[0].organization.name,
              slug: user.organizations[0].organization.slug,
              role: user.organizations[0].role,
            }
          : null,
      };
    },
  );
};
