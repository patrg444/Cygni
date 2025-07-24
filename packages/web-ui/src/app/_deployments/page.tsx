"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
  RocketIcon,
  ClockIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import { LogViewer } from "@/components/LogViewer";
import { MonitoringDashboard } from "@/components/MonitoringDashboard";
import { DeploymentStrategyView } from "@/components/DeploymentStrategyView";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Deployment {
  id: string;
  projectId: string;
  environment: {
    name: string;
    slug: string;
  };
  build: {
    commitSha: string;
    branch: string;
    imageUrl: string;
  };
  status:
    | "pending"
    | "deploying"
    | "active"
    | "failed"
    | "cancelled"
    | "rolling-back";
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
  currentImage?: string;
  previousImage?: string;
  replicas?: number;
  readyReplicas?: number;
  endpoint?: string;
  region?: string;
  canaryStatus?: {
    enabled: boolean;
    currentWeight: number;
    targetWeight: number;
    phase: "progressing" | "paused" | "completed" | "failed";
  };
  healthGate?: {
    enabled: boolean;
    status: "passing" | "failing" | "unknown";
    metrics: {
      errorRate: number;
      p95Latency: number;
      successRate: number;
    };
  };
}

export default function DeploymentsPage() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState({
    environment: "all",
    status: "all",
    region: "all",
  });
  const queryClient = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects").then((res) => res.data),
  });

  const { data: deployments, isLoading } = useQuery({
    queryKey: ["deployments", selectedProject, filters],
    queryFn: () =>
      api
        .get(`/projects/${selectedProject}/deployments`, {
          params: filters,
        })
        .then((res) => res.data),
    enabled: !!selectedProject,
  });

  // Get unique values for filters
  const environments = deployments?.environments || [];
  const regions = deployments?.regions || [];
  const statuses = [
    "pending",
    "deploying",
    "active",
    "failed",
    "cancelled",
    "rolling-back",
  ];

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      api.post(`/deployments/${deploymentId}/rollback`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  const statusIcons = {
    pending: <ClockIcon className="w-4 h-4 text-gray-500" />,
    deploying: <ReloadIcon className="w-4 h-4 text-blue-500 animate-spin" />,
    active: <CheckCircledIcon className="w-4 h-4 text-green-500" />,
    failed: <CrossCircledIcon className="w-4 h-4 text-red-500" />,
    cancelled: <CrossCircledIcon className="w-4 h-4 text-gray-500" />,
    "rolling-back": (
      <ReloadIcon className="w-4 h-4 text-orange-500 animate-spin" />
    ),
  };

  const statusColors = {
    pending: "bg-gray-100 text-gray-700",
    deploying: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
    "rolling-back": "bg-orange-100 text-orange-700",
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Deployments</h1>
        <p className="text-gray-600">
          Manage and monitor your application deployments
        </p>
      </div>

      {/* Project selector and filters */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Choose a project...</option>
            {projects?.map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filters */}
        {selectedProject && (
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Environment
              </label>
              <select
                value={filters.environment}
                onChange={(e) =>
                  setFilters({ ...filters, environment: e.target.value })
                }
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All environments</option>
                {environments.map((env: string) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() +
                      status.slice(1).replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Region
              </label>
              <select
                value={filters.region}
                onChange={(e) =>
                  setFilters({ ...filters, region: e.target.value })
                }
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All regions</option>
                {regions.map((region: string) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {selectedProject && (
        <>
          {/* Active Deployment Strategies */}
          {deployments?.activeStrategies?.length > 0 && (
            <div className="mb-6 space-y-4">
              <h3 className="text-lg font-semibold">
                Active Deployment Strategies
              </h3>
              {deployments.activeStrategies.map((strategy: any) => (
                <DeploymentStrategyView
                  key={strategy.id}
                  strategy={{
                    type: strategy.type,
                    status: strategy.status,
                    config: strategy.config,
                    progress: strategy.progress,
                  }}
                  serviceName={strategy.serviceName}
                  onPromote={() => {
                    api.post(`/deployments/${strategy.deploymentId}/promote`);
                    queryClient.invalidateQueries({
                      queryKey: ["deployments"],
                    });
                  }}
                  onRollback={() => {
                    if (
                      confirm(
                        "Are you sure you want to rollback this deployment?",
                      )
                    ) {
                      api.post(
                        `/deployments/${strategy.deploymentId}/rollback`,
                      );
                      queryClient.invalidateQueries({
                        queryKey: ["deployments"],
                      });
                    }
                  }}
                  onPause={() => {
                    api.post(`/deployments/${strategy.deploymentId}/pause`);
                    queryClient.invalidateQueries({
                      queryKey: ["deployments"],
                    });
                  }}
                  onResume={() => {
                    api.post(`/deployments/${strategy.deploymentId}/resume`);
                    queryClient.invalidateQueries({
                      queryKey: ["deployments"],
                    });
                  }}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Deployments list */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Recent Deployments</h2>
              </div>

              {isLoading ? (
                <div className="p-6 text-center text-gray-500">
                  Loading deployments...
                </div>
              ) : deployments?.deployments?.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No deployments yet
                </div>
              ) : (
                <div className="divide-y">
                  {deployments?.deployments?.map((deployment: Deployment) => (
                    <div
                      key={deployment.id}
                      onClick={() => setSelectedDeployment(deployment.id)}
                      className={cn(
                        "p-4 hover:bg-gray-50 cursor-pointer transition-colors",
                        selectedDeployment === deployment.id && "bg-blue-50",
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {statusIcons[deployment.status]}
                          <span
                            className={cn(
                              "px-2 py-1 text-xs font-medium rounded-full",
                              statusColors[deployment.status],
                            )}
                          >
                            {deployment.status}
                          </span>
                          <span className="text-sm text-gray-600">
                            {deployment.environment.name}
                          </span>
                        </div>
                        <time className="text-sm text-gray-500">
                          {format(
                            new Date(deployment.createdAt),
                            "MMM d, h:mm a",
                          )}
                        </time>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500">Commit:</span>
                          <code className="px-1 py-0.5 bg-gray-100 rounded font-mono text-xs">
                            {deployment.build.commitSha.slice(0, 7)}
                          </code>
                          <span className="text-gray-500">on</span>
                          <span className="font-medium">
                            {deployment.build.branch}
                          </span>
                        </div>

                        <div className="text-sm text-gray-600">
                          by {deployment.user.name || deployment.user.email}
                        </div>

                        {deployment.replicas !== undefined && (
                          <div className="text-sm text-gray-600">
                            Replicas: {deployment.readyReplicas || 0}/
                            {deployment.replicas}
                          </div>
                        )}

                        {deployment.region && (
                          <div className="text-sm text-gray-600">
                            Region: {deployment.region}
                          </div>
                        )}
                      </div>

                      {/* Canary Progress */}
                      {deployment.canaryStatus?.enabled && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>
                              Canary: {deployment.canaryStatus.currentWeight}%
                            </span>
                            <span className="capitalize">
                              {deployment.canaryStatus.phase}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={cn(
                                "h-2 rounded-full transition-all duration-500",
                                deployment.canaryStatus.phase ===
                                  "progressing" && "bg-blue-500",
                                deployment.canaryStatus.phase === "completed" &&
                                  "bg-green-500",
                                deployment.canaryStatus.phase === "failed" &&
                                  "bg-red-500",
                                deployment.canaryStatus.phase === "paused" &&
                                  "bg-yellow-500",
                              )}
                              style={{
                                width: `${deployment.canaryStatus.currentWeight}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Health Gate Status */}
                      {deployment.healthGate?.enabled && (
                        <div className="mt-3 p-2 bg-gray-50 rounded">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">Health Gate</span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-full text-xs",
                                deployment.healthGate.status === "passing" &&
                                  "bg-green-100 text-green-700",
                                deployment.healthGate.status === "failing" &&
                                  "bg-red-100 text-red-700",
                                deployment.healthGate.status === "unknown" &&
                                  "bg-gray-100 text-gray-700",
                              )}
                            >
                              {deployment.healthGate.status}
                            </span>
                          </div>
                          {deployment.healthGate.metrics && (
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <div className="text-gray-500">Error Rate</div>
                                <div
                                  className={cn(
                                    "font-medium",
                                    deployment.healthGate.metrics.errorRate > 5
                                      ? "text-red-600"
                                      : "text-green-600",
                                  )}
                                >
                                  {deployment.healthGate.metrics.errorRate.toFixed(
                                    2,
                                  )}
                                  %
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500">P95 Latency</div>
                                <div className="font-medium">
                                  {deployment.healthGate.metrics.p95Latency}ms
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500">
                                  Success Rate
                                </div>
                                <div
                                  className={cn(
                                    "font-medium",
                                    deployment.healthGate.metrics.successRate <
                                      95
                                      ? "text-orange-600"
                                      : "text-green-600",
                                  )}
                                >
                                  {deployment.healthGate.metrics.successRate.toFixed(
                                    1,
                                  )}
                                  %
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {deployment.status === "active" &&
                        deployment.endpoint && (
                          <div className="mt-2">
                            <a
                              href={deployment.endpoint}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                            >
                              View deployment
                              <ExternalLinkIcon className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                      {deployment.status === "active" &&
                        deployment.previousImage && (
                          <div className="mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm("Are you sure you want to rollback?")
                                ) {
                                  rollbackMutation.mutate(deployment.id);
                                }
                              }}
                              className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                              Rollback
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deployment details / logs */}
            <div>
              {selectedDeployment ? (
                <LogViewer
                  deploymentId={selectedDeployment}
                  className="h-full"
                  height="calc(100vh - 300px)"
                />
              ) : (
                <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                  Select a deployment to view logs
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Preview environments section */}
      {selectedProject && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Preview Environments</h2>
          <PreviewEnvironments projectId={selectedProject} />
        </div>
      )}

      {/* Monitoring Dashboard */}
      {selectedProject && (
        <div className="mt-8">
          <MonitoringDashboard projectId={selectedProject} />
        </div>
      )}
    </div>
  );
}

function PreviewEnvironments({ projectId }: { projectId: string }) {
  const { data: previews, isLoading } = useQuery({
    queryKey: ["preview-environments", projectId],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/preview-environments`)
        .then((res) => res.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (previewId: string) =>
      api.delete(`/preview-environments/${previewId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-environments"] });
    },
  });

  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="text-gray-500">Loading preview environments...</div>;
  }

  if (!previews || previews.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No active preview environments
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {previews.map((preview: any) => (
        <div key={preview.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-semibold">PR #{preview.pullRequest}</div>
              <div className="text-sm text-gray-600">{preview.branch}</div>
            </div>
            <span
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-full",
                preview.status === "Ready"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700",
              )}
            >
              {preview.status}
            </span>
          </div>

          {preview.url && (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2"
            >
              Open preview
              <ExternalLinkIcon className="w-3 h-3" />
            </a>
          )}

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Expires {format(new Date(preview.expiresAt), "MMM d, h:mm a")}
            </span>
            <button
              onClick={() => {
                if (confirm("Delete this preview environment?")) {
                  deleteMutation.mutate(preview.id);
                }
              }}
              className="text-red-600 hover:text-red-800"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
