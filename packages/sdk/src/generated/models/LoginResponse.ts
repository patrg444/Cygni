/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Organization } from "./Organization";
import type { User } from "./User";

export type LoginResponse = {
  token?: string;
  user?: User;
  organizations?: Array<Organization>;
};
