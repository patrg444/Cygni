interface DatabaseSpec {
    projectId: string;
    environment: string;
    size: "nano" | "small" | "medium" | "large";
    version?: string;
}
export declare class RDSProvisioner {
    private rdsClient;
    private ec2Client;
    constructor(region?: string);
    provision(spec: DatabaseSpec): Promise<{
        host: any;
        port: any;
        database: any;
        user: any;
        password: any;
        connectionString: string;
    }>;
    private provisionLogicalDatabase;
    private generateSecurePassword;
}
export {};
//# sourceMappingURL=provision-rds.d.ts.map