import { FastifyRequest, FastifyReply } from 'fastify';
import { Role, JWTPayload, AuthContext } from '../types/auth';
import { prisma } from '../utils/prisma';

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

// Role permission matrix - single source of truth
const ROLE_PERMISSIONS = {
  manageOrganization: [Role.owner],
  manageProject: [Role.owner, Role.admin, Role.developer],
  manageEnvironment: [Role.owner, Role.admin],
  manageSecrets: [Role.owner, Role.admin],
  manageBilling: [Role.owner],
  triggerDeployment: [Role.owner, Role.admin, Role.developer],
  viewDeployments: [Role.owner, Role.admin, Role.developer, Role.viewer],
  viewLogs: [Role.owner, Role.admin, Role.developer, Role.viewer],
  viewMetrics: [Role.owner, Role.admin, Role.developer, Role.viewer],
} as const;

// Generate permission check functions
export const canManageOrganization = (role: Role) => ROLE_PERMISSIONS.manageOrganization.includes(role as any);
export const canManageProject = (role: Role) => ROLE_PERMISSIONS.manageProject.includes(role as any);
export const canManageEnvironment = (role: Role) => ROLE_PERMISSIONS.manageEnvironment.includes(role as any);
export const canManageSecrets = (role: Role) => ROLE_PERMISSIONS.manageSecrets.includes(role as any);
export const canManageBilling = (role: Role) => ROLE_PERMISSIONS.manageBilling.includes(role as any);
export const canTriggerDeployment = (role: Role) => ROLE_PERMISSIONS.triggerDeployment.includes(role as any);
export const canViewDeployments = (role: Role) => ROLE_PERMISSIONS.viewDeployments.includes(role as any);
export const canViewLogs = (role: Role) => ROLE_PERMISSIONS.viewLogs.includes(role as any);
export const canViewMetrics = (role: Role) => ROLE_PERMISSIONS.viewMetrics.includes(role as any);

// Prisma database queries
async function getUserById(id: string) {
  return await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function getUserOrganizations(userId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return members.map((member: any) => ({
    organization: member.organization,
    role: member.role as unknown as Role,
  }));
}

async function getProjectById(id: string) {
  return await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function getProjectRole(userId: string, projectId: string): Promise<Role | null> {
  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
    select: { role: true },
  });
  
  return member?.role as Role | null;
}