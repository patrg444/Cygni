import { FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { Role } from '../../types/auth';
import { projectService } from '../../services/project.service';

export const listProjectsRoute: FastifyPluginAsync = async (app) => {
  // List projects in organization
  app.get('/organizations/:organizationId/projects', {
    preHandler: [app.authenticate, requireRole([Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER])],
    schema: {
      params: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' }
        },
        required: ['organizationId']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          orderBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'name'], default: 'createdAt' },
          order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      }
    }
  }, async (request, _reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const { limit, offset, orderBy, order } = request.query as {
      limit: number;
      offset: number;
      orderBy: 'createdAt' | 'updatedAt' | 'name';
      order: 'asc' | 'desc';
    };

    const projects = await projectService.listProjects({
      organizationId,
      limit,
      offset,
      orderBy,
      order
    });

    return projects;
  });
};