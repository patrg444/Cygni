"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentsService = void 0;
const OpenAPI_1 = require("../core/OpenAPI");
const request_1 = require("../core/request");
class DeploymentsService {
    /**
     * Create a new deployment
     * @param requestBody
     * @returns CreateDeploymentResponse Deployment created
     * @throws ApiError
     */
    static postDeployments(requestBody) {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
            method: "POST",
            url: "/deployments",
            body: requestBody,
            mediaType: "application/json",
        });
    }
    /**
     * Get deployment status
     * @param deploymentId
     * @returns DeploymentStatus Deployment status
     * @throws ApiError
     */
    static getDeploymentsStatus(deploymentId) {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
            method: "GET",
            url: "/deployments/{deploymentId}/status",
            path: {
                deploymentId: deploymentId,
            },
        });
    }
    /**
     * List deployments for a project
     * @param projectId
     * @param environment
     * @param limit
     * @returns any List of deployments
     * @throws ApiError
     */
    static getProjectsDeployments(projectId, environment, limit = 10) {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
            method: "GET",
            url: "/projects/{projectId}/deployments",
            path: {
                projectId: projectId,
            },
            query: {
                environment: environment,
                limit: limit,
            },
        });
    }
}
exports.DeploymentsService = DeploymentsService;
//# sourceMappingURL=DeploymentsService.js.map