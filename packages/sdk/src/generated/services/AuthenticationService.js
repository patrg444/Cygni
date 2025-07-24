"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationService = void 0;
const OpenAPI_1 = require("../core/OpenAPI");
const request_1 = require("../core/request");
class AuthenticationService {
    /**
     * User login
     * @param requestBody
     * @returns LoginResponse Successful login
     * @throws ApiError
     */
    static postAuthLogin(requestBody) {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
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
    static getAuthMe() {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
            method: "GET",
            url: "/auth/me",
        });
    }
}
exports.AuthenticationService = AuthenticationService;
//# sourceMappingURL=AuthenticationService.js.map