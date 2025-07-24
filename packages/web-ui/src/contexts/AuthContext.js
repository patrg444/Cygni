"use strict";
"use client";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = AuthProvider;
exports.useAuth = useAuth;
const react_1 = __importStar(require("react"));
const react_query_1 = require("@tanstack/react-query");
const axios_1 = __importDefault(require("axios"));
const AuthContext = (0, react_1.createContext)(undefined);
function AuthProvider({ children, value }) {
    const queryClient = (0, react_query_1.useQueryClient)();
    const [isInitializing, setIsInitializing] = (0, react_1.useState)(true);
    // Fetch current user
    const { data: user, isLoading: isUserLoading, refetch, } = (0, react_query_1.useQuery)({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const token = localStorage.getItem("authToken");
            if (!token)
                return null;
            const response = await axios_1.default.get("/api/auth/me", {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        },
        retry: false,
        enabled: !value, // Disable if we're in test mode
    });
    // Login mutation
    const loginMutation = (0, react_query_1.useMutation)({
        mutationFn: async ({ email, password, }) => {
            const response = await axios_1.default.post("/api/auth/login", { email, password });
            return response.data;
        },
        onSuccess: (data) => {
            localStorage.setItem("authToken", data.token);
            queryClient.invalidateQueries({ queryKey: ["auth"] });
        },
    });
    // Logout mutation
    const logoutMutation = (0, react_query_1.useMutation)({
        mutationFn: async () => {
            const token = localStorage.getItem("authToken");
            if (token) {
                await axios_1.default.post("/api/auth/logout", {}, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
        },
        onSettled: () => {
            localStorage.removeItem("authToken");
            queryClient.clear();
            queryClient.invalidateQueries({ queryKey: ["auth"] });
        },
    });
    (0, react_1.useEffect)(() => {
        setIsInitializing(false);
    }, []);
    const contextValue = value || {
        user: user || null,
        isLoading: isInitializing || isUserLoading,
        login: async (email, password) => {
            await loginMutation.mutateAsync({ email, password });
        },
        logout: async () => {
            await logoutMutation.mutateAsync();
        },
        refreshSession: async () => {
            await refetch();
        },
    };
    return (<AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>);
}
function useAuth() {
    const context = (0, react_1.useContext)(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
//# sourceMappingURL=AuthContext.js.map