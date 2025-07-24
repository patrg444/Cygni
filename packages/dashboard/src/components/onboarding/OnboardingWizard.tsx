"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, ChevronRight, X, Mail, Rocket, Users, Globe, Sparkles, Skip } from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  interactive?: {
    type: string;
    label: string;
    endpoint?: string;
    content?: any;
    fields?: any[];
    items?: any[];
  };
}

interface OnboardingProgress {
  currentStep: string;
  completedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
}

interface OnboardingData {
  initialized: boolean;
  progress: OnboardingProgress;
  steps: OnboardingStep[];
  tips: {
    currentTip: string;
    nextAction: string;
    progress: number;
  };
}

const STEP_ICONS = {
  welcome: Sparkles,
  verify_email: Mail,
  create_project: Rocket,
  invite_team: Users,
  setup_domain: Globe,
  explore_features: CheckCircle2,
};

export function OnboardingWizard() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Fetch onboarding status
  const { data, isLoading } = useQuery<OnboardingData>({
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

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async ({ stepId, metadata }: { stepId: string; metadata?: any }) => {
      const response = await fetch("/api/onboarding/complete-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ stepId, metadata }),
      });
      if (!response.ok) throw new Error("Failed to complete step");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  // Skip onboarding mutation
  const skipOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/onboarding/skip", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to skip onboarding");
      return response.json();
    },
    onSuccess: () => {
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  useEffect(() => {
    if (data?.steps) {
      const index = data.steps.findIndex(step => step.id === data.progress.currentStep);
      setCurrentStepIndex(index >= 0 ? index : 0);
    }
  }, [data]);

  if (isLoading || !data) return null;

  // Don't show if onboarding is complete
  if (data.progress.completedAt || !isOpen) return null;

  const currentStep = data.steps[currentStepIndex];
  const Icon = STEP_ICONS[currentStep?.id as keyof typeof STEP_ICONS] || Circle;

  const handleStepComplete = async () => {
    if (currentStep) {
      await completeStepMutation.mutateAsync({ stepId: currentStep.id });
      
      // Move to next incomplete step
      const nextIncompleteIndex = data.steps.findIndex(
        (step, index) => index > currentStepIndex && !step.completed
      );
      
      if (nextIncompleteIndex >= 0) {
        setCurrentStepIndex(nextIncompleteIndex);
      }
    }
  };

  const handleSkip = () => {
    skipOnboardingMutation.mutate();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed bottom-6 right-6 w-96 z-50"
        >
          <Card className="shadow-lg border-2">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Getting Started</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{data.tips.progress}% Complete</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Progress value={data.tips.progress} className="mt-3 h-2" />
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {currentStep?.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                  {currentStep?.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStep?.description}
                </p>
              </div>

              {/* Interactive content based on step type */}
              {currentStep?.interactive && (
                <OnboardingInteractive 
                  step={currentStep} 
                  onComplete={handleStepComplete}
                />
              )}

              {/* Current tip */}
              <Alert>
                <AlertDescription>{data.tips.currentTip}</AlertDescription>
              </Alert>

              {/* Step indicators */}
              <div className="flex items-center justify-center gap-1">
                {data.steps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStepIndex(index)}
                    className={`h-2 rounded-full transition-all ${
                      step.completed
                        ? "w-2 bg-green-500"
                        : index === currentStepIndex
                        ? "w-6 bg-primary"
                        : "w-2 bg-gray-300"
                    }`}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                >
                  <Skip className="h-4 w-4 mr-1" />
                  Skip tour
                </Button>
                
                <div className="flex gap-2">
                  {currentStepIndex > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
                    >
                      Previous
                    </Button>
                  )}
                  
                  {!currentStep?.completed && (
                    <Button
                      size="sm"
                      onClick={handleStepComplete}
                      disabled={completeStepMutation.isPending}
                    >
                      {completeStepMutation.isPending ? "Completing..." : "Mark Complete"}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  
                  {currentStep?.completed && currentStepIndex < data.steps.length - 1 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const nextIndex = currentStepIndex + 1;
                        if (nextIndex < data.steps.length) {
                          setCurrentStepIndex(nextIndex);
                        }
                      }}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Interactive component for different step types
function OnboardingInteractive({ 
  step, 
  onComplete 
}: { 
  step: OnboardingStep; 
  onComplete: () => void;
}) {
  const { interactive } = step;
  
  if (!interactive) return null;

  switch (interactive.type) {
    case "button":
      return (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            // Handle button action (e.g., resend email)
            if (interactive.endpoint) {
              fetch(interactive.endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
              });
            }
          }}
        >
          {interactive.label}
        </Button>
      );

    case "tutorial":
      return (
        <Card className="p-4 bg-muted/50">
          <h4 className="font-semibold text-sm mb-2">{interactive.content.title}</h4>
          <ol className="text-sm space-y-1">
            {interactive.content.steps.map((step: string, index: number) => (
              <li key={index} className="flex gap-2">
                <span className="text-muted-foreground">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      );

    case "cards":
      return (
        <div className="grid grid-cols-3 gap-2">
          {interactive.items.map((item: any) => (
            <a
              key={item.title}
              href={item.link}
              className="p-3 rounded-lg border hover:border-primary transition-colors text-center"
            >
              <div className="text-xs font-medium">{item.title}</div>
            </a>
          ))}
        </div>
      );

    default:
      return null;
  }
}