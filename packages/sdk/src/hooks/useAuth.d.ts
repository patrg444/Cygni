import { LoginRequest, LoginResponse } from "../generated";
export declare function useLogin(): import("@tanstack/react-query").UseMutationResult<LoginResponse, Error, LoginRequest, unknown>;
export declare function useLogout(): import("@tanstack/react-query").UseMutationResult<void, Error, void, unknown>;
export declare function useCurrentUser(): import("@tanstack/react-query").UseQueryResult<import("../generated").User, Error>;
export declare function useAuthRestore(): import("@tanstack/react-query").UseMutationResult<{
    token: any;
    user: import("../generated").User;
} | null, Error, void, unknown>;
//# sourceMappingURL=useAuth.d.ts.map