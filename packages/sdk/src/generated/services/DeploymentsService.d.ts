import type { CreateDeploymentRequest } from "../models/CreateDeploymentRequest";
import type { CreateDeploymentResponse } from "../models/CreateDeploymentResponse";
import type { Deployment } from "../models/Deployment";
import type { DeploymentStatus } from "../models/DeploymentStatus";
import type { CancelablePromise } from "../core/CancelablePromise";
export declare class DeploymentsService {
    /**
     * Create a new deployment
     * @param requestBody
     * @returns CreateDeploymentResponse Deployment created
     * @throws ApiError
     */
    static postDeployments(requestBody: CreateDeploymentRequest): CancelablePromise<CreateDeploymentResponse>;
    /**
     * Get deployment status
     * @param deploymentId
     * @returns DeploymentStatus Deployment status
     * @throws ApiError
     */
    static getDeploymentsStatus(deploymentId: string): CancelablePromise<DeploymentStatus>;
    /**
     * List deployments for a project
     * @param projectId
     * @param environment
     * @param limit
     * @returns any List of deployments
     * @throws ApiError
     */
    static getProjectsDeployments(projectId: string, environment?: string, limit?: number): CancelablePromise<{
        deployments?: Array<Deployment>;
    }>;
}
//# sourceMappingURL=DeploymentsService.d.ts.map