"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLogin = useLogin;
exports.useLogout = useLogout;
exports.useCurrentUser = useCurrentUser;
exports.useAuthRestore = useAuthRestore;
const react_query_1 = require("@tanstack/react-query");
const generated_1 = require("../generated");
const config_1 = require("../config");
function useLogin() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (credentials) => {
            const response = await generated_1.AuthenticationService.postAuthLogin(credentials);
            return response;
        },
        onSuccess: (data) => {
            // Store the token
            if (data.token) {
                (0, config_1.setAuthToken)(data.token);
                // Store user data in query cache
                queryClient.setQueryData(["auth", "me"], data.user);
                // Store token in localStorage for persistence
                if (typeof window !== "undefined") {
                    localStorage.setItem("cygni_token", data.token);
                }
            }
        },
    });
}
function useLogout() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async () => {
            // Clear token
            (0, config_1.clearAuthToken)();
            // Clear localStorage
            if (typeof window !== "undefined") {
                localStorage.removeItem("cygni_token");
            }
            return Promise.resolve();
        },
        onSuccess: () => {
            // Clear all queries
            queryClient.clear();
        },
    });
}
function useCurrentUser() {
    return (0, react_query_1.useQuery)({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const response = await generated_1.AuthenticationService.getAuthMe();
            return response;
        },
        retry: false, // Don't retry auth requests
    });
}
// Hook to check and restore authentication from localStorage
function useAuthRestore() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async () => {
            if (typeof window === "undefined") {
                return null;
            }
            const token = localStorage.getItem("cygni_token");
            if (!token) {
                return null;
            }
            // Set the token
            (0, config_1.setAuthToken)(token);
            // Try to fetch current user
            try {
                const user = await generated_1.AuthenticationService.getAuthMe();
                return { token, user };
            }
            catch (error) {
                // Token is invalid
                (0, config_1.clearAuthToken)();
                localStorage.removeItem("cygni_token");
                throw error;
            }
        },
        onSuccess: (data) => {
            if (data?.user) {
                queryClient.setQueryData(["auth", "me"], data.user);
            }
        },
    });
}
//# sourceMappingURL=useAuth.js.map