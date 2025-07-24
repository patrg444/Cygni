/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Project } from "../models/Project";

import type { CancelablePromise } from "../core/CancelablePromise";
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class ProjectsService {
  /**
   * Get project by ID
   * @param projectId
   * @returns Project Project details
   * @throws ApiError
   */
  public static getProjects(projectId: string): CancelablePromise<Project> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/projects/{projectId}",
      path: {
        projectId: projectId,
      },
    });
  }
}
