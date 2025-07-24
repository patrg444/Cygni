"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowUpRight, ArrowDownRight, Activity, Users, DollarSign, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatCurrency } from "@/lib/utils";

const metrics = [
  {
    name: "Total Users",
    value: 2489,
    change: 12.5,
    trend: "up",
    icon: Users,
  },
  {
    name: "Active Projects",
    value: 127,
    change: 8.3,
    trend: "up",
    icon: Activity,
  },
  {
    name: "Monthly Revenue",
    value: 48932,
    change: -2.1,
    trend: "down",
    icon: DollarSign,
    format: "currency",
  },
  {
    name: "API Requests",
    value: 1284932,
    change: 24.7,
    trend: "up",
    icon: Zap,
  },
];

export function MetricsOverview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {metrics.map((metric) => (
            <div
              key={metric.name}
              className="rounded-lg border p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gray-100 p-2">
                    <metric.icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{metric.name}</p>
                    <p className="text-2xl font-bold">
                      {metric.format === "currency"
                        ? formatCurrency(metric.value)
                        : formatNumber(metric.value)}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    metric.trend === "up" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {metric.trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(metric.change)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}