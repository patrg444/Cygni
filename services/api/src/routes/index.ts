import { FastifyInstance } from 'fastify';
import { projectRoutes } from './projects';
import { deploymentRoutes } from './deployments';
import { authRoutes } from './auth';
// import { userRoutes } from './users';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/api/auth' });
  // await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(deploymentRoutes, { prefix: '/api/deployments' });
}