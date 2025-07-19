import { FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

export const deleteProjectRoute: FastifyPluginAsync = async (app) => {
  // Delete project
  app.delete('/projects/:projectId', {
    preHandler: [app.authenticate, requireRole([Role.OWNER])],
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

    // Check if project has active deployments
    const hasActiveDeployments = await projectService.hasActiveDeployments(projectId);
    
    if (hasActiveDeployments) {
      return reply.status(400).send({ 
        error: 'Cannot delete project with active deployments',
        code: 'PROJECT_HAS_ACTIVE_DEPLOYMENTS' 
      });
    }

    const deleted = await projectService.deleteProject(projectId);

    if (!deleted) {
      return reply.status(404).send({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      });
    }

    reply.status(204);
  });
};