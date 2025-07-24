import React from "react";
export interface User {
    id: string;
    email: string;
    name?: string;
    organizations?: Array<{
        id: string;
        name: string;
        role: string;
    }>;
}
export interface AuthContextValue {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<void>;
}
interface AuthProviderProps {
    children: React.ReactNode;
    value?: AuthContextValue;
}
export declare function AuthProvider({ children, value }: AuthProviderProps): React.JSX.Element;
export declare function useAuth(): AuthContextValue;
export {};
//# sourceMappingURL=AuthContext.d.ts.map