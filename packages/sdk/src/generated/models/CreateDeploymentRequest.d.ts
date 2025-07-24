export type CreateDeploymentRequest = {
    cloudexpressConfig: {
        version?: string;
        services?: Array<{
            name?: string;
            type?: "frontend" | "backend" | "fullstack";
            path?: string;
        }>;
    };
    environment?: string;
    provider?: string;
};
//# sourceMappingURL=CreateDeploymentRequest.d.ts.map