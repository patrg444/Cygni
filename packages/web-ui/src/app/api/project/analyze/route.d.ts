import { NextResponse } from "next/server";
export declare function GET(): Promise<NextResponse<{
    framework: string;
    endpoints: {
        method: string;
        path: string;
        file: string;
        line: number;
        middleware: string[];
        authentication: boolean;
        description: string;
    }[];
    authentication: {
        type: string;
        strategy: string;
    };
    middleware: string[];
    websockets: {
        enabled: boolean;
        path: string;
    };
    graphql: {
        enabled: boolean;
    };
    runtimeConfig: {
        runtime: string;
        framework: string;
        endpoints: number;
        port: number;
        build: string;
        start: string;
        deploy: {
            strategy: string;
            healthCheck: {
                path: string;
                interval: number;
                timeout: number;
                retries: number;
            };
        };
    };
    detectedFiles: {
        config: string[];
        source: string[];
    };
}>>;
//# sourceMappingURL=route.d.ts.map