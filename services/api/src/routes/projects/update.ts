import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  framework: z.string().optional(),
  repository: z.string().url().optional(),
  description: z.string().max(500).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const updateProjectRoute: FastifyPluginAsync = async (app) => {
  // Update project
  app.patch('/projects/:projectId', {
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
          name: { type: 'string', minLength: 1, maxLength: 100 },
          framework: { type: 'string' },
          repository: { type: 'string', format: 'uri' },
          description: { type: 'string', maxLength: 500 }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = updateProjectSchema.parse(request.body);

    const project = await projectService.updateProject(projectId, body);

    if (!project) {
      return reply.status(404).send({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      });
    }

    return project;
  });
};