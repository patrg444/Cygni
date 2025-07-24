import { CreateDeploymentRequest } from "../generated";
export declare function useCreateDeployment(): import("@tanstack/react-query").UseMutationResult<import("../generated").CreateDeploymentResponse, Error, CreateDeploymentRequest, unknown>;
export declare function useDeploymentStatus(deploymentId: string, options?: {
    refetchInterval?: number | false;
}): import("@tanstack/react-query").UseQueryResult<import("../generated").DeploymentStatus, Error>;
export declare function useProjectDeployments(projectId: string, options?: {
    environment?: string;
    limit?: number;
}): import("@tanstack/react-query").UseQueryResult<{
    deployments?: Array<import("../generated").Deployment>;
}, Error>;
export declare function useDeploymentMonitor(deploymentId: string | null): {
    deployment: import("../generated").DeploymentStatus | undefined;
    isDeploying: boolean | undefined;
    isCompleted: boolean;
    isFailed: boolean;
    error: Error | null;
    shouldPoll: boolean;
};
export declare function useLatestDeployment(projectId: string, environment?: string): {
    error: Error;
    isError: true;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: true;
    isSuccess: false;
    isPlaceholderData: false;
    status: "error";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
} | {
    error: null;
    isError: false;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: true;
    isPlaceholderData: false;
    status: "success";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
} | {
    error: Error;
    isError: true;
    isPending: false;
    isLoading: false;
    isLoadingError: true;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "error";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
} | {
    error: null;
    isError: false;
    isPending: true;
    isLoading: true;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "pending";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
} | {
    error: null;
    isError: false;
    isPending: true;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: false;
    isPlaceholderData: false;
    status: "pending";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isLoading: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
} | {
    isError: false;
    error: null;
    isPending: false;
    isLoading: false;
    isLoadingError: false;
    isRefetchError: false;
    isSuccess: true;
    isPlaceholderData: true;
    status: "success";
    dataUpdatedAt: number;
    errorUpdatedAt: number;
    failureCount: number;
    failureReason: Error | null;
    errorUpdateCount: number;
    isFetched: boolean;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    isInitialLoading: boolean;
    isPaused: boolean;
    isRefetching: boolean;
    isStale: boolean;
    isEnabled: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        deployments?: Array<import("../generated").Deployment>;
    }, Error>>;
    fetchStatus: import("@tanstack/react-query").FetchStatus;
    promise: Promise<{
        deployments?: Array<import("../generated").Deployment>;
    }>;
    deployment: import("../generated").Deployment | undefined;
};
//# sourceMappingURL=useDeployments.d.ts.map