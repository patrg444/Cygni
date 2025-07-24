/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LoginRequest } from "../models/LoginRequest";
import type { LoginResponse } from "../models/LoginResponse";
import type { User } from "../models/User";

import type { CancelablePromise } from "../core/CancelablePromise";
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class AuthenticationService {
  /**
   * User login
   * @param requestBody
   * @returns LoginResponse Successful login
   * @throws ApiError
   */
  public static postAuthLogin(
    requestBody: LoginRequest,
  ): CancelablePromise<LoginResponse> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/auth/login",
      body: requestBody,
      mediaType: "application/json",
    });
  }

  /**
   * Get current user
   * @returns User Current user info
   * @throws ApiError
   */
  public static getAuthMe(): CancelablePromise<User> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/auth/me",
    });
  }
}
