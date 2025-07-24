"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AlertTriangle, AlertCircle, Info, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const alerts = [
  {
    id: 1,
    type: "critical",
    title: "High Error Rate",
    message: "API endpoint /api/deploy experiencing 15% error rate",
    time: "5 minutes ago",
  },
  {
    id: 2,
    type: "warning",
    title: "Memory Usage",
    message: "Server memory usage at 85% capacity",
    time: "12 minutes ago",
  },
  {
    id: 3,
    type: "info",
    title: "Scheduled Maintenance",
    message: "Database maintenance scheduled for tonight 2 AM UTC",
    time: "1 hour ago",
  },
];

const alertConfig = {
  critical: {
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  warning: {
    icon: AlertCircle,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
};

export function AlertsSummary() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Alerts</CardTitle>
          <Bell className="h-5 w-5 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = alertConfig[alert.type as keyof typeof alertConfig];
            const AlertIcon = config.icon;
            
            return (
              <div
                key={alert.id}
                className={cn(
                  "rounded-lg border p-3",
                  config.bg,
                  config.border
                )}
              >
                <div className="flex gap-3">
                  <AlertIcon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.color)} />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-gray-600">{alert.message}</p>
                    <p className="text-xs text-gray-500">{alert.time}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}