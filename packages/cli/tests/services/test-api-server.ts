import express from "express";
import { Server } from "http";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { SecretsManager } from "../../src/lib/secrets-manager";

interface User {
  id: string;
  email: string;
  password: string; // In real app, this would be hashed
  token?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
}

interface Environment {
  id: string;
  name: string;
  slug: string;
}

interface Secret {
  name: string;
  value: string;
  createdAt: string;
}

interface Deployment {
  id: string;
  projectId: string;
  environment: string;
  version: string;
  commitSha: string;
  status: string;
  url: string;
  createdAt: string;
  completedAt?: string;
  healthStatus?: string;
  strategy: string;
  build?: {
    imageUrl: string;
  };
}

interface CloudExpressDeployment {
  id: string;
  services: Array<{
    name: string;
    type: "frontend" | "backend" | "fullstack";
    status:
      | "pending"
      | "uploading"
      | "building"
      | "deploying"
      | "completed"
      | "failed";
    url?: string;
    error?: string;
  }>;
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  environment: string;
  provider: string;
  namespace?: string;
}

interface NamespaceData {
  name: string;
  type: "preview" | "staging" | "custom";
  createdAt: string;
  expiresAt?: string;
  metadata?: {
    prNumber?: number;
    branch?: string;
    commitSha?: string;
  };
  resources: {
    deployments: string[];
    databases: string[];
    urls: string[];
  };
}

export class TestApiServer {
  private app: express.Application;
  private server?: Server;
  private users: Map<string, User> = new Map();
  private tokens: Map<string, User> = new Map();
  private organizations: Map<string, Organization[]> = new Map();
  private projects: Map<string, Project> = new Map();
  private projectsByOrg: Map<string, string[]> = new Map();
  private environments: Map<string, Environment[]> = new Map();
  private secrets: Map<string, Map<string, Secret>> = new Map();
  private deployments: Map<string, Deployment[]> = new Map();
  private deploymentLogs: Map<string, any[]> = new Map();
  private userOrganizations: Map<string, Organization[]> = new Map();
  private cloudExpressDeployments: Map<string, CloudExpressDeployment> =
    new Map();

  // Namespace support for preview environments
  private namespaces: Map<string, NamespaceData> = new Map();
  private namespacedDeployments: Map<string, Map<string, Deployment>> =
    new Map();
  private namespacedDatabases: Map<string, any> = new Map();
  private secretsManager?: SecretsManager;
  
  // Chaos engineering support
  private chaosMode: boolean = false;
  private chaosFailureRate: number = 0.3; // 30% failure rate by default

  constructor(useLocalStack: boolean = false) {
    this.app = express();
    this.app.use(bodyParser.json());

    // Initialize SecretsManager if using LocalStack
    if (useLocalStack) {
      this.secretsManager = new SecretsManager({
        backend: "aws",
        awsConfig: {
          endpoint: process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566",
          region: "us-east-1",
          credentials: {
            accessKeyId: "test",
            secretAccessKey: "test",
          },
        },
        projectId: "proj_test", // Default project ID for testing
      });
    }

    this.setupRoutes();
    this.seedData();
  }

  private seedData() {
    // Add test users
    this.users.set("test@example.com", {
      id: "user-123",
      email: "test@example.com",
      password: "password123",
    });

    // Add organizations for test user
    this.organizations.set("user-123", [
      {
        id: "org-123",
        name: "Test Org",
        slug: "test-org",
        role: "owner",
      },
      {
        id: "org-456",
        name: "Another Org",
        slug: "another-org",
        role: "member",
      },
    ]);

    // Add test project
    this.projects.set("proj_123", {
      id: "proj_123",
      name: "test-project",
      slug: "test-project",
      organizationId: "org-123",
    });

    // Add project to org mapping
    this.projectsByOrg.set("org-123", ["proj_123"]);

    // Add environments for test project
    this.environments.set("proj_123", [
      {
        id: "env-1",
        name: "Production",
        slug: "production",
      },
      {
        id: "env-2",
        name: "Staging",
        slug: "staging",
      },
    ]);

    // Add some sample secrets
    this.secrets.set(
      "proj_123:env-1",
      new Map([
        [
          "DATABASE_URL",
          {
            name: "DATABASE_URL",
            value: "postgres://localhost:5432/prod",
            createdAt: new Date().toISOString(),
          },
        ],
        [
          "API_KEY",
          {
            name: "API_KEY",
            value: "sk-prod-key",
            createdAt: new Date().toISOString(),
          },
        ],
      ]),
    );
  }

  private setupRoutes() {
    // Apply chaos middleware to all routes
    this.app.use(this.chaosMiddleware());
    
    // Login endpoint
    this.app.post("/auth/login", (req, res) => {
      const { email, password } = req.body;
      const user = this.users.get(email);

      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Generate token
      const token = `test-token-${Date.now()}-${Math.random()}`;
      user.token = token;
      this.tokens.set(token, user);

      const orgs = this.organizations.get(user.id) || [];

      return res.json({
        token,
        user: { id: user.id, email: user.email },
        organizations: orgs,
      });
    });

    // Get current user endpoint
    this.app.get("/auth/me", (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = authHeader.substring(7);

      // First try JWT validation
      const JWT_SECRET = "test-secret-key";
      try {
        // Verify JWT
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // Check if token is expired (jwt.verify should handle this, but double-check)
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        // Check for required scope if header is present
        const requiredScope = req.headers["x-required-scope"] as string;
        if (requiredScope) {
          const tokenScopes = decoded.scope ? decoded.scope.split(" ") : [];
          if (!tokenScopes.includes(requiredScope)) {
            return res.status(403).json({ error: "Insufficient permissions" });
          }
        }

        // Get user organizations
        const userId = decoded.sub || decoded.userId;
        const userOrgs = this.userOrganizations.get(userId) || [
          { id: "org_123", name: "Test Org", slug: "test-org", role: "owner" },
        ];

        return res.json({
          id: userId,
          email: decoded.email || "test@example.com",
          organizations: userOrgs,
        });
      } catch (jwtError) {
        // Fall back to token-based auth for backward compatibility
        const user = this.tokens.get(token);
        if (!user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const orgs = this.organizations.get(user.id) || [];
        return res.json({
          token,
          user: { id: user.id, email: user.email },
          organizations: orgs,
        });
      }
    });

    // Projects endpoints
    this.app.get("/projects/:projectId", (req, res) => {
      const { projectId } = req.params;
      const project = this.projects.get(projectId);

      if (project) {
        return res.json(project);
      } else {
        return res.status(404).json({ error: "Project not found" });
      }
    });

    this.app.get("/projects/by-slug/:slug", (req, res) => {
      const { slug } = req.params;
      let foundProject: Project | null = null;

      this.projects.forEach((project) => {
        if (project.slug === slug) {
          foundProject = project;
        }
      });

      if (foundProject) {
        return res.json(foundProject);
      } else {
        return res.status(404).json({ error: "Project not found" });
      }
    });

    // Projects by slug
    this.app.get("/projects/by-slug/:slug", (req, res) => {
      const { slug } = req.params;
      const token = req.headers.authorization?.replace("Bearer ", "");
      const user = this.findUserByToken(token || "");

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Find project by slug
      let foundProject: Project | null = null;
      this.projects.forEach((project) => {
        if (project.slug === slug) {
          foundProject = project;
        }
      });

      if (!foundProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      return res.json(foundProject);
    });

    // Environments endpoints
    this.app.get("/projects/:projectId/environments", (req, res) => {
      const { projectId } = req.params;
      const envs = this.environments.get(projectId) || [];
      return res.json(envs);
    });

    // Secrets endpoints
    this.app.get(
      "/projects/:projectId/environments/:environmentId/secrets",
      (req, res) => {
        const { projectId, environmentId } = req.params;
        const key = `${projectId}:${environmentId}`;
        const secrets = this.secrets.get(key) || new Map();

        const result: any[] = [];
        secrets.forEach((secret, name) => {
          result.push({
            name,
            value: secret.value,
            createdAt: secret.createdAt,
          });
        });

        return res.json(result);
      },
    );

    // Handle the format the CLI actually uses
    this.app.post("/projects/:projectId/secrets", async (req, res) => {
      const { projectId } = req.params;
      const { key, value, environmentId } = req.body;

      // Validate secret key format
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        return res.status(400).json({ error: "Invalid secret key format" });
      }

      // If no environmentId, set for all environments
      if (!environmentId) {
        const envs = this.environments.get(projectId) || [];
        for (const env of envs) {
          await this.addSecret(projectId, env.id, key, value);
        }
        return res.json({
          success: true,
          message: `Secret '${key}' set successfully`,
          key,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Check if environment exists
        const envs = this.environments.get(projectId) || [];
        const envExists = envs.some(
          (e) => e.id === environmentId || e.slug === environmentId,
        );
        if (!envExists) {
          return res
            .status(404)
            .json({ error: `Environment '${environmentId}' not found` });
        }

        // Find env by id or slug
        const env = envs.find(
          (e) => e.id === environmentId || e.slug === environmentId,
        );
        if (env) {
          const existingSecrets =
            this.secrets.get(`${projectId}:${env.id}`) || new Map();
          const isUpdate = existingSecrets.has(key);

          await this.addSecret(projectId, env.id, key, value);

          return res.json({
            success: true,
            message: isUpdate
              ? `Secret '${key}' updated successfully`
              : `Secret '${key}' set successfully`,
            key,
            createdAt: new Date().toISOString(),
          });
        }
        // This should never happen, but TypeScript needs it
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    this.app.post(
      "/projects/:projectId/environments/:environmentId/secrets",
      async (req, res) => {
        const { projectId, environmentId } = req.params;
        const { name, value } = req.body;

        // Validate secret name format
        if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
          return res
            .status(400)
            .json({
              error:
                "Invalid secret name format. Must start with letter or underscore and contain only uppercase letters, numbers, and underscores.",
            });
        }

        // Check if environment exists
        const envs = this.environments.get(projectId) || [];
        const envExists = envs.some((e) => e.id === environmentId);
        if (!envExists) {
          const env = envs.find((e) => e.slug === environmentId);
          if (env) {
            // Allow using slug as environmentId
            return this.app._router.handle(
              Object.assign(req, {
                params: { ...req.params, environmentId: env.id },
              }),
              res,
              () => {},
            );
          }
          return res
            .status(404)
            .json({ error: `Environment '${environmentId}' not found` });
        }

        const existingSecrets =
          this.secrets.get(`${projectId}:${environmentId}`) || new Map();
        const isUpdate = existingSecrets.has(name);

        await this.addSecret(projectId, environmentId, name, value);

        return res.json({
          success: true,
          message: isUpdate
            ? `Secret '${name}' updated successfully`
            : `Secret '${name}' set successfully`,
          name,
          createdAt: new Date().toISOString(),
        });
      },
    );

    // Handle the format the CLI actually uses - delete by secret ID
    this.app.delete("/projects/:projectId/secrets/:secretId", (req, res) => {
      const { projectId, secretId } = req.params;

      // In real implementation, secretId would be unique
      // For testing, we'll treat it as the secret name
      let found = false;

      this.environments.get(projectId)?.forEach((env) => {
        const key = `${projectId}:${env.id}`;
        const secrets = this.secrets.get(key);
        if (secrets && secrets.has(secretId)) {
          secrets.delete(secretId);
          found = true;
        }
      });

      if (found) {
        return res.json({ success: true });
      } else {
        return res.status(404).json({ error: `Secret not found` });
      }
    });

    this.app.delete(
      "/projects/:projectId/environments/:environmentId/secrets/:secretName",
      (req, res) => {
        const { projectId, environmentId, secretName } = req.params;
        const key = `${projectId}:${environmentId}`;
        const secrets = this.secrets.get(key);

        if (!secrets || !secrets.has(secretName)) {
          return res
            .status(404)
            .json({ error: `Secret '${secretName}' not found` });
        }

        secrets.delete(secretName);
        return res.json({
          success: true,
          message: `Secret '${secretName}' removed successfully`,
        });
      },
    );

    // Get all secrets for a project (returns flat array format expected by CLI)
    this.app.get("/projects/:projectId/secrets", async (req, res) => {
      const { projectId } = req.params;
      const { environmentId } = req.query;
      const envs = this.environments.get(projectId) || [];
      const result: any[] = [];

      if (this.secretsManager) {
        // Use SecretsManager to list secrets
        this.secretsManager = new SecretsManager({
          ...this.secretsManager["config"],
          projectId,
        });
        const allSecrets = await this.secretsManager.listSecrets();

        for (const secret of allSecrets) {
          // Filter by environment if specified
          if (environmentId && secret.environmentId !== environmentId) {
            const env = envs.find((e) => e.slug === environmentId);
            if (!env || secret.environmentId !== env.id) {
              continue;
            }
          }

          const env = envs.find((e) => e.id === secret.environmentId);
          result.push({
            id: secret.key,
            key: secret.key,
            value: secret.value,
            environmentId: secret.environmentId,
            environment: env?.slug,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        envs.forEach((env) => {
          // Filter by environment if specified
          if (
            environmentId &&
            env.id !== environmentId &&
            env.slug !== environmentId
          ) {
            return;
          }

          const key = `${projectId}:${env.id}`;
          const secrets = this.secrets.get(key) || new Map();

          secrets.forEach((secret, name) => {
            result.push({
              id: name, // Use name as ID for simplicity
              key: name,
              value: secret.value,
              environmentId: env.id,
              environment: env.slug,
              createdAt: secret.createdAt,
            });
          });
        });
      }

      return res.json(result);
    });

    // Bulk secret import endpoint
    this.app.post("/projects/:projectId/secrets/bulk", async (req, res) => {
      const { projectId } = req.params;
      const { secrets, environmentId } = req.body;

      const results: any[] = [];

      for (const [key, value] of Object.entries(secrets)) {
        try {
          if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
            results.push({ key, success: false, error: "Invalid key format" });
          } else {
            if (environmentId) {
              // Handle both ID and slug
              const envs = this.environments.get(projectId) || [];
              const env = envs.find(
                (e) => e.id === environmentId || e.slug === environmentId,
              );
              if (env) {
                await this.addSecret(projectId, env.id, key, value as string);
              }
            } else {
              // Add to all environments
              const envs = this.environments.get(projectId) || [];
              for (const env of envs) {
                await this.addSecret(projectId, env.id, key, value as string);
              }
            }
            results.push({ key, success: true });
          }
        } catch (error: any) {
          results.push({ key, success: false, error: error.message });
        }
      }

      return res.json({ results });
    });

    // Build endpoints
    this.app.post("/builds", (req, res) => {
      try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        const user = this.findUserByToken(token || "");
        if (!user) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const { projectId, commitSha, dockerfilePath } = req.body;
        const build = {
          id: `build_${Date.now()}`,
          projectId,
          commitSha,
          dockerfilePath,
          status: "completed",
          imageUrl: `123456.dkr.ecr.us-east-1.amazonaws.com/${projectId}:${commitSha ? commitSha.substring(0, 8) : "latest"}`,
          createdAt: new Date().toISOString(),
        };

        return res.json(build);
      } catch (error: any) {
        console.error("Build endpoint error:", error);
        return res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/builds/:buildId", (req, res) => {
      const { buildId } = req.params;
      return res.json({
        id: buildId,
        status: "completed",
        imageUrl: `123456.dkr.ecr.us-east-1.amazonaws.com/test:latest`,
      });
    });

    this.app.get("/builds/cache", (_req, res) => {
      return res.json({ cached: false });
    });

    // Legacy deployment creation endpoint
    this.app.post("/projects/:projectId/deployments", (req, res) => {
      const token = req.headers.authorization?.replace("Bearer ", "");
      const user = this.findUserByToken(token || "");
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { projectId } = req.params;
      const { buildId, environment, strategy } = req.body;
      const deployment = {
        id: `deploy_${Date.now()}`,
        projectId,
        buildId,
        environment: environment || "production",
        strategy: strategy || "rolling",
        version: "v1.0.1",
        commitSha: "newsha",
        status: "completed",
        url: `https://${projectId}.cygni.app`,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        healthStatus: "healthy",
        build: {
          imageUrl: `123456.dkr.ecr.us-east-1.amazonaws.com/${projectId}:latest`,
        },
      };

      this.addDeployment(projectId, deployment);
      return res.json(deployment);
    });

    this.app.get("/deployments/:deploymentId", (req, res) => {
      const { deploymentId } = req.params;

      let found: any = null;
      this.deployments.forEach((deployments) => {
        const deployment = deployments.find((d) => d.id === deploymentId);
        if (deployment) {
          found = deployment;
        }
      });

      if (!found) {
        return res.json({
          id: deploymentId,
          status: "completed",
          url: "https://test-project.cygni.app",
          healthStatus: "healthy",
        });
      }

      return res.json(found);
    });

    this.app.get("/deployments/:deploymentId/health", (_req, res) => {
      return res.json({
        healthy: true,
        checks: { http: "passing", memory: "passing" },
      });
    });

    this.app.get("/projects/:projectId/deployments", (req, res) => {
      const { projectId } = req.params;
      const { environment } = req.query;
      const deployments = this.deployments.get(projectId) || [];

      const filtered = environment
        ? deployments.filter((d) => d.environment === environment)
        : deployments;

      return res.json({ deployments: filtered });
    });

    // Deployment endpoints
    this.app.get("/projects/:projectId/deployments/latest", (req, res) => {
      const { projectId } = req.params;
      const { environment, includePrevious } = req.query;
      const deployments = this.deployments.get(projectId) || [];

      // Filter by environment if specified
      const envDeployments = environment
        ? deployments.filter((d) => d.environment === environment)
        : deployments;

      // Sort by date descending
      const sorted = envDeployments.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const response: any = {
        latest: sorted[0] || null,
      };

      if (includePrevious && sorted.length > 1) {
        response.previous = sorted[1];
      }

      return res.json(response);
    });

    this.app.post("/deployments/:deploymentId/rollback", (req, res) => {
      const { deploymentId } = req.params;

      // Find the deployment across all projects
      let targetDeployment: Deployment | null = null;
      let projectId: string | null = null;

      this.deployments.forEach((deployments, pid) => {
        const found = deployments.find((d) => d.id === deploymentId);
        if (found) {
          targetDeployment = found;
          projectId = pid;
        }
      });

      if (!targetDeployment || !projectId) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      // Find previous deployment
      const projectDeployments = this.deployments.get(projectId) || [];
      const sorted = projectDeployments
        .filter((d) => d.environment === targetDeployment!.environment)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      const currentIndex = sorted.findIndex((d) => d.id === deploymentId);
      const previousDeployment = sorted[currentIndex + 1];

      if (!previousDeployment) {
        return res
          .status(400)
          .json({ error: "No previous deployment available" });
      }

      // Create a new deployment as a rollback
      const rollbackDeployment: Deployment = {
        id: `deploy_${Date.now()}`,
        projectId,
        environment: previousDeployment.environment,
        version: previousDeployment.version,
        commitSha: previousDeployment.commitSha,
        status: "in_progress",
        url: previousDeployment.url,
        createdAt: new Date().toISOString(),
        healthStatus: "pending",
        strategy: "rollback",
        build: previousDeployment.build,
      };

      this.addDeployment(projectId, rollbackDeployment);

      // Simulate completion after a short delay
      setTimeout(() => {
        rollbackDeployment.status = "completed";
        rollbackDeployment.completedAt = new Date().toISOString();
        rollbackDeployment.healthStatus = "healthy";
      }, 100);

      return res.json(rollbackDeployment);
    });

    // Logs endpoints
    this.app.get("/deployments/:deploymentId", (req, res) => {
      const { deploymentId } = req.params;

      // Find deployment across all projects
      let foundDeployment: Deployment | null = null;
      this.deployments.forEach((deployments) => {
        const dep = deployments.find((d) => d.id === deploymentId);
        if (dep) foundDeployment = dep;
      });

      if (foundDeployment) {
        return res.json(foundDeployment);
      } else {
        return res.status(404).json({ error: "Deployment not found" });
      }
    });

    this.app.get("/projects/:projectId/deployments", (req, res) => {
      const { projectId } = req.params;
      const { environment, limit } = req.query;

      let deployments = this.deployments.get(projectId) || [];

      // Filter by environment if specified
      if (environment) {
        deployments = deployments.filter((d) => d.environment === environment);
      }

      // Sort by date descending
      deployments.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Apply limit if specified
      if (limit) {
        deployments = deployments.slice(0, parseInt(limit as string));
      }

      return res.json({ deployments });
    });

    this.app.get("/deployments/:deploymentId/logs", (req, res) => {
      const { deploymentId } = req.params;
      const { lines, since } = req.query;

      let logs = this.deploymentLogs.get(deploymentId) || [];

      // Filter by since if specified
      if (since) {
        // Simple implementation - in real app would parse duration
        // For now, just return all logs
      }

      // Apply limit if specified
      if (lines) {
        const lineCount = parseInt(lines as string);
        logs = logs.slice(0, lineCount);
      }

      return res.json({ logs });
    });

    // Health check
    this.app.get("/health", (_req, res) => {
      return res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // CloudExpress Deployment Endpoints
    this.app.post("/deployments", (req, res) => {
      const { cloudexpressConfig, environment, provider, namespace } = req.body;

      if (!cloudexpressConfig) {
        return res
          .status(400)
          .json({ error: "Missing cloudexpress.yaml configuration" });
      }

      const deploymentId = `cx-deploy-${Date.now()}`;
      const deployment: CloudExpressDeployment = {
        id: deploymentId,
        services: cloudexpressConfig.services.map((service: any) => ({
          name: service.name,
          type: service.type,
          status: "pending",
        })),
        status: "pending",
        createdAt: new Date().toISOString(),
        environment: environment || "production",
        provider: provider || "cloudexpress",
        namespace: namespace,
      };

      this.cloudExpressDeployments.set(deploymentId, deployment);

      // Handle namespace-based deployment
      if (namespace) {
        this.handleNamespacedDeployment(deploymentId, deployment, namespace);
      }

      // Simulate deployment progress
      this.simulateDeploymentProgress(deploymentId);

      return res.json({ deploymentId, status: "pending" });
    });

    // Get deployment status
    this.app.get("/deployments/:deploymentId/status", (req, res) => {
      const { deploymentId } = req.params;
      const deployment = this.cloudExpressDeployments.get(deploymentId);

      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      return res.json(deployment);
    });

    // Upload artifacts endpoint
    this.app.post("/deployments/:deploymentId/artifacts", (req, res) => {
      const { deploymentId } = req.params;
      const { serviceName } = req.body;

      const deployment = this.cloudExpressDeployments.get(deploymentId);
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }

      const service = deployment.services.find((s) => s.name === serviceName);
      if (service) {
        service.status = "uploading";
      }

      return res.json({
        success: true,
        message: `Artifacts for ${serviceName} uploaded`,
      });
    });

    // Generic resource endpoints for testing generated UI
    // Posts resource
    const posts: any[] = [
      {
        id: "1",
        title: "First Post",
        content: "Hello World",
        author: "Admin",
        published: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Second Post",
        content: "Another post",
        author: "User",
        published: false,
        createdAt: new Date().toISOString(),
      },
    ];

    // GET /posts - List all posts
    this.app.get("/posts", (_req, res) => {
      return res.json(posts);
    });

    // GET /posts/:id - Get a single post
    this.app.get("/posts/:id", (req, res) => {
      const post = posts.find((p) => p.id === req.params.id);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      return res.json(post);
    });

    // POST /posts - Create a new post
    this.app.post("/posts", (req, res) => {
      const newPost = {
        id: String(posts.length + 1),
        title: req.body.title || req.body.name,
        content: req.body.content || req.body.description,
        author: req.body.author || "Anonymous",
        published: req.body.published || false,
        createdAt: new Date().toISOString(),
      };
      posts.push(newPost);
      return res.status(201).json(newPost);
    });

    // PUT /posts/:id - Update a post
    this.app.put("/posts/:id", (req, res) => {
      const index = posts.findIndex((p) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Post not found" });
      }
      posts[index] = {
        ...posts[index],
        ...req.body,
        id: req.params.id,
        updatedAt: new Date().toISOString(),
      };
      return res.json(posts[index]);
    });

    // DELETE /posts/:id - Delete a post
    this.app.delete("/posts/:id", (req, res) => {
      const index = posts.findIndex((p) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Post not found" });
      }
      posts.splice(index, 1);
      return res.status(204).send();
    });

    // Categories resource (for testing multiple resources)
    const categories: any[] = [
      {
        id: "1",
        name: "Technology",
        description: "Tech posts",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        name: "Lifestyle",
        description: "Lifestyle posts",
        createdAt: new Date().toISOString(),
      },
    ];

    this.app.get("/categories", (_req, res) => {
      return res.json(categories);
    });

    this.app.post("/categories", (req, res) => {
      const newCategory = {
        id: String(categories.length + 1),
        name: req.body.name,
        description: req.body.description || "",
        createdAt: new Date().toISOString(),
      };
      categories.push(newCategory);
      return res.status(201).json(newCategory);
    });

    // Namespace management endpoints
    this.app.get("/namespaces", (_req, res) => {
      const namespaces = Array.from(this.namespaces.values());
      return res.json({ namespaces });
    });

    this.app.get("/namespaces/:namespace", (req, res) => {
      const { namespace } = req.params;
      const data = this.namespaces.get(namespace);

      if (!data) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      return res.json(data);
    });

    this.app.delete("/namespaces/:namespace", (req, res) => {
      const { namespace } = req.params;
      const data = this.namespaces.get(namespace);

      if (!data) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      // Clean up all resources in the namespace
      const deletedResources = this.cleanupNamespace(namespace);

      return res.json({
        message: `Namespace ${namespace} deleted`,
        deletedResources,
      });
    });
  }

  async start(port: number = 0): Promise<number> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        const address = this.server!.address();
        const actualPort = typeof address === "object" ? address!.port : port;
        resolve(actualPort);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // Chaos engineering methods
  enableChaosMode(failureRate: number = 0.3): void {
    this.chaosMode = true;
    this.chaosFailureRate = Math.max(0, Math.min(1, failureRate)); // Clamp between 0 and 1
    console.log(`🌪️  Chaos mode enabled with ${(this.chaosFailureRate * 100).toFixed(0)}% failure rate`);
  }

  disableChaosMode(): void {
    this.chaosMode = false;
    console.log('✨ Chaos mode disabled');
  }

  private shouldFailRequest(): boolean {
    return this.chaosMode && Math.random() < this.chaosFailureRate;
  }

  private chaosMiddleware() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Only apply chaos to specific endpoints
      const chaosEndpoints = ['/deployments', '/posts', '/api/posts', '/api/deployments'];
      const isChaoticEndpoint = chaosEndpoints.some(endpoint => req.path.includes(endpoint));
      
      if (isChaoticEndpoint && this.shouldFailRequest()) {
        console.log(`💥 Chaos: Failing request to ${req.path}`);
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'The service is temporarily unavailable. Please try again later.',
          chaos: true
        });
      }
      
      return next();
    };
  }

  // Test helper methods
  addUser(email: string, password: string): void {
    const id = `user-${Date.now()}`;
    this.users.set(email, { id, email, password });
  }

  addOrganization(userId: string, org: Organization): void {
    const orgs = this.organizations.get(userId) || [];
    orgs.push(org);
    this.organizations.set(userId, orgs);
  }

  clearData(): void {
    this.users.clear();
    this.tokens.clear();
    this.organizations.clear();
    this.projects.clear();
    this.projectsByOrg.clear();
    this.environments.clear();
    this.secrets.clear();
    this.deployments.clear();
    this.deploymentLogs.clear();
    this.userOrganizations.clear();
    this.seedData();
  }

  setUserOrganizations(userId: string, organizations: Organization[]): void {
    this.userOrganizations.set(userId, organizations);
  }

  // Project management
  addProject(organizationId: string, project: Project): void {
    this.projects.set(project.id, { ...project, organizationId });
    const orgProjects = this.projectsByOrg.get(organizationId) || [];
    orgProjects.push(project.id);
    this.projectsByOrg.set(organizationId, orgProjects);
  }

  // Environment management
  addEnvironment(projectId: string, env: Environment): void {
    const envs = this.environments.get(projectId) || [];
    envs.push(env);
    this.environments.set(projectId, envs);
  }

  addEnvironments(projectId: string, envs: Environment[]): void {
    this.environments.set(projectId, envs);
  }

  // Secret management
  async addSecret(
    projectId: string,
    environmentId: string,
    name: string,
    value: string,
  ): Promise<void> {
    if (this.secretsManager) {
      // Update secretsManager to use the current project ID
      this.secretsManager = new SecretsManager({
        ...this.secretsManager["config"],
        projectId,
      });
      await this.secretsManager.setSecret(name, value, environmentId);
    } else {
      const key = `${projectId}:${environmentId}`;
      const secrets = this.secrets.get(key) || new Map();
      secrets.set(name, {
        name,
        value,
        createdAt: new Date().toISOString(),
      });
      this.secrets.set(key, secrets);
    }
  }

  async getSecrets(
    projectId: string,
    environmentId: string,
  ): Promise<Record<string, string>> {
    if (this.secretsManager) {
      // Update secretsManager to use the current project ID
      this.secretsManager = new SecretsManager({
        ...this.secretsManager["config"],
        projectId,
      });
      const secrets = await this.secretsManager.listSecrets(environmentId);
      const result: Record<string, string> = {};
      for (const secret of secrets) {
        if (secret.key && secret.value) {
          result[secret.key] = secret.value;
        }
      }
      return result;
    } else {
      const key = `${projectId}:${environmentId}`;
      const secrets = this.secrets.get(key) || new Map();
      const result: Record<string, string> = {};
      secrets.forEach((secret, name) => {
        result[name] = secret.value;
      });
      return result;
    }
  }

  clearSecrets(projectId: string): void {
    // Clear secrets for all environments of this project
    const keysToDelete: string[] = [];
    this.secrets.forEach((_, key) => {
      if (key.startsWith(`${projectId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.secrets.delete(key));
  }

  // Deployment management
  addDeployment(projectId: string, deployment: Deployment): void {
    const deployments = this.deployments.get(projectId) || [];
    deployments.push(deployment);
    this.deployments.set(projectId, deployments);
  }

  addDeployments(projectId: string, deployments: Deployment[]): void {
    this.deployments.set(projectId, deployments);
  }

  clearDeployments(projectId: string): void {
    this.deployments.delete(projectId);
  }

  setDeploymentLogs(deploymentId: string, logs: any[]): void {
    this.deploymentLogs.set(deploymentId, logs);
  }

  // Namespace management
  private handleNamespacedDeployment(
    deploymentId: string,
    deployment: CloudExpressDeployment,
    namespace: string,
  ): void {
    // Create namespace if it doesn't exist
    if (!this.namespaces.has(namespace)) {
      const isPreview = namespace.startsWith("preview-");
      const prNumber = isPreview
        ? parseInt(namespace.split("-")[1] || "0")
        : undefined;

      const namespaceData: NamespaceData = {
        name: namespace,
        type: isPreview ? "preview" : "custom",
        createdAt: new Date().toISOString(),
        expiresAt: isPreview
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
        metadata: prNumber ? { prNumber } : undefined,
        resources: {
          deployments: [],
          databases: [],
          urls: [],
        },
      };

      this.namespaces.set(namespace, namespaceData);

      // Clone production database for preview environments
      if (isPreview) {
        this.cloneDatabaseForNamespace(namespace);
      }
    }

    // Add deployment to namespace
    const namespaceData = this.namespaces.get(namespace)!;
    namespaceData.resources.deployments.push(deploymentId);

    // Track namespaced deployment
    if (!this.namespacedDeployments.has(namespace)) {
      this.namespacedDeployments.set(namespace, new Map());
    }
    this.namespacedDeployments
      .get(namespace)!
      .set(deploymentId, deployment as any);
  }

  private cloneDatabaseForNamespace(namespace: string): void {
    // Simulate database cloning
    console.log(`Cloning production database for namespace: ${namespace}`);

    // Create a copy of production data
    const productionData = {
      users: [
        { id: 1, name: "John Doe", email: "john@example.com" },
        { id: 2, name: "Jane Smith", email: "jane@example.com" },
      ],
      posts: this.getPosts(),
      settings: {
        siteName: `Preview ${namespace}`,
        theme: "light",
      },
    };

    this.namespacedDatabases.set(namespace, productionData);

    const namespaceData = this.namespaces.get(namespace);
    if (namespaceData) {
      namespaceData.resources.databases.push(`db-${namespace}`);
    }
  }

  private cleanupNamespace(namespace: string): any {
    const namespaceData = this.namespaces.get(namespace);
    if (!namespaceData) return { deployments: 0, databases: 0, services: 0 };

    let deletedDeployments = 0;
    let deletedDatabases = 0;
    let deletedServices = 0;

    // Delete deployments
    if (this.namespacedDeployments.has(namespace)) {
      deletedDeployments = this.namespacedDeployments.get(namespace)!.size;
      this.namespacedDeployments.delete(namespace);
    }

    // Delete databases
    if (this.namespacedDatabases.has(namespace)) {
      deletedDatabases = 1;
      this.namespacedDatabases.delete(namespace);
    }

    // Count services
    namespaceData.resources.deployments.forEach((deploymentId) => {
      const deployment = this.cloudExpressDeployments.get(deploymentId);
      if (deployment) {
        deletedServices += deployment.services.length;
        this.cloudExpressDeployments.delete(deploymentId);
      }
    });

    // Remove namespace
    this.namespaces.delete(namespace);

    return {
      deployments: deletedDeployments,
      databases: deletedDatabases,
      services: deletedServices,
    };
  }

  private getPosts(): any[] {
    // Return the posts array used in the generic endpoints
    return [
      {
        id: "1",
        title: "First Post",
        content: "Hello World",
        author: "Admin",
        published: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Second Post",
        content: "Another post",
        author: "User",
        published: false,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  // CloudExpress deployment simulation
  private simulateDeploymentProgress(deploymentId: string): void {
    const deployment = this.cloudExpressDeployments.get(deploymentId);
    if (!deployment) return;

    // Start deployment
    setTimeout(() => {
      deployment.status = "in_progress";

      // Process each service
      deployment.services.forEach((service, index) => {
        setTimeout(() => {
          // Simulate upload -> build -> deploy -> complete
          const stages = ["uploading", "building", "deploying", "completed"];
          let stageIndex = 0;

          const interval = setInterval(() => {
            if (stageIndex < stages.length) {
              service.status = stages[stageIndex] as any;

              // Add URL when completed
              if (service.status === "completed") {
                const subdomain = service.type === "frontend" ? "app" : "api";
                const env = deployment.environment || "production";

                // Include namespace in URL if present
                if (deployment.namespace) {
                  service.url = `https://${deployment.namespace}-${subdomain}.preview.cygni.dev`;
                } else {
                  service.url = `https://${subdomain}-${env}.cloudexpress.io`;
                }

                // Add URL to namespace resources
                if (deployment.namespace) {
                  const namespaceData = this.namespaces.get(
                    deployment.namespace,
                  );
                  if (namespaceData && service.url) {
                    namespaceData.resources.urls.push(service.url);
                  }
                }
              }

              stageIndex++;
            } else {
              clearInterval(interval);
            }

            // Check if all services are completed
            const allCompleted = deployment.services.every(
              (s) => s.status === "completed",
            );
            if (allCompleted) {
              deployment.status = "completed";
              deployment.completedAt = new Date().toISOString();
            }
          }, 500); // Each stage takes 500ms
        }, index * 1000); // Stagger service deployments
      });
    }, 100);
  }

  // Helper method to find user by token
  private findUserByToken(token: string): User | null {
    // Try JWT first
    try {
      const JWT_SECRET = "test-secret-key";
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        id: decoded.sub || decoded.userId,
        email: decoded.email || "test@example.com",
        password: "",
      };
    } catch {
      // Fall back to token map
      return this.tokens.get(token) || null;
    }
  }
}
