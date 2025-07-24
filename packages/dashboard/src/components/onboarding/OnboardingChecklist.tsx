"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ChevronRight, RefreshCw, Award } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { motion } from "framer-motion";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  interactive?: any;
}

interface ChecklistData {
  checklist: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  requiredCount: number;
}

export function OnboardingChecklist() {
  const queryClient = useQueryClient();

  // Fetch checklist
  const { data, isLoading, refetch } = useQuery<ChecklistData>({
    queryKey: ["onboarding", "checklist"],
    queryFn: async () => {
      const response = await fetch("/api/onboarding/checklist", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch checklist");
      return response.json();
    },
  });

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await fetch("/api/onboarding/complete-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ stepId }),
      });
      if (!response.ok) throw new Error("Failed to complete step");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Getting Started Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const progressPercentage = (data.completedCount / data.totalCount) * 100;
  const allCompleted = data.completedCount === data.totalCount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Getting Started Checklist</CardTitle>
            <CardDescription>
              Complete these steps to get the most out of Cygni
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {data.completedCount} of {data.totalCount} completed
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {allCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
          >
            <div className="flex items-center gap-3">
              <Award className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <h4 className="font-semibold text-green-900 dark:text-green-100">
                  Congratulations! 🎉
                </h4>
                <p className="text-sm text-green-700 dark:text-green-300">
                  You&apos;ve completed all onboarding steps. You&apos;re ready to deploy amazing applications!
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <div className="space-y-2">
          {data.checklist.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div
                className={`p-4 rounded-lg border transition-colors ${
                  item.completed
                    ? "bg-muted/30 border-muted"
                    : "hover:border-primary/50 cursor-pointer"
                }`}
                onClick={() => {
                  if (!item.completed) {
                    completeStepMutation.mutate(item.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </h4>
                      {item.required && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    
                    {/* Interactive actions */}
                    {item.interactive && !item.completed && (
                      <div className="mt-3">
                        <ChecklistInteractiveAction item={item} />
                      </div>
                    )}
                  </div>
                  
                  {!item.completed && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              
              {index < data.checklist.length - 1 && (
                <Separator className="my-2" />
              )}
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistInteractiveAction({ item }: { item: ChecklistItem }) {
  const { interactive } = item;
  
  if (!interactive) return null;

  switch (interactive.type) {
    case "button":
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            if (interactive.endpoint) {
              // Handle action
              console.log("Action:", interactive.endpoint);
            }
          }}
        >
          {interactive.label}
        </Button>
      );
      
    case "guide":
      return (
        <Button
          size="sm"
          variant="outline"
          asChild
          onClick={(e) => e.stopPropagation()}
        >
          <a href={interactive.link} target="_blank" rel="noopener noreferrer">
            {interactive.label}
          </a>
        </Button>
      );
      
    case "tutorial":
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            // Open tutorial modal or expand content
            console.log("Show tutorial:", interactive.content);
          }}
        >
          {interactive.label}
        </Button>
      );
      
    default:
      return null;
  }
}