import { FastifyRequest, FastifyReply } from 'fastify';
import { Role, JWTPayload, AuthContext } from '../types/auth';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    const payload = await request.server.jwt.verify<JWTPayload>(token);
    
    // Load user and organizations from database
    const user = await getUserById(payload.sub);
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    const organizations = await getUserOrganizations(user.id);
    
    request.auth = {
      user,
      organizations,
    };
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const { organizationId, projectId } = request.params as any;

    if (organizationId) {
      const orgRole = request.auth.organizations.find(
        org => org.organization.id === organizationId
      )?.role;

      if (!orgRole || !allowedRoles.includes(orgRole)) {
        return reply.status(403).send({ error: 'Insufficient permissions' });
      }

      request.auth.currentOrganization = request.auth.organizations.find(
        org => org.organization.id === organizationId
      )?.organization;
    }

    if (projectId) {
      const project = await getProjectById(projectId);
      if (!project || project.organizationId !== organizationId) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const projectRole = await getProjectRole(request.auth.user.id, projectId);
      
      // Inherit organization role if no specific project role
      const effectiveRole = projectRole || request.auth.organizations.find(
        org => org.organization.id === project.organizationId
      )?.role;

      if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
        return reply.status(403).send({ error: 'Insufficient permissions' });
      }

      request.auth.currentProject = project;
    }
  };
}

// Role hierarchy helpers
export function canManageProject(role: Role): boolean {
  return [Role.OWNER, Role.ADMIN, Role.DEVELOPER].includes(role);
}

export function canManageEnvironment(role: Role): boolean {
  return [Role.OWNER, Role.ADMIN].includes(role);
}

export function canViewLogs(role: Role): boolean {
  return Object.values(Role).includes(role); // All roles can view logs
}

export function canManageSecrets(role: Role): boolean {
  return [Role.OWNER, Role.ADMIN].includes(role);
}

export function canTriggerDeployment(role: Role): boolean {
  return [Role.OWNER, Role.ADMIN, Role.DEVELOPER].includes(role);
}

// Placeholder functions - implement with Prisma
async function getUserById(id: string) {
  // TODO: Implement with Prisma
  return null;
}

async function getUserOrganizations(userId: string) {
  // TODO: Implement with Prisma
  return [];
}

async function getProjectById(id: string) {
  // TODO: Implement with Prisma
  return null;
}

async function getProjectRole(userId: string, projectId: string) {
  // TODO: Implement with Prisma
  return null;
}