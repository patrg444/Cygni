export enum BuildStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Build {
  id: string;
  projectId: string;
  commitSha: string;
  branch: string;
  status: BuildStatus;
  logs?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildRequest {
  projectId: string;
  repoUrl: string;
  commitSha: string;
  branch?: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, string>;
  cacheKey?: string;
}