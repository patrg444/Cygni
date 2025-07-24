"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCreateDeployment = useCreateDeployment;
exports.useDeploymentStatus = useDeploymentStatus;
exports.useProjectDeployments = useProjectDeployments;
exports.useDeploymentMonitor = useDeploymentMonitor;
exports.useLatestDeployment = useLatestDeployment;
const react_query_1 = require("@tanstack/react-query");
const generated_1 = require("../generated");
function useCreateDeployment() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (request) => {
            return await generated_1.DeploymentsService.postDeployments(request);
        },
        onSuccess: () => {
            // Invalidate deployment queries
            queryClient.invalidateQueries({ queryKey: ["deployments"] });
        },
    });
}
function useDeploymentStatus(deploymentId, options) {
    return (0, react_query_1.useQuery)({
        queryKey: ["deployments", deploymentId, "status"],
        queryFn: async () => {
            return await generated_1.DeploymentsService.getDeploymentsStatus(deploymentId);
        },
        enabled: !!deploymentId,
        refetchInterval: options?.refetchInterval ?? 2000, // Poll every 2 seconds by default
    });
}
function useProjectDeployments(projectId, options) {
    return (0, react_query_1.useQuery)({
        queryKey: ["projects", projectId, "deployments", options],
        queryFn: async () => {
            return await generated_1.DeploymentsService.getProjectsDeployments(projectId, options?.environment, options?.limit);
        },
        enabled: !!projectId,
    });
}
// Hook to monitor deployment until completion
function useDeploymentMonitor(deploymentId) {
    const { data, isLoading, error } = useDeploymentStatus(deploymentId || "", {
        refetchInterval: 2000,
    });
    const isCompleted = data?.status === "completed";
    const isFailed = data?.status === "failed";
    // Disable polling when completed or failed
    const shouldPoll = !isCompleted && !isFailed && !!deploymentId;
    return {
        deployment: data,
        isDeploying: isLoading || (data && data.status === "in_progress"),
        isCompleted,
        isFailed,
        error,
        shouldPoll,
    };
}
// Hook to get the latest deployment for a project
function useLatestDeployment(projectId, environment) {
    const { data, ...rest } = useProjectDeployments(projectId, {
        environment,
        limit: 1,
    });
    return {
        deployment: data?.deployments?.[0],
        ...rest,
    };
}
//# sourceMappingURL=useDeployments.js.map