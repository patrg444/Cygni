"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Activity, GitBranch, Users, Settings, Shield } from "lucide-react";
import { formatDate } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "deployment",
    title: "New deployment to production",
    user: "Sarah Chen",
    project: "api-gateway",
    time: new Date(Date.now() - 5 * 60 * 1000),
    icon: GitBranch,
  },
  {
    id: 2,
    type: "user",
    title: "New team member added",
    user: "Admin",
    details: "john.doe@company.com joined as Developer",
    time: new Date(Date.now() - 15 * 60 * 1000),
    icon: Users,
  },
  {
    id: 3,
    type: "config",
    title: "Environment variables updated",
    user: "Mike Johnson",
    project: "web-app",
    time: new Date(Date.now() - 45 * 60 * 1000),
    icon: Settings,
  },
  {
    id: 4,
    type: "security",
    title: "Security scan completed",
    user: "System",
    details: "No vulnerabilities found",
    time: new Date(Date.now() - 2 * 60 * 60 * 1000),
    icon: Shield,
  },
];

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Activity className="h-5 w-5 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const ActivityIcon = activity.icon;
            
            return (
              <div key={activity.id} className="flex gap-3">
                <div className="rounded-lg bg-gray-100 p-2 h-fit">
                  <ActivityIcon className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-gray-600">
                    by {activity.user}
                    {activity.project && ` • ${activity.project}`}
                    {activity.details && ` • ${activity.details}`}
                  </p>
                  <p className="text-xs text-gray-500">{formatDate(activity.time)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}