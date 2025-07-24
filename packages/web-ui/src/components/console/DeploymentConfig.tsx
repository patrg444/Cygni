"use client";

import { useState } from "react";
import {
  RocketIcon,
  GearIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
  TimerIcon,
  TargetIcon,
} from "@radix-ui/react-icons";

interface DeploymentConfigProps {
  framework?: string;
  runtimeConfig?: any;
}

export function DeploymentConfig({
  framework,
  runtimeConfig,
}: DeploymentConfigProps) {
  const [deploymentStrategy, setDeploymentStrategy] = useState("rolling");
  const [environment, setEnvironment] = useState("production");
  const [autoScaling, setAutoScaling] = useState({
    enabled: true,
    minInstances: 2,
    maxInstances: 10,
    targetCPU: 70,
  });
  const [healthCheck, setHealthCheck] = useState({
    path: "/health",
    interval: 30,
    timeout: 5,
    retries: 3,
  });

  const strategies = [
    {
      id: "rolling",
      name: "Rolling Update",
      description: "Gradually replace old instances with new ones",
      icon: <GearIcon className="w-5 h-5" />,
    },
    {
      id: "blue-green",
      name: "Blue-Green",
      description: "Switch traffic between two identical environments",
      icon: <TargetIcon className="w-5 h-5" />,
    },
    {
      id: "canary",
      name: "Canary Release",
      description: "Gradually roll out to a percentage of users",
      icon: <TimerIcon className="w-5 h-5" />,
    },
  ];

  const environments = [
    {
      id: "development",
      name: "Development",
      color: "bg-gray-100 text-gray-800",
    },
    { id: "staging", name: "Staging", color: "bg-yellow-100 text-yellow-800" },
    {
      id: "production",
      name: "Production",
      color: "bg-green-100 text-green-800",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Environment Selection */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Target Environment</h2>
        <div className="grid grid-cols-3 gap-4">
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => setEnvironment(env.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                environment === env.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{env.name}</span>
                {environment === env.id && (
                  <CheckCircledIcon className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${env.color}`}
              >
                {env.id.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Deployment Strategy */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Deployment Strategy</h2>
        <div className="space-y-4">
          {strategies.map((strategy) => (
            <label
              key={strategy.id}
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                deploymentStrategy === strategy.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="strategy"
                value={strategy.id}
                checked={deploymentStrategy === strategy.id}
                onChange={(e) => setDeploymentStrategy(e.target.value)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  {strategy.icon}
                  <span className="font-medium">{strategy.name}</span>
                </div>
                <p className="text-sm text-gray-600">{strategy.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Strategy-specific settings */}
        {deploymentStrategy === "rolling" && (
          <div className="mt-6 pt-6 border-t space-y-4">
            <h3 className="font-medium mb-3">Rolling Update Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Unavailable
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue="1"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Surge
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue="25%"
                />
              </div>
            </div>
          </div>
        )}

        {deploymentStrategy === "canary" && (
          <div className="mt-6 pt-6 border-t space-y-4">
            <h3 className="font-medium mb-3">Canary Release Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Traffic Steps (%)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue="10, 25, 50, 100"
                  placeholder="e.g., 10, 25, 50, 100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observation Time
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  defaultValue="5m"
                  placeholder="e.g., 5m, 30s"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-promote"
                  className="rounded"
                  defaultChecked
                />
                <label htmlFor="auto-promote" className="text-sm text-gray-700">
                  Auto-promote when metrics are healthy
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Health Check Configuration */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">
          Health Check Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Health Check Path
            </label>
            <input
              type="text"
              value={healthCheck.path}
              onChange={(e) =>
                setHealthCheck({ ...healthCheck, path: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-md"
              placeholder="/health"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check Interval (seconds)
            </label>
            <input
              type="number"
              value={healthCheck.interval}
              onChange={(e) =>
                setHealthCheck({
                  ...healthCheck,
                  interval: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border rounded-md"
              min="5"
              max="300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timeout (seconds)
            </label>
            <input
              type="number"
              value={healthCheck.timeout}
              onChange={(e) =>
                setHealthCheck({
                  ...healthCheck,
                  timeout: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border rounded-md"
              min="1"
              max="60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retries
            </label>
            <input
              type="number"
              value={healthCheck.retries}
              onChange={(e) =>
                setHealthCheck({
                  ...healthCheck,
                  retries: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 border rounded-md"
              min="1"
              max="10"
            />
          </div>
        </div>
      </div>

      {/* Auto-scaling Configuration */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Auto-scaling Configuration</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoScaling.enabled}
              onChange={(e) =>
                setAutoScaling({ ...autoScaling, enabled: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700">Enable auto-scaling</span>
          </label>
        </div>

        {autoScaling.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Instances
              </label>
              <input
                type="number"
                value={autoScaling.minInstances}
                onChange={(e) =>
                  setAutoScaling({
                    ...autoScaling,
                    minInstances: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border rounded-md"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Instances
              </label>
              <input
                type="number"
                value={autoScaling.maxInstances}
                onChange={(e) =>
                  setAutoScaling({
                    ...autoScaling,
                    maxInstances: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border rounded-md"
                min="1"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target CPU Utilization (%)
              </label>
              <input
                type="range"
                value={autoScaling.targetCPU}
                onChange={(e) =>
                  setAutoScaling({
                    ...autoScaling,
                    targetCPU: parseInt(e.target.value),
                  })
                }
                className="w-full"
                min="10"
                max="100"
                step="5"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10%</span>
                <span className="font-medium text-gray-900">
                  {autoScaling.targetCPU}%
                </span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deployment Summary */}
      <div className="bg-blue-50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <InfoCircledIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-blue-900">
              Deployment Configuration Summary
            </p>
            <ul className="space-y-1 text-blue-800">
              <li>
                • Environment:{" "}
                <span className="font-medium">{environment}</span>
              </li>
              <li>
                • Strategy:{" "}
                <span className="font-medium">
                  {strategies.find((s) => s.id === deploymentStrategy)?.name}
                </span>
              </li>
              <li>
                • Health check:{" "}
                <span className="font-medium">{healthCheck.path}</span>
              </li>
              {autoScaling.enabled && (
                <li>
                  • Auto-scaling:{" "}
                  <span className="font-medium">
                    {autoScaling.minInstances}-{autoScaling.maxInstances}{" "}
                    instances
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Deploy Button */}
      <div className="flex justify-end gap-4">
        <button className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
          Save as Draft
        </button>
        <button className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          <RocketIcon className="w-5 h-5" />
          Deploy to {environment}
        </button>
      </div>
    </div>
  );
}
