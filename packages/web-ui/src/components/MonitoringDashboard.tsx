"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ActivityLogIcon,
  RocketIcon,
  BarChartIcon,
  LightningBoltIcon,
  TimerIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";

interface ServiceMetrics {
  name: string;
  namespace: string;
  region?: string;
  autoscaling: {
    currentReplicas: number;
    targetReplicas: number;
    minReplicas: number;
    maxReplicas: number;
    currentRPS: number;
    targetRPS: number;
    cpuUtilization: number;
    memoryUtilization: number;
  };
  cost: {
    hourlyRate: number;
    dailyProjected: number;
    monthlyProjected: number;
    trend: "up" | "down" | "stable";
    percentChange: number;
  };
  health: {
    status: "healthy" | "degraded" | "unhealthy";
    uptime: number;
    lastIncident?: string;
  };
}

export function MonitoringDashboard({ projectId }: { projectId: string }) {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d">(
    "24h",
  );

  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["service-metrics", projectId, timeRange],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/metrics`, {
          params: { timeRange },
        })
        .then((res) => res.data),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">Failed to load metrics</div>
      </div>
    );
  }

  const totalCost =
    metrics?.services?.reduce(
      (acc: number, service: ServiceMetrics) => acc + service.cost.hourlyRate,
      0,
    ) || 0;

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Service Monitoring</h2>
        <div className="flex gap-2">
          {(["1h", "24h", "7d", "30d"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-colors",
                timeRange === range
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Cost Overview Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChartIcon className="w-5 h-5 text-gray-500" />
            Cost Burn-down
          </h3>
          <div className="text-2xl font-bold text-gray-900">
            ${totalCost.toFixed(2)}/hr
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-sm text-gray-500">Daily Projected</div>
            <div className="text-lg font-semibold">
              ${(totalCost * 24).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Monthly Projected</div>
            <div className="text-lg font-semibold">
              ${(totalCost * 24 * 30).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Trend</div>
            <div
              className={cn(
                "text-lg font-semibold flex items-center gap-1",
                metrics?.costTrend?.direction === "up"
                  ? "text-red-600"
                  : "text-green-600",
              )}
            >
              {metrics?.costTrend?.direction === "up" ? "" : ""}
              {metrics?.costTrend?.percentChange || 0}%
            </div>
          </div>
        </div>

        {/* Cost breakdown by service */}
        <div className="space-y-2">
          {metrics?.services?.slice(0, 5).map((service: ServiceMetrics) => (
            <div
              key={service.name}
              className="flex items-center justify-between"
            >
              <div className="text-sm">
                <span className="font-medium">{service.name}</span>
                {service.region && (
                  <span className="text-gray-500 ml-2">({service.region})</span>
                )}
              </div>
              <div className="text-sm text-gray-600">
                ${service.cost.hourlyRate.toFixed(2)}/hr
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {metrics?.services?.map((service: ServiceMetrics) => (
          <ServiceCard
            key={`${service.namespace}-${service.name}`}
            service={service}
            isSelected={selectedService === service.name}
            onClick={() => setSelectedService(service.name)}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  isSelected,
  onClick,
}: {
  service: ServiceMetrics;
  isSelected: boolean;
  onClick: () => void;
}) {
  const scalePercentage =
    (service.autoscaling.currentReplicas / service.autoscaling.maxReplicas) *
    100;
  const rpsPercentage =
    service.autoscaling.targetRPS > 0
      ? (service.autoscaling.currentRPS / service.autoscaling.targetRPS) * 100
      : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg shadow p-6 cursor-pointer transition-all",
        isSelected && "ring-2 ring-primary-500",
        "hover:shadow-lg",
      )}
    >
      {/* Service Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-semibold text-lg">{service.name}</h4>
          <div className="text-sm text-gray-500">
            {service.namespace}
            {service.region && `  ${service.region}`}
          </div>
        </div>
        <div
          className={cn(
            "px-2 py-1 rounded-full text-xs font-medium",
            service.health.status === "healthy" &&
              "bg-green-100 text-green-700",
            service.health.status === "degraded" &&
              "bg-yellow-100 text-yellow-700",
            service.health.status === "unhealthy" && "bg-red-100 text-red-700",
          )}
        >
          {service.health.status}
        </div>
      </div>

      {/* Autoscaling Metrics */}
      <div className="space-y-3">
        {/* Replicas */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Replicas</span>
            <span className="font-medium">
              {service.autoscaling.currentReplicas}/
              {service.autoscaling.maxReplicas}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${scalePercentage}%` }}
            />
          </div>
        </div>

        {/* RPS */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">RPS</span>
            <span className="font-medium">
              {service.autoscaling.currentRPS} / {service.autoscaling.targetRPS}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                rpsPercentage > 80 ? "bg-orange-500" : "bg-green-500",
              )}
              style={{ width: `${Math.min(rpsPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Resource Utilization */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">CPU</div>
            <div className="flex items-center gap-1">
              <ActivityLogIcon className="w-3 h-3 text-gray-400" />
              <span
                className={cn(
                  "text-sm font-medium",
                  service.autoscaling.cpuUtilization > 80
                    ? "text-orange-600"
                    : "text-gray-700",
                )}
              >
                {service.autoscaling.cpuUtilization}%
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Memory</div>
            <div className="flex items-center gap-1">
              <LightningBoltIcon className="w-3 h-3 text-gray-400" />
              <span
                className={cn(
                  "text-sm font-medium",
                  service.autoscaling.memoryUtilization > 80
                    ? "text-orange-600"
                    : "text-gray-700",
                )}
              >
                {service.autoscaling.memoryUtilization}%
              </span>
            </div>
          </div>
        </div>

        {/* Cost & Uptime */}
        <div className="pt-3 border-t grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Cost</div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium">
                ${service.cost.hourlyRate.toFixed(2)}/hr
              </span>
              {service.cost.trend !== "stable" && (
                <span
                  className={cn(
                    "text-xs",
                    service.cost.trend === "up"
                      ? "text-red-600"
                      : "text-green-600",
                  )}
                >
                  {service.cost.trend === "up" ? "" : ""}
                  {service.cost.percentChange}%
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Uptime</div>
            <div className="flex items-center gap-1">
              <TimerIcon className="w-3 h-3 text-gray-400" />
              <span className="text-sm font-medium">
                {service.health.uptime}%
              </span>
            </div>
          </div>
        </div>

        {/* Last Incident */}
        {service.health.lastIncident && (
          <div className="flex items-start gap-2 pt-2 text-xs text-orange-600">
            <ExclamationTriangleIcon className="w-3 h-3 mt-0.5" />
            <span>Last incident: {service.health.lastIncident}</span>
          </div>
        )}
      </div>
    </div>
  );
}
