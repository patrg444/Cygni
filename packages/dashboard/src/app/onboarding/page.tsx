"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { OnboardingFeedback } from "@/components/onboarding/OnboardingFeedback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Clock, Users } from "lucide-react";

interface OnboardingAnalytics {
  totalUsers: number;
  completedOnboarding: number;
  averageCompletionTime: number;
  stepCompletionRates: Record<string, number>;
  dropOffPoints: string[];
}

export default function OnboardingPage() {
  // Fetch onboarding status
  const { data: status } = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: async () => {
      const response = await fetch("/api/onboarding/status", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch onboarding status");
      return response.json();
    },
  });

  // Fetch analytics (admin only)
  const { data: analytics } = useQuery<OnboardingAnalytics>({
    queryKey: ["onboarding", "analytics"],
    queryFn: async () => {
      const response = await fetch("/api/onboarding/analytics", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
    enabled: false, // Only fetch if user is admin
  });

  const completedSteps = status?.progress?.completedSteps || [];

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Getting Started</h1>
          <p className="mt-2 text-gray-600">
            Complete these steps to get the most out of Cygni
          </p>
        </div>

        <Tabs defaultValue="checklist" className="space-y-6">
          <TabsList>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="progress">Your Progress</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            {analytics && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
          </TabsList>

          <TabsContent value="checklist">
            <OnboardingChecklist />
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Onboarding Journey</CardTitle>
                <CardDescription>
                  Track your progress through the onboarding process
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                        <div className="flex items-center gap-3">
                          <Trophy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-sm text-blue-600 dark:text-blue-400">Progress</p>
                            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                              {status.tips.progress}%
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="h-8 w-8 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="text-sm text-green-600 dark:text-green-400">Completed Steps</p>
                            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                              {completedSteps.length} / {status.steps.length}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
                        <div className="flex items-center gap-3">
                          <Clock className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                          <div>
                            <p className="text-sm text-purple-600 dark:text-purple-400">Started</p>
                            <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                              {new Date(status.progress.startedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">Step Details</h3>
                      <div className="space-y-3">
                        {status.steps.map((step: any) => (
                          <div key={step.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-2 w-2 rounded-full ${
                                  step.completed ? "bg-green-500" : "bg-gray-300"
                                }`}
                              />
                              <span className={step.completed ? "text-muted-foreground" : ""}>
                                {step.title}
                              </span>
                            </div>
                            {step.required && (
                              <Badge variant="secondary">Required</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <OnboardingFeedback completedSteps={completedSteps} />
          </TabsContent>

          {analytics && (
            <TabsContent value="analytics" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Team Onboarding Analytics</CardTitle>
                  <CardDescription>
                    Overview of how your team is progressing through onboarding
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Total Users</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">{analytics.totalUsers}</p>
                    </div>

                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Completed</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">{analytics.completedOnboarding}</p>
                    </div>

                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Completion Rate</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">
                        {Math.round((analytics.completedOnboarding / analytics.totalUsers) * 100)}%
                      </p>
                    </div>

                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Avg. Time</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">{analytics.averageCompletionTime}m</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-3">Step Completion Rates</h4>
                      <div className="space-y-2">
                        {Object.entries(analytics.stepCompletionRates).map(([step, rate]) => (
                          <div key={step}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="capitalize">{step.replace(/_/g, " ")}</span>
                              <span className="font-medium">{rate}%</span>
                            </div>
                            <Progress value={rate} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {analytics.dropOffPoints.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3">Common Drop-off Points</h4>
                        <div className="space-y-2">
                          {analytics.dropOffPoints.map((point) => (
                            <div key={point} className="p-3 rounded-lg bg-red-50 dark:bg-red-950">
                              <p className="text-sm capitalize">{point.replace(/_/g, " ")}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}