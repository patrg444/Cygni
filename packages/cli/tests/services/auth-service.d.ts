export interface AuthData {
    token: string;
    email: string;
    organizations: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
    }>;
}
/**
 * Real auth service for testing with configurable home directory
 */
export declare class AuthService {
    private homeDir;
    constructor(homeDir: string);
    private get authFile();
    saveAuth(auth: AuthData): Promise<void>;
    loadAuth(): Promise<AuthData | null>;
    clearAuth(): Promise<void>;
    exists(): Promise<boolean>;
    getPermissions(): Promise<number | null>;
}
//# sourceMappingURL=auth-service.d.ts.map