import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

export const projectMembersRoutes: FastifyPluginAsync = async (app) => {
  // List project members
  app.get('/projects/:projectId/members', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER])],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      }
    }
  }, async (request, _reply) => {
    const { projectId } = request.params as { projectId: string };

    const members = await projectService.listProjectMembers(projectId);
    return members;
  });

  // Add project member
  app.post('/projects/:projectId/members', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: Object.values(Role) }
        },
        required: ['email', 'role']
      }
    }
  }, async (request, _reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = addMemberSchema.parse(request.body);

    try {
      const member = await projectService.addProjectMember({
        projectId,
        email: body.email,
        role: body.role,
        addedBy: request.auth!.user.id
      });

      reply.status(201);
      return member;
    } catch (error: any) {
      if (error.code === 'USER_NOT_FOUND') {
        return reply.status(404).send({ error: 'User not found' });
      }
      if (error.code === 'ALREADY_MEMBER') {
        return reply.status(400).send({ error: 'User is already a member' });
      }
      throw error;
    }
  });

  // Update member role
  app.patch('/projects/:projectId/members/:userId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          userId: { type: 'string' }
        },
        required: ['projectId', 'userId']
      },
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: Object.values(Role) }
        },
        required: ['role']
      }
    }
  }, async (request, _reply) => {
    const { projectId, userId } = request.params as { projectId: string; userId: string };
    const { role } = request.body as { role: Role };

    const member = await projectService.updateMemberRole(projectId, userId, role);

    if (!member) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return member;
  });

  // Remove project member
  app.delete('/projects/:projectId/members/:userId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          userId: { type: 'string' }
        },
        required: ['projectId', 'userId']
      }
    }
  }, async (request, _reply) => {
    const { projectId, userId } = request.params as { projectId: string; userId: string };

    // Prevent removing the last owner
    const isLastOwner = await projectService.isLastOwner(projectId, userId);
    
    if (isLastOwner) {
      return reply.status(400).send({ 
        error: 'Cannot remove the last owner of the project',
        code: 'LAST_OWNER' 
      });
    }

    const removed = await projectService.removeProjectMember(projectId, userId);

    if (!removed) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    reply.status(204);
  });
};