/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateDeploymentRequest } from "../models/CreateDeploymentRequest";
import type { CreateDeploymentResponse } from "../models/CreateDeploymentResponse";
import type { Deployment } from "../models/Deployment";
import type { DeploymentStatus } from "../models/DeploymentStatus";

import type { CancelablePromise } from "../core/CancelablePromise";
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class DeploymentsService {
  /**
   * Create a new deployment
   * @param requestBody
   * @returns CreateDeploymentResponse Deployment created
   * @throws ApiError
   */
  public static postDeployments(
    requestBody: CreateDeploymentRequest,
  ): CancelablePromise<CreateDeploymentResponse> {
    return __request(OpenAPI, {
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
  public static getDeploymentsStatus(
    deploymentId: string,
  ): CancelablePromise<DeploymentStatus> {
    return __request(OpenAPI, {
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
  public static getProjectsDeployments(
    projectId: string,
    environment?: string,
    limit: number = 10,
  ): CancelablePromise<{
    deployments?: Array<Deployment>;
  }> {
    return __request(OpenAPI, {
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
