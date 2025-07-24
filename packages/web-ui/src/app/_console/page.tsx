"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CodeIcon,
  GearIcon,
  RocketIcon,
  CubeIcon,
  FileTextIcon,
  ActivityLogIcon,
} from "@radix-ui/react-icons";
import { ProjectOverview } from "@/components/console/ProjectOverview";
import { ApiEndpointsList } from "@/components/console/ApiEndpointsList";
import { RuntimeConfig } from "@/components/console/RuntimeConfig";
import { DeploymentConfig } from "@/components/console/DeploymentConfig";

type TabId = "overview" | "endpoints" | "runtime" | "deployment";

export default function ConsolePage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Fetch project analysis data
  const {
    data: projectData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project-analysis"],
    queryFn: async () => {
      // In a real app, this would call the API
      // For now, we'll simulate calling the CLI analyze command
      const response = await fetch("/api/project/analyze");
      if (!response.ok) throw new Error("Failed to analyze project");
      return response.json();
    },
  });

  const tabs = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: <CubeIcon className="w-4 h-4" />,
    },
    {
      id: "endpoints" as const,
      label: "API Endpoints",
      icon: <CodeIcon className="w-4 h-4" />,
    },
    {
      id: "runtime" as const,
      label: "Runtime Config",
      icon: <FileTextIcon className="w-4 h-4" />,
    },
    {
      id: "deployment" as const,
      label: "Deployment",
      icon: <RocketIcon className="w-4 h-4" />,
    },
  ];

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Failed to analyze project
            </h2>
            <p className="text-red-600">{(error as Error).message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                CloudExpress Console
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Analyze, configure, and deploy your application
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                <ActivityLogIcon className="w-4 h-4" />
                View Logs
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">
                <RocketIcon className="w-4 h-4" />
                Deploy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors
                  ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="text-gray-600">Analyzing project...</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "overview" && <ProjectOverview data={projectData} />}
            {activeTab === "endpoints" && (
              <ApiEndpointsList endpoints={projectData?.endpoints || []} />
            )}
            {activeTab === "runtime" && (
              <RuntimeConfig
                initialConfig={projectData?.runtimeConfig}
                framework={projectData?.framework}
              />
            )}
            {activeTab === "deployment" && (
              <DeploymentConfig
                framework={projectData?.framework}
                runtimeConfig={projectData?.runtimeConfig}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
