/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type DeploymentStatus = {
  id?: string;
  status?: DeploymentStatus.status;
  services?: Array<{
    name?: string;
    type?: string;
    status?: string;
    url?: string;
  }>;
  createdAt?: string;
  completedAt?: string;
  environment?: string;
  provider?: string;
};

export namespace DeploymentStatus {
  export enum status {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
  }
}
