interface DeploymentStrategy {
    type: "rolling" | "canary" | "blue-green";
    status: "idle" | "in-progress" | "completed" | "failed";
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
export declare function DeploymentStrategyView({ strategy, serviceName, onPause, onResume, onPromote, onRollback, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=DeploymentStrategyView.d.ts.map