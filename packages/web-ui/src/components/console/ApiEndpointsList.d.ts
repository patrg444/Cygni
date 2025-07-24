interface Endpoint {
    method: string;
    path: string;
    file: string;
    line?: number;
    middleware?: string[];
    authentication?: boolean;
    description?: string;
}
interface ApiEndpointsListProps {
    endpoints: Endpoint[];
}
export declare function ApiEndpointsList({ endpoints }: ApiEndpointsListProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ApiEndpointsList.d.ts.map