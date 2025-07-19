import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { prisma } from '../utils/prisma';
import { Role } from '../types/auth';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Signup
  app.post('/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      return reply.status(400).send({ error: 'Email already registered' });
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
      const orgSlug = body.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + '-' + nanoid(6);

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
      organizations: [{
        id: result.organization.id,
        role: Role.owner,
      }],
    });

    return {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
    };
  });

  // Login
  app.post('/login', async (request, reply) => {
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
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await argon2.verify(user.password, body.password);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = await app.jwt.sign({
      sub: user.id,
      email: user.email,
      organizations: user.organizations.map(om => ({
        id: om.organization.id,
        role: om.role,
      })),
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizations: user.organizations.map(om => ({
        id: om.organization.id,
        name: om.organization.name,
        slug: om.organization.slug,
        role: om.role,
      })),
    };
  });

  // Refresh token
  app.post('/refresh', { 
    preHandler: app.authenticate 
  }, async (request, reply) => {
    const user = request.auth!.user;
    
    // Get fresh organization data
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

    return { token };
  });

  // Get current user
  app.get('/me', { 
    preHandler: app.authenticate 
  }, async (request, reply) => {
    return {
      user: request.auth!.user,
      organizations: request.auth!.organizations,
    };
  });
};