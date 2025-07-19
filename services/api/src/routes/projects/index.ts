import { FastifyPluginAsync } from 'fastify';
import { listProjectsRoute } from './list';
import { createProjectRoute } from './create';
import { getProjectRoute } from './get';
import { updateProjectRoute } from './update';
import { deleteProjectRoute } from './delete';
import { projectMembersRoutes } from './members';

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // Register all project routes
  await app.register(listProjectsRoute);
  await app.register(createProjectRoute);
  await app.register(getProjectRoute);
  await app.register(updateProjectRoute);
  await app.register(deleteProjectRoute);
  await app.register(projectMembersRoutes);
};