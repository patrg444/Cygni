import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  framework: z.string().optional(),
  repository: z.string().url().optional(),
  description: z.string().max(500).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createProjectRoute: FastifyPluginAsync = async (app) => {
  // Create project
  app.post('/organizations/:organizationId/projects', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN])],
    schema: {
      params: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' }
        },
        required: ['organizationId']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          framework: { type: 'string' },
          repository: { type: 'string', format: 'uri' },
          description: { type: 'string', maxLength: 500 }
        },
        required: ['name']
      }
    }
  }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const body = createProjectSchema.parse(request.body);

    const project = await projectService.createProject({
      organizationId,
      ...body,
      createdBy: request.auth!.user.id
    });

    reply.status(201);
    return project;
  });
};