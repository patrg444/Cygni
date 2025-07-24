"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricsOverview } from "@/components/dashboard/MetricsOverview";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { BillingOverview } from "@/components/dashboard/BillingOverview";
import { AlertsSummary } from "@/components/dashboard/AlertsSummary";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor your Cygni platform performance and health
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <div className="lg:col-span-2 xl:col-span-2">
            <MetricsOverview />
          </div>
          <div>
            <SystemHealth />
          </div>
        </div>

        {/* Secondary Grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <div className="lg:col-span-1">
            <BillingOverview />
          </div>
          <div className="lg:col-span-1">
            <AlertsSummary />
          </div>
          <div className="xl:col-span-1 lg:col-span-2">
            <RecentActivity />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
