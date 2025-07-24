/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type CreateDeploymentRequest = {
  cloudexpressConfig: {
    version?: string;
    services?: Array<{
      name?: string;
      type?: "frontend" | "backend" | "fullstack";
      path?: string;
    }>;
  };
  environment?: string;
  provider?: string;
};
