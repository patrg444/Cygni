'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  MixIcon,
  UpdateIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';

interface DeploymentStrategy {
  type: 'rolling' | 'canary' | 'blue-green';
  status: 'idle' | 'in-progress' | 'completed' | 'failed';
  config?: {
    maxUnavailable?: number;
    maxSurge?: number;
    canarySteps?: number[];
    observationTime?: string;
    autoPromote?: boolean;
  };
  progress?: {
    currentStep: number;
    totalSteps: number;
    startTime: string;
    estimatedCompletion?: string;
    currentTrafficSplit?: {
      stable: number;
      canary: number;
    };
  };
}

interface Props {
  strategy: DeploymentStrategy;
  serviceName: string;
  onPause?: () => void;
  onResume?: () => void;
  onPromote?: () => void;
  onRollback?: () => void;
}

export function DeploymentStrategyView({
  strategy,
  serviceName,
  onPause,
  onResume,
  onPromote,
  onRollback,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);

  const renderStrategyIcon = () => {
    switch (strategy.type) {
      case 'canary':
        return <MixIcon className="w-5 h-5" />;
      case 'blue-green':
        return <UpdateIcon className="w-5 h-5" />;
      default:
        return <UpdateIcon className="w-5 h-5 animate-spin" />;
    }
  };

  const renderStrategyProgress = () => {
    if (!strategy.progress || strategy.status === 'idle') return null;

    switch (strategy.type) {
      case 'canary':
        return <CanaryProgress strategy={strategy} />;
      case 'blue-green':
        return <BlueGreenProgress strategy={strategy} />;
      default:
        return <RollingProgress strategy={strategy} />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            strategy.status === 'in-progress' && "bg-blue-100 text-blue-600",
            strategy.status === 'completed' && "bg-green-100 text-green-600",
            strategy.status === 'failed' && "bg-red-100 text-red-600",
            strategy.status === 'idle' && "bg-gray-100 text-gray-600"
          )}>
            {renderStrategyIcon()}
          </div>
          <div>
            <h3 className="font-semibold text-lg capitalize">
              {strategy.type.replace('-', ' ')} Deployment
            </h3>
            <p className="text-sm text-gray-600">{serviceName}</p>
          </div>
        </div>

        {/* Action buttons */}
        {strategy.status === 'in-progress' && (
          <div className="flex gap-2">
            {strategy.type === 'canary' && (
              <>
                <button
                  onClick={onPromote}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Promote
                </button>
                <button
                  onClick={onPause}
                  className="px-3 py-1 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                >
                  Pause
                </button>
              </>
            )}
            <button
              onClick={onRollback}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Rollback
            </button>
          </div>
        )}
      </div>

      {/* Progress visualization */}
      {renderStrategyProgress()}

      {/* Details toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <InfoCircledIcon className="w-4 h-4" />
        {showDetails ? 'Hide' : 'Show'} deployment details
      </button>

      {/* Configuration details */}
      {showDetails && strategy.config && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
          <div className="font-medium text-gray-700 mb-2">Configuration</div>
          {strategy.type === 'canary' && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Traffic steps:</span>
                <span className="font-medium">
                  {strategy.config.canarySteps?.join('% → ')}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Observation time:</span>
                <span className="font-medium">{strategy.config.observationTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Auto-promote:</span>
                <span className="font-medium">
                  {strategy.config.autoPromote ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </>
          )}
          {strategy.type === 'rolling' && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Max unavailable:</span>
                <span className="font-medium">{strategy.config.maxUnavailable || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Max surge:</span>
                <span className="font-medium">{strategy.config.maxSurge || '25%'}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CanaryProgress({ strategy }: { strategy: DeploymentStrategy }) {
  const { progress, config } = strategy;
  if (!progress) return null;

  const steps = config?.canarySteps || [10, 25, 50, 75, 100];
  const currentStepIndex = Math.floor(
    (progress.currentTrafficSplit?.canary || 0) / (100 / steps.length)
  );

  return (
    <div className="space-y-4">
      {/* Traffic split visualization */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600">Traffic Distribution</span>
          <span className="font-medium">
            Canary: {progress.currentTrafficSplit?.canary || 0}%
          </span>
        </div>
        <div className="flex h-8 rounded-lg overflow-hidden">
          <div
            className="bg-green-500 flex items-center justify-center text-white text-sm font-medium transition-all duration-500"
            style={{ width: `${progress.currentTrafficSplit?.stable || 100}%` }}
          >
            {progress.currentTrafficSplit?.stable || 100}% Stable
          </div>
          <div
            className="bg-blue-500 flex items-center justify-center text-white text-sm font-medium transition-all duration-500"
            style={{ width: `${progress.currentTrafficSplit?.canary || 0}%` }}
          >
            {progress.currentTrafficSplit?.canary > 0 && 
              `${progress.currentTrafficSplit?.canary}% Canary`
            }
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600">Deployment Progress</span>
          <span className="font-medium">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <div key={index} className="flex-1">
              <div className="flex items-center">
                <div
                  className={cn(
                    "w-full h-2 rounded-full transition-colors",
                    index < currentStepIndex && "bg-green-500",
                    index === currentStepIndex && "bg-blue-500",
                    index > currentStepIndex && "bg-gray-200"
                  )}
                />
                {index < steps.length - 1 && (
                  <div className="w-2 h-0.5 bg-gray-300" />
                )}
              </div>
              <div className="text-xs text-center mt-1 text-gray-600">
                {step}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time estimate */}
      {progress.estimatedCompletion && (
        <div className="text-sm text-gray-600">
          Estimated completion: {new Date(progress.estimatedCompletion).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function BlueGreenProgress({ strategy }: { strategy: DeploymentStrategy }) {
  const { progress } = strategy;
  if (!progress) return null;

  const stages = ['Preparing Green', 'Testing Green', 'Switching Traffic', 'Complete'];
  const currentStage = progress.currentStep - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => (
          <div
            key={index}
            className={cn(
              "flex-1 text-center",
              index <= currentStage ? "text-blue-600" : "text-gray-400"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center",
              index < currentStage && "bg-green-100",
              index === currentStage && "bg-blue-100",
              index > currentStage && "bg-gray-100"
            )}>
              {index < currentStage ? (
                <CheckCircledIcon className="w-6 h-6 text-green-600" />
              ) : index === currentStage ? (
                <UpdateIcon className="w-6 h-6 text-blue-600 animate-spin" />
              ) : (
                <div className="w-3 h-3 bg-gray-400 rounded-full" />
              )}
            </div>
            <div className="text-xs font-medium">{stage}</div>
          </div>
        ))}
      </div>

      {/* Connection lines */}
      <div className="relative -mt-8 mb-4">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-blue-600 transition-all duration-500"
          style={{ width: `${(currentStage / (stages.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function RollingProgress({ strategy }: { strategy: DeploymentStrategy }) {
  const { progress } = strategy;
  if (!progress) return null;

  const percentage = (progress.currentStep / progress.totalSteps) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Rolling Update Progress</span>
        <span className="font-medium">
          {progress.currentStep}/{progress.totalSteps} pods updated
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}