"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, CreditCard } from "lucide-react";

export function BillingOverview() {
  const currentMonth = {
    revenue: 48932,
    growth: 12.5,
    activeSubscriptions: 892,
    churnRate: 2.1,
    averageRevenue: 54.82,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Billing Overview</CardTitle>
          <CreditCard className="h-5 w-5 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600">Monthly Recurring Revenue</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">{formatCurrency(currentMonth.revenue)}</p>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>{currentMonth.growth}%</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-600">Active Subscriptions</p>
              <p className="text-lg font-semibold">{currentMonth.activeSubscriptions}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-600">Avg. Revenue/User</p>
              <p className="text-lg font-semibold">{formatCurrency(currentMonth.averageRevenue)}</p>
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Churn Rate</span>
              <span className="text-sm font-medium text-red-600">{currentMonth.churnRate}%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}