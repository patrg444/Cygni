"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DeploymentTimeline } from "@/components/dashboard/DeploymentTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { 
  Rocket, 
  GitBranch, 
  Clock, 
  CheckCircle2,
  Package,
  TrendingUp
} from "lucide-react";

// Mock deployment data
const currentDeployment = {
  id: "dep_7x9k2m4p",
  projectName: "api-gateway",
  environment: "production",
  branch: "main",
  commit: "feat: add rate limiting (7d9f2a3)",
  deployedBy: "sarah.chen@company.com",
  startedAt: new Date(Date.now() - 10 * 60 * 1000),
};

const deploymentStats = [
  {
    label: "Total Deployments",
    value: "1,247",
    change: "+12%",
    icon: Rocket,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    label: "Success Rate",
    value: "99.2%",
    change: "+0.3%",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    label: "Avg Deploy Time",
    value: "4m 32s",
    change: "-18s",
    icon: Clock,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    label: "Active Projects",
    value: "28",
    change: "+3",
    icon: Package,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
];

export default function DeploymentsPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Deployments</h1>
          <p className="mt-2 text-gray-600">
            Monitor and manage your application deployments
          </p>
        </div>

        {/* Deployment Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {deploymentStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                      <div className="flex items-center mt-2">
                        <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-xs text-green-600">{stat.change}</span>
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Current Deployment Info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Current Deployment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-sm text-gray-600">Project</p>
                <p className="font-medium flex items-center gap-2 mt-1">
                  <Package className="h-4 w-4 text-gray-400" />
                  {currentDeployment.projectName}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Environment</p>
                <p className="font-medium mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {currentDeployment.environment}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Branch</p>
                <p className="font-medium flex items-center gap-2 mt-1">
                  <GitBranch className="h-4 w-4 text-gray-400" />
                  {currentDeployment.branch}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Commit</p>
                <p className="font-medium text-sm mt-1">{currentDeployment.commit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Deployed By</p>
                <p className="font-medium text-sm mt-1">{currentDeployment.deployedBy}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Started</p>
                <p className="font-medium text-sm mt-1">
                  {currentDeployment.startedAt.toLocaleTimeString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deployment Timeline Component */}
        <DeploymentTimeline 
          deploymentId={currentDeployment.id}
          projectId={currentDeployment.projectName}
        />
      </div>
    </DashboardLayout>
  );
}