"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import {
  LayoutDashboard,
  Activity,
  DollarSign,
  Users,
  Settings,
  Shield,
  AlertCircle,
  FileText,
  BarChart3,
  LogOut,
  Rocket,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Getting Started", href: "/onboarding", icon: Rocket },
  { name: "Deployments", href: "/deployments", icon: GitBranch },
  { name: "Activity", href: "/activity", icon: Activity },
  { name: "Billing", href: "/billing", icon: DollarSign },
  { name: "Users", href: "/users", icon: Users },
  { name: "Metrics", href: "/metrics", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: AlertCircle },
  { name: "Security", href: "/security", icon: Shield },
  { name: "Logs", href: "/logs", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center px-6 border-b">
            <h1 className="text-2xl font-bold text-gray-900">Cygni</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-300" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Admin User</p>
                <p className="text-xs text-gray-500">admin@cygni.dev</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="min-h-screen">{children}</main>
      </div>
      
      {/* Onboarding Wizard */}
      <OnboardingWizard />
    </div>
  );
}