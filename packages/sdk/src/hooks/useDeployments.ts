import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeploymentsService, CreateDeploymentRequest } from "../generated";
import { AxiosError } from "axios";

// Exponential backoff delay calculation
const getRetryDelay = (attemptIndex: number): number => {
  // Base delay of 1 second, exponentially increasing: 1s, 2s, 4s
  return Math.min(1000 * Math.pow(2, attemptIndex), 10000);
};

// Helper to determine if we should retry
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 3) return false; // Max 3 retries
  
  if (error instanceof AxiosError) {
    // Retry on 5xx errors or network errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }
  return false;
};

export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateDeploymentRequest) => {
      return await DeploymentsService.postDeployments(request);
    },
    onSuccess: () => {
      // Invalidate deployment queries
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
    retry: shouldRetry,
    retryDelay: getRetryDelay,
  });
}

export function useDeploymentStatus(
  deploymentId: string,
  options?: {
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: ["deployments", deploymentId, "status"],
    queryFn: async () => {
      return await DeploymentsService.getDeploymentsStatus(deploymentId);
    },
    enabled: !!deploymentId,
    refetchInterval: options?.refetchInterval ?? 2000, // Poll every 2 seconds by default
    retry: 3,
    retryDelay: getRetryDelay,
  });
}

export function useProjectDeployments(
  projectId: string,
  options?: {
    environment?: string;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["projects", projectId, "deployments", options],
    queryFn: async () => {
      return await DeploymentsService.getProjectsDeployments(
        projectId,
        options?.environment,
        options?.limit,
      );
    },
    enabled: !!projectId,
    retry: 3,
    retryDelay: getRetryDelay,
  });
}

// Hook to monitor deployment until completion
export function useDeploymentMonitor(deploymentId: string | null) {
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
export function useLatestDeployment(projectId: string, environment?: string) {
  const { data, ...rest } = useProjectDeployments(projectId, {
    environment,
    limit: 1,
  });

  return {
    deployment: data?.deployments?.[0],
    ...rest,
  };
}
