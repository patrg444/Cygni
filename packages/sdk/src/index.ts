import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { z } from "zod";

// Response schemas for type safety
export const DeploymentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  buildId: z.string(),
  environmentId: z.string(),
  status: z.enum(["pending", "deploying", "active", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DeploymentListSchema = z.object({
  deployments: z.array(DeploymentSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  framework: z.string().optional(),
  repository: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProjectListSchema = z.object({
  projects: z.array(ProjectSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

export const BuildSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  commitSha: z.string(),
  branch: z.string(),
  status: z.enum(["pending", "running", "success", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const EnvironmentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  slug: z.string(),
  variables: z.record(z.string()).optional(),
});

export const SecretSchema = z.object({
  id: z.string(),
  key: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

// Types
export type Deployment = z.infer<typeof DeploymentSchema>;
export type DeploymentList = z.infer<typeof DeploymentListSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectList = z.infer<typeof ProjectListSchema>;
export type Build = z.infer<typeof BuildSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;

// SDK Options
export interface CygniOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryCondition?: (error: AxiosError) => boolean;
}

export class CygniClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(options: CygniOptions) {
    const {
      apiKey,
      baseUrl = "https://api.cygni.dev",
      timeout = 30000,
      maxRetries = 3,
      retryDelay = 1000,
    } = options;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "cygni-sdk/1.0.0",
      },
    });

    this.retryConfig = {
      maxRetries,
      retryDelay,
      retryCondition: (error) => {
        // Retry on 5xx errors and rate limiting
        return (
          !error.response ||
          error.response.status >= 500 ||
          error.response.status === 429
        );
      },
    };

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (this.shouldRetry(error)) {
          return this.retryRequest(error);
        }
        throw this.formatError(error);
      },
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    const config = error.config as AxiosRequestConfig & { retryCount?: number };
    const retryCount = config.retryCount || 0;

    return (
      retryCount < this.retryConfig.maxRetries &&
      this.retryConfig.retryCondition!(error)
    );
  }

  private async retryRequest(error: AxiosError): Promise<any> {
    const config = error.config as AxiosRequestConfig & { retryCount?: number };
    config.retryCount = (config.retryCount || 0) + 1;

    const delay =
      this.retryConfig.retryDelay * Math.pow(2, config.retryCount - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return this.client.request(config);
  }

  private formatError(error: AxiosError): Error {
    if (error.response?.data) {
      const parsed = ErrorSchema.safeParse(error.response.data);
      if (parsed.success) {
        const err = new Error(parsed.data.message);
        err.name = parsed.data.error;
        return err;
      }
    }
    return new Error(error.message || "Request failed");
  }

  // API Methods

  async deploy(
    projectId: string,
    options?: {
      branch?: string;
      environment?: string;
      buildId?: string;
    },
  ): Promise<Deployment> {
    const response = await this.client.post("/deployments", {
      projectId,
      ...options,
    });

    return DeploymentSchema.parse(response.data);
  }

  async getDeployment(deploymentId: string): Promise<Deployment> {
    const response = await this.client.get(`/deployments/${deploymentId}`);
    return DeploymentSchema.parse(response.data);
  }

  async getDeployments(
    projectId: string,
    options?: {
      environment?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<DeploymentList> {
    const response = await this.client.get(
      `/projects/${projectId}/deployments`,
      {
        params: options,
      },
    );

    return DeploymentListSchema.parse(response.data);
  }

  async rollback(deploymentId: string): Promise<Deployment> {
    const response = await this.client.post(
      `/deployments/${deploymentId}/rollback`,
    );
    return DeploymentSchema.parse(response.data);
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.client.get(`/projects/${projectId}`);
    return ProjectSchema.parse(response.data);
  }

  async getLogs(
    deploymentId: string,
    options?: {
      lines?: number;
      since?: string;
      follow?: boolean;
    },
  ): Promise<{ logs: Array<{ timestamp: string; message: string }> }> {
    const response = await this.client.get(
      `/deployments/${deploymentId}/logs`,
      {
        params: options,
      },
    );

    return response.data;
  }

  // Project methods
  async listProjects(
    organizationId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<ProjectList> {
    const response = await this.client.get(
      `/organizations/${organizationId}/projects`,
      {
        params: options,
      },
    );

    return ProjectListSchema.parse(response.data);
  }

  async createProject(
    organizationId: string,
    data: {
      name: string;
      framework?: string;
      repository?: string;
      description?: string;
    },
  ): Promise<Project> {
    const response = await this.client.post(
      `/organizations/${organizationId}/projects`,
      data,
    );
    return ProjectSchema.parse(response.data);
  }

  async updateProject(
    projectId: string,
    data: {
      name?: string;
      framework?: string;
      repository?: string;
      description?: string;
    },
  ): Promise<Project> {
    const response = await this.client.patch(`/projects/${projectId}`, data);
    return ProjectSchema.parse(response.data);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}`);
  }

  // Environment methods
  async getEnvironments(projectId: string): Promise<Environment[]> {
    const response = await this.client.get(
      `/projects/${projectId}/environments`,
    );
    return z.array(EnvironmentSchema).parse(response.data);
  }

  async updateEnvironment(
    environmentId: string,
    variables: Record<string, string>,
  ): Promise<Environment> {
    const response = await this.client.patch(`/environments/${environmentId}`, {
      variables,
    });
    return EnvironmentSchema.parse(response.data);
  }

  // Secret methods
  async listSecrets(
    projectId: string,
    environmentId: string,
  ): Promise<Secret[]> {
    const response = await this.client.get(
      `/projects/${projectId}/environments/${environmentId}/secrets`,
    );
    return z.array(SecretSchema).parse(response.data);
  }

  async setSecret(
    projectId: string,
    environmentId: string,
    key: string,
    value: string,
  ): Promise<Secret> {
    const response = await this.client.put(
      `/projects/${projectId}/environments/${environmentId}/secrets/${key}`,
      { value },
    );
    return SecretSchema.parse(response.data);
  }

  async deleteSecret(
    projectId: string,
    environmentId: string,
    key: string,
  ): Promise<void> {
    await this.client.delete(
      `/projects/${projectId}/environments/${environmentId}/secrets/${key}`,
    );
  }

  // Build methods
  async getBuild(buildId: string): Promise<Build> {
    const response = await this.client.get(`/builds/${buildId}`);
    return BuildSchema.parse(response.data);
  }

  async cancelBuild(buildId: string): Promise<Build> {
    const response = await this.client.post(`/builds/${buildId}/cancel`);
    return BuildSchema.parse(response.data);
  }

  // Streaming logs (for follow mode)
  streamLogs(deploymentId: string, onLog: (log: string) => void): () => void {
    const auth = this.client.defaults.headers["Authorization"];
    const token = typeof auth === "string" ? auth.replace("Bearer ", "") : "";
    const eventSource = new EventSource(
      `${this.client.defaults.baseURL}/deployments/${deploymentId}/logs/stream?token=${token}`,
    );

    eventSource.onmessage = (event) => {
      onLog(event.data);
    };

    eventSource.onerror = (error) => {
      console.error("Log stream error:", error);
      eventSource.close();
    };

    // Return cleanup function
    return () => eventSource.close();
  }
}

export default CygniClient;
