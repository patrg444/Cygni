export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer'
}

export interface OrganizationMember {
  userId: string;
  organizationId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMember {
  userId: string;
  projectId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  sub: string; // user id
  email: string;
  organizations: Array<{
    id: string;
    role: Role;
  }>;
  iat?: number;
  exp?: number;
}

export interface AuthContext {
  user: User;
  organizations: Array<{
    organization: Organization;
    role: Role;
  }>;
  currentOrganization?: Organization;
  currentProject?: Project;
  currentEnvironment?: Environment;
}