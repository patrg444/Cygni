import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../utils/prisma';
import { requireRole, canManageProject } from '../middleware/auth';
import { Role } from '../types/auth';

const createProjectSchema = z.object({
  name: z.string().min(1),
  framework: z.string().optional(),
  repository: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  framework: z.string().optional(),
  repository: z.string().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // List projects in organization
  app.get('/organizations/:organizationId/projects', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER])]
  }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };

    const projects = await prisma.project.findMany({
      where: { organizationId },
      include: {
        environments: true,
        _count: {
          select: { deployments: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects;
  });

  // Create project
  app.post('/organizations/:organizationId/projects', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])]
  }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const body = createProjectSchema.parse(request.body);

    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + nanoid(6);

    const project = await prisma.project.create({
      data: {
        organizationId,
        name: body.name,
        slug,
        framework: body.framework,
        repository: body.repository,
        environments: {
          create: [
            { name: 'Production', slug: 'production' },
            { name: 'Preview', slug: 'preview' },
          ]
        }
      },
      include: {
        environments: true,
      }
    });

    return project;
  });

  // Get project
  app.get('/projects/:projectId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER])]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        environments: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              }
            }
          }
        },
        _count: {
          select: { 
            deployments: true,
            builds: true,
          }
        }
      }
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return project;
  });

  // Update project
  app.patch('/projects/:projectId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = updateProjectSchema.parse(request.body);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: body,
    });

    return project;
  });

  // Delete project
  app.delete('/projects/:projectId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER])]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    await prisma.project.delete({
      where: { id: projectId },
    });

    return { success: true };
  });

  // Add project member
  app.post('/projects/:projectId/members', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { email, role } = z.object({
      email: z.string().email(),
      role: z.nativeEnum(Role),
    }).parse(request.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check if already member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId,
        }
      }
    });

    if (existingMember) {
      return reply.status(400).send({ error: 'User is already a member' });
    }

    const member = await prisma.projectMember.create({
      data: {
        userId: user.id,
        projectId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    return member;
  });

  // Remove project member
  app.delete('/projects/:projectId/members/:userId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])]
  }, async (request, reply) => {
    const { projectId, userId } = request.params as { projectId: string; userId: string };

    await prisma.projectMember.delete({
      where: {
        userId_projectId: {
          userId,
          projectId,
        }
      }
    });

    return { success: true };
  });
};