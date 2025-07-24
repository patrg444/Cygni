import axios, { AxiosInstance } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const API_VERSION = process.env.NEXT_PUBLIC_API_VERSION || "v2";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/${API_VERSION}`,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle auth errors
    this.client.interceptors.response.use(
      (response) => {
        // Check for deprecation warnings
        const deprecated = response.headers["x-api-deprecated"];
        if (deprecated) {
          console.warn(
            `API Deprecation Warning: ${response.config.url} is deprecated.`,
            {
              deprecationDate: response.headers["x-api-deprecation-date"],
              endOfLife: response.headers["x-api-end-of-life"],
              recommendedVersion: response.headers["x-api-recommended-version"],
            }
          );
        }
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          // Redirect to login
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints (no version prefix)
  async login(email: string, password: string) {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password,
    });
    return response.data;
  }

  async register(data: any) {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, data);
    return response.data;
  }

  // User endpoints
  async getCurrentUser() {
    const response = await this.client.get("/users/me");
    return response.data;
  }

  async updateCurrentUser(data: any) {
    const response = await this.client.put("/users/me", data);
    return response.data;
  }

  async listUsers(params?: { page?: number; limit?: number; search?: string }) {
    const response = await this.client.get("/users", { params });
    return response.data;
  }

  // Project endpoints
  async listProjects(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const response = await this.client.get("/projects", { params });
    return response.data;
  }

  async getProject(projectId: string) {
    const response = await this.client.get(`/projects/${projectId}`);
    return response.data;
  }

  async createProject(data: {
    name: string;
    description?: string;
    framework?: string;
    repository?: string;
    environmentVariables?: Record<string, string>;
    buildCommand?: string;
    outputDirectory?: string;
  }) {
    const response = await this.client.post("/projects", data);
    return response.data;
  }

  async updateProject(projectId: string, data: any) {
    const response = await this.client.patch(`/projects/${projectId}`, data);
    return response.data;
  }

  async deleteProject(projectId: string) {
    const response = await this.client.delete(`/projects/${projectId}`);
    return response.data;
  }

  // Deployment endpoints
  async listDeployments(params?: {
    page?: number;
    limit?: number;
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const response = await this.client.get("/deployments", { params });
    return response.data;
  }

  async getDeployment(deploymentId: string) {
    const response = await this.client.get(`/deployments/${deploymentId}`);
    return response.data;
  }

  async createDeployment(data: {
    projectId: string;
    environment?: string;
    branch?: string;
    commitSha?: string;
  }) {
    const response = await this.client.post("/deployments", data);
    return response.data;
  }

  async cancelDeployment(deploymentId: string) {
    const response = await this.client.post(`/deployments/${deploymentId}/cancel`);
    return response.data;
  }

  async rollbackDeployment(deploymentId: string) {
    const response = await this.client.post(`/deployments/${deploymentId}/rollback`);
    return response.data;
  }

  async streamDeploymentLogs(deploymentId: string, onMessage: (log: any) => void) {
    const eventSource = new EventSource(
      `${API_BASE_URL}/${API_VERSION}/deployments/${deploymentId}/logs?follow=true`,
      {
        // @ts-ignore - EventSource doesn't have headers in the type definition
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    eventSource.onmessage = (event) => {
      const log = JSON.parse(event.data);
      onMessage(log);
    };

    return eventSource;
  }

  // Onboarding endpoints
  async getOnboardingStatus() {
    const response = await this.client.get("/onboarding/status");
    return response.data;
  }

  async completeOnboardingStep(stepId: string, metadata?: any) {
    const response = await this.client.post("/onboarding/complete-step", {
      stepId,
      metadata,
    });
    return response.data;
  }

  async getOnboardingChecklist() {
    const response = await this.client.get("/onboarding/checklist");
    return response.data;
  }

  async submitOnboardingFeedback(data: {
    rating: number;
    feedback?: string;
    completedSteps: string[];
    timeSpent: number;
  }) {
    const response = await this.client.post("/onboarding/feedback", data);
    return response.data;
  }

  // Metrics endpoints
  async getMetrics(projectId?: string) {
    const response = await this.client.get("/metrics", {
      params: { projectId },
    });
    return response.data;
  }

  // Billing endpoints
  async getBillingInfo() {
    const response = await this.client.get("/billing");
    return response.data;
  }

  async createCheckoutSession(priceId: string) {
    const response = await this.client.post("/billing/create-checkout-session", {
      priceId,
    });
    return response.data;
  }

  // Version info
  async getApiVersions() {
    const response = await axios.get(`${API_BASE_URL}/versions`);
    return response.data;
  }

  async getCurrentApiVersion() {
    const response = await axios.get(`${API_BASE_URL}/version`);
    return response.data;
  }
}

export const apiClient = new ApiClient();