"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const services = [
  { name: "API Server", status: "operational", uptime: 99.99 },
  { name: "Database", status: "operational", uptime: 99.95 },
  { name: "Redis Cache", status: "operational", uptime: 100 },
  { name: "CDN", status: "degraded", uptime: 98.2 },
  { name: "Email Service", status: "operational", uptime: 99.8 },
];

const statusConfig = {
  operational: {
    icon: CheckCircle,
    color: "text-green-500",
    bg: "bg-green-50",
    label: "Operational",
  },
  degraded: {
    icon: AlertCircle,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    label: "Degraded",
  },
  down: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50",
    label: "Down",
  },
};

export function SystemHealth() {
  const overallStatus = services.some(s => s.status === "down")
    ? "down"
    : services.some(s => s.status === "degraded")
    ? "degraded"
    : "operational";

  const config = statusConfig[overallStatus];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>System Health</CardTitle>
          <div className={cn("flex items-center gap-2", config.color)}>
            <StatusIcon className="h-5 w-5" />
            <span className="text-sm font-medium">{config.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((service) => {
            const serviceConfig = statusConfig[service.status as keyof typeof statusConfig];
            const ServiceIcon = serviceConfig.icon;
            
            return (
              <div
                key={service.name}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <ServiceIcon className={cn("h-4 w-4", serviceConfig.color)} />
                  <span className="text-sm font-medium">{service.name}</span>
                </div>
                <span className="text-sm text-gray-600">
                  {service.uptime}% uptime
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}