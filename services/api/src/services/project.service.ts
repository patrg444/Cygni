import { nanoid } from 'nanoid';
import { prisma } from '../utils/prisma';
import { Role } from '../types/auth';

interface ListProjectsOptions {
  organizationId: string;
  limit: number;
  offset: number;
  orderBy: 'createdAt' | 'updatedAt' | 'name';
  order: 'asc' | 'desc';
}

interface CreateProjectInput {
  organizationId: string;
  name: string;
  framework?: string;
  repository?: string;
  description?: string;
  createdBy: string;
}

interface UpdateProjectInput {
  name?: string;
  framework?: string;
  repository?: string;
  description?: string;
}

interface AddProjectMemberInput {
  projectId: string;
  email: string;
  role: Role;
  addedBy: string;
}

class ProjectService {
  async listProjects(options: ListProjectsOptions) {
    const { organizationId, limit, offset, orderBy, order } = options;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { organizationId },
        include: {
          environments: true,
          _count: {
            select: { 
              deployments: true,
              builds: true,
              members: true
            }
          }
        },
        orderBy: { [orderBy]: order },
        take: limit,
        skip: offset,
      }),
      prisma.project.count({
        where: { organizationId }
      })
    ]);

    return {
      projects,
      total,
      limit,
      offset,
      hasMore: offset + projects.length < total
    };
  }

  async createProject(input: CreateProjectInput) {
    const slug = this.generateSlug(input.name);

    const project = await prisma.project.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        slug,
        framework: input.framework,
        repository: input.repository,
        description: input.description,
        environments: {
          create: [
            { name: 'Production', slug: 'production' },
            { name: 'Preview', slug: 'preview' },
          ]
        },
        members: {
          create: {
            userId: input.createdBy,
            role: Role.owner
          }
        }
      },
      include: {
        environments: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              }
            }
          }
        }
      }
    });

    return project;
  }

  async getProject(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      include: {
        environments: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              }
            }
          }
        },
        _count: {
          select: { 
            deployments: true,
            builds: true,
          }
        }
      }
    });
  }

  async updateProject(projectId: string, input: UpdateProjectInput) {
    return prisma.project.update({
      where: { id: projectId },
      data: input,
      include: {
        environments: true,
        _count: {
          select: { 
            deployments: true,
            builds: true,
          }
        }
      }
    });
  }

  async deleteProject(projectId: string) {
    try {
      await prisma.project.delete({
        where: { id: projectId }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async hasActiveDeployments(projectId: string) {
    const count = await prisma.deployment.count({
      where: {
        projectId,
        status: {
          in: ['pending', 'deploying', 'active']
        }
      }
    });

    return count > 0;
  }

  async listProjectMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async addProjectMember(input: AddProjectMemberInput) {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: input.email }
    });

    if (!user) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' });
    }

    // Check if already member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: input.projectId,
        }
      }
    });

    if (existingMember) {
      throw Object.assign(new Error('User is already a member'), { code: 'ALREADY_MEMBER' });
    }

    return prisma.projectMember.create({
      data: {
        userId: user.id,
        projectId: input.projectId,
        role: input.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          }
        }
      }
    });
  }

  async updateMemberRole(projectId: string, userId: string, role: Role) {
    return prisma.projectMember.update({
      where: {
        userId_projectId: {
          userId,
          projectId,
        }
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          }
        }
      }
    }).catch(() => null);
  }

  async removeProjectMember(projectId: string, userId: string) {
    try {
      await prisma.projectMember.delete({
        where: {
          userId_projectId: {
            userId,
            projectId,
          }
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  async isLastOwner(projectId: string, userId: string) {
    const owners = await prisma.projectMember.count({
      where: {
        projectId,
        role: Role.owner,
      }
    });

    if (owners > 1) {
      return false;
    }

    const userRole = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        }
      },
      select: { role: true }
    });

    return userRole?.role === Role.owner;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `${base}-${nanoid(6)}`;
  }
}

export const projectService = new ProjectService();