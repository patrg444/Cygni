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
export declare class TestApiServer {
    private app;
    private server?;
    private users;
    private tokens;
    private organizations;
    private projects;
    private projectsByOrg;
    private environments;
    private secrets;
    private deployments;
    private deploymentLogs;
    private userOrganizations;
    private cloudExpressDeployments;
    private namespaces;
    private namespacedDeployments;
    private namespacedDatabases;
    private secretsManager?;
    constructor(useLocalStack?: boolean);
    private seedData;
    private setupRoutes;
    start(port?: number): Promise<number>;
    stop(): Promise<void>;
    addUser(email: string, password: string): void;
    addOrganization(userId: string, org: Organization): void;
    clearData(): void;
    setUserOrganizations(userId: string, organizations: Organization[]): void;
    addProject(organizationId: string, project: Project): void;
    addEnvironment(projectId: string, env: Environment): void;
    addEnvironments(projectId: string, envs: Environment[]): void;
    addSecret(projectId: string, environmentId: string, name: string, value: string): Promise<void>;
    getSecrets(projectId: string, environmentId: string): Promise<Record<string, string>>;
    clearSecrets(projectId: string): void;
    addDeployment(projectId: string, deployment: Deployment): void;
    addDeployments(projectId: string, deployments: Deployment[]): void;
    clearDeployments(projectId: string): void;
    setDeploymentLogs(deploymentId: string, logs: any[]): void;
    private handleNamespacedDeployment;
    private cloneDatabaseForNamespace;
    private cleanupNamespace;
    private getPosts;
    private simulateDeploymentProgress;
    private findUserByToken;
}
export {};
//# sourceMappingURL=test-api-server.d.ts.map