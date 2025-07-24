import type { LoginRequest } from "../models/LoginRequest";
import type { LoginResponse } from "../models/LoginResponse";
import type { User } from "../models/User";
import type { CancelablePromise } from "../core/CancelablePromise";
export declare class AuthenticationService {
    /**
     * User login
     * @param requestBody
     * @returns LoginResponse Successful login
     * @throws ApiError
     */
    static postAuthLogin(requestBody: LoginRequest): CancelablePromise<LoginResponse>;
    /**
     * Get current user
     * @returns User Current user info
     * @throws ApiError
     */
    static getAuthMe(): CancelablePromise<User>;
}
//# sourceMappingURL=AuthenticationService.d.ts.map