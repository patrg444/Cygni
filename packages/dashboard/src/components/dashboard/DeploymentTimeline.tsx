"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2,
  RotateCcw,
  Activity,
  Server,
  Cloud
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DeploymentPhase {
  name: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  startTime?: Date;
  endTime?: Date;
  message?: string;
}

interface EnvironmentStatus {
  name: string;
  version: string;
  health: "healthy" | "unhealthy" | "checking";
  trafficPercentage: number;
  instances: number;
  healthyInstances: number;
}

interface DeploymentTimelineProps {
  deploymentId?: string;
  projectId?: string;
}

export function DeploymentTimeline({ deploymentId, projectId }: DeploymentTimelineProps) {
  const [phases, setPhases] = useState<DeploymentPhase[]>([
    { name: "Build & Push", status: "completed", startTime: new Date(Date.now() - 10 * 60 * 1000), endTime: new Date(Date.now() - 8 * 60 * 1000) },
    { name: "Create Green Environment", status: "completed", startTime: new Date(Date.now() - 8 * 60 * 1000), endTime: new Date(Date.now() - 6 * 60 * 1000) },
    { name: "Health Checks", status: "completed", startTime: new Date(Date.now() - 6 * 60 * 1000), endTime: new Date(Date.now() - 5 * 60 * 1000) },
    { name: "Traffic Shifting", status: "in-progress", startTime: new Date(Date.now() - 5 * 60 * 1000), message: "Shifting traffic to green environment..." },
    { name: "Cleanup", status: "pending" },
  ]);

  const [blueEnvironment, setBlueEnvironment] = useState<EnvironmentStatus>({
    name: "Blue (Current)",
    version: "v1.2.3",
    health: "healthy",
    trafficPercentage: 25,
    instances: 4,
    healthyInstances: 4,
  });

  const [greenEnvironment, setGreenEnvironment] = useState<EnvironmentStatus>({
    name: "Green (New)",
    version: "v1.2.4",
    health: "healthy",
    trafficPercentage: 75,
    instances: 4,
    healthyInstances: 4,
  });

  const [isRollbackInProgress, setIsRollbackInProgress] = useState(false);

  // Simulate traffic shifting progress
  useEffect(() => {
    const interval = setInterval(() => {
      setGreenEnvironment(prev => {
        if (prev.trafficPercentage >= 100) {
          clearInterval(interval);
          // Update phases when traffic shift is complete
          setPhases(phases => phases.map(phase => 
            phase.name === "Traffic Shifting" 
              ? { ...phase, status: "completed", endTime: new Date() }
              : phase.name === "Cleanup"
              ? { ...phase, status: "in-progress", startTime: new Date() }
              : phase
          ));
          return prev;
        }
        const newPercentage = Math.min(prev.trafficPercentage + 5, 100);
        setBlueEnvironment(blue => ({ ...blue, trafficPercentage: 100 - newPercentage }));
        return { ...prev, trafficPercentage: newPercentage };
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleRollback = () => {
    setIsRollbackInProgress(true);
    // In a real app, this would call an API
    setTimeout(() => {
      setBlueEnvironment(prev => ({ ...prev, trafficPercentage: 100 }));
      setGreenEnvironment(prev => ({ ...prev, trafficPercentage: 0 }));
      setPhases(phases => phases.map(phase => ({
        ...phase,
        status: phase.name === "Cleanup" ? "pending" : phase.status
      })));
      setIsRollbackInProgress(false);
    }, 2000);
  };

  const getPhaseIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "in-progress":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-300" />;
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "unhealthy":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Deployment Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Deployment Progress</CardTitle>
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-600">Blue-Green Deployment</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {phases.map((phase, index) => (
              <div key={phase.name} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  {getPhaseIcon(phase.status)}
                  {index < phases.length - 1 && (
                    <div className={`w-0.5 h-16 mt-2 ${
                      phase.status === "completed" ? "bg-green-500" : "bg-gray-200"
                    }`} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{phase.name}</h4>
                    {phase.startTime && (
                      <span className="text-xs text-gray-500">
                        {formatDate(phase.startTime)}
                      </span>
                    )}
                  </div>
                  {phase.message && (
                    <p className="text-sm text-gray-600 mt-1">{phase.message}</p>
                  )}
                  {phase.endTime && phase.startTime && (
                    <p className="text-xs text-gray-500 mt-1">
                      Duration: {Math.round((phase.endTime.getTime() - phase.startTime.getTime()) / 1000)}s
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Environment Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Blue Environment */}
        <Card className={blueEnvironment.trafficPercentage === 0 ? "opacity-50" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-base">{blueEnvironment.name}</CardTitle>
              </div>
              {getHealthIcon(blueEnvironment.health)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Traffic</span>
                  <span className="font-medium">{blueEnvironment.trafficPercentage}%</span>
                </div>
                <Progress value={blueEnvironment.trafficPercentage} className="h-2" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Version</p>
                  <p className="font-medium">{blueEnvironment.version}</p>
                </div>
                <div>
                  <p className="text-gray-600">Instances</p>
                  <p className="font-medium">
                    {blueEnvironment.healthyInstances}/{blueEnvironment.instances} healthy
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Green Environment */}
        <Card className={greenEnvironment.trafficPercentage === 100 ? "ring-2 ring-green-500" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-green-500" />
                <CardTitle className="text-base">{greenEnvironment.name}</CardTitle>
              </div>
              {getHealthIcon(greenEnvironment.health)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Traffic</span>
                  <span className="font-medium">{greenEnvironment.trafficPercentage}%</span>
                </div>
                <Progress value={greenEnvironment.trafficPercentage} className="h-2" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Version</p>
                  <p className="font-medium">{greenEnvironment.version}</p>
                </div>
                <div>
                  <p className="text-gray-600">Instances</p>
                  <p className="font-medium">
                    {greenEnvironment.healthyInstances}/{greenEnvironment.instances} healthy
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Flow Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Traffic Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="text-center flex-1">
              <Activity className="h-8 w-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm font-medium">Incoming Traffic</p>
              <p className="text-xs text-gray-500">100%</p>
            </div>
            
            <div className="flex-1 space-y-2">
              {blueEnvironment.trafficPercentage > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-blue-200 rounded" style={{ width: `${blueEnvironment.trafficPercentage}%` }} />
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-600 w-10">{blueEnvironment.trafficPercentage}%</span>
                </div>
              )}
              {greenEnvironment.trafficPercentage > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-green-200 rounded" style={{ width: `${greenEnvironment.trafficPercentage}%` }} />
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-600 w-10">{greenEnvironment.trafficPercentage}%</span>
                </div>
              )}
            </div>
            
            <div className="text-center flex-1">
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="text-sm">Blue</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-sm">Green</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Deployment Actions</p>
              <p className="text-xs text-gray-500 mt-1">
                {greenEnvironment.trafficPercentage === 100 
                  ? "Deployment completed successfully"
                  : "Deployment in progress"}
              </p>
            </div>
            <button
              onClick={handleRollback}
              disabled={isRollbackInProgress || greenEnvironment.trafficPercentage === 0}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                ${isRollbackInProgress || greenEnvironment.trafficPercentage === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-red-50 text-red-600 hover:bg-red-100"
                }
              `}
            >
              {isRollbackInProgress ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {isRollbackInProgress ? "Rolling back..." : "Rollback"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}