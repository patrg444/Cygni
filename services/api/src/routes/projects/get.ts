import { FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

export const getProjectRoute: FastifyPluginAsync = async (app) => {
  // Get project details
  app.get('/projects/:projectId', {
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
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await projectService.getProject(projectId);

    if (!project) {
      return reply.status(404).send({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      });
    }

    return project;
  });
};