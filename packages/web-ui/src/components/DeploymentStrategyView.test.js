"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const utils_1 = require("../test/utils");
const DeploymentStrategyView_1 = require("./DeploymentStrategyView");
(0, vitest_1.describe)("DeploymentStrategyView", () => {
    const mockHandlers = {
        onPause: vitest_1.vi.fn(),
        onResume: vitest_1.vi.fn(),
        onPromote: vitest_1.vi.fn(),
        onRollback: vitest_1.vi.fn(),
    };
    beforeEach(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)("Rendering", () => {
        (0, vitest_1.it)("should render rolling deployment", () => {
            const strategy = {
                type: "rolling",
                status: "idle",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Rolling Deployment")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("test-service")).toBeInTheDocument();
        });
        (0, vitest_1.it)("should render canary deployment", () => {
            const strategy = {
                type: "canary",
                status: "idle",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="canary-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Canary Deployment")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("canary-service")).toBeInTheDocument();
        });
        (0, vitest_1.it)("should render blue-green deployment", () => {
            const strategy = {
                type: "blue-green",
                status: "idle",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="bg-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Blue Green Deployment")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("bg-service")).toBeInTheDocument();
        });
    });
    (0, vitest_1.describe)("Status indicators", () => {
        (0, vitest_1.it)("should show correct status styling for in-progress", () => {
            const strategy = {
                type: "rolling",
                status: "in-progress",
                progress: {
                    currentStep: 2,
                    totalSteps: 5,
                    startTime: new Date().toISOString(),
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            // Check for action buttons when in progress
            (0, vitest_1.expect)(utils_1.screen.getByText("Rollback")).toBeInTheDocument();
        });
        (0, vitest_1.it)("should show canary-specific controls when in progress", () => {
            const strategy = {
                type: "canary",
                status: "in-progress",
                progress: {
                    currentStep: 2,
                    totalSteps: 5,
                    startTime: new Date().toISOString(),
                    currentTrafficSplit: {
                        stable: 75,
                        canary: 25,
                    },
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Promote")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Pause")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Rollback")).toBeInTheDocument();
        });
    });
    (0, vitest_1.describe)("Action handlers", () => {
        (0, vitest_1.it)("should call onPromote when promote button is clicked", () => {
            const strategy = {
                type: "canary",
                status: "in-progress",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            utils_1.fireEvent.click(utils_1.screen.getByText("Promote"));
            (0, vitest_1.expect)(mockHandlers.onPromote).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)("should call onPause when pause button is clicked", () => {
            const strategy = {
                type: "canary",
                status: "in-progress",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            utils_1.fireEvent.click(utils_1.screen.getByText("Pause"));
            (0, vitest_1.expect)(mockHandlers.onPause).toHaveBeenCalledTimes(1);
        });
        (0, vitest_1.it)("should call onRollback when rollback button is clicked", () => {
            const strategy = {
                type: "rolling",
                status: "in-progress",
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            utils_1.fireEvent.click(utils_1.screen.getByText("Rollback"));
            (0, vitest_1.expect)(mockHandlers.onRollback).toHaveBeenCalledTimes(1);
        });
    });
    (0, vitest_1.describe)("Details toggle", () => {
        (0, vitest_1.it)("should toggle deployment details visibility", () => {
            const strategy = {
                type: "canary",
                status: "idle",
                config: {
                    canarySteps: [10, 25, 50, 100],
                    observationTime: "5m",
                    autoPromote: true,
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            // Initially hidden
            (0, vitest_1.expect)(utils_1.screen.queryByText("Configuration")).not.toBeInTheDocument();
            // Click to show details
            utils_1.fireEvent.click(utils_1.screen.getByText("Show deployment details"));
            // Details should be visible
            (0, vitest_1.expect)(utils_1.screen.getByText("Configuration")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Traffic steps:")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("10% 25% 50% 100%")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Observation time:")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("5m")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Auto-promote:")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Enabled")).toBeInTheDocument();
            // Click to hide details
            utils_1.fireEvent.click(utils_1.screen.getByText("Hide deployment details"));
            (0, vitest_1.expect)(utils_1.screen.queryByText("Configuration")).not.toBeInTheDocument();
        });
        (0, vitest_1.it)("should show rolling deployment config details", () => {
            const strategy = {
                type: "rolling",
                status: "idle",
                config: {
                    maxUnavailable: 1,
                    maxSurge: 2,
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            utils_1.fireEvent.click(utils_1.screen.getByText("Show deployment details"));
            (0, vitest_1.expect)(utils_1.screen.getByText("Max unavailable:")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("1")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Max surge:")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("2")).toBeInTheDocument();
        });
    });
    (0, vitest_1.describe)("Progress visualization", () => {
        (0, vitest_1.it)("should render canary progress with traffic split", () => {
            const strategy = {
                type: "canary",
                status: "in-progress",
                progress: {
                    currentStep: 2,
                    totalSteps: 4,
                    startTime: new Date().toISOString(),
                    currentTrafficSplit: {
                        stable: 75,
                        canary: 25,
                    },
                },
                config: {
                    canarySteps: [10, 25, 50, 100],
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Traffic Distribution")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Canary: 25%")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("75% Stable")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("25% Canary")).toBeInTheDocument();
        });
        (0, vitest_1.it)("should render rolling progress bar", () => {
            const strategy = {
                type: "rolling",
                status: "in-progress",
                progress: {
                    currentStep: 3,
                    totalSteps: 10,
                    startTime: new Date().toISOString(),
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Rolling Update Progress")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("3/10 pods updated")).toBeInTheDocument();
        });
        (0, vitest_1.it)("should render blue-green stages", () => {
            const strategy = {
                type: "blue-green",
                status: "in-progress",
                progress: {
                    currentStep: 2,
                    totalSteps: 4,
                    startTime: new Date().toISOString(),
                },
            };
            (0, utils_1.render)(<DeploymentStrategyView_1.DeploymentStrategyView strategy={strategy} serviceName="test-service" {...mockHandlers}/>);
            (0, vitest_1.expect)(utils_1.screen.getByText("Preparing Green")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Testing Green")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Switching Traffic")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Complete")).toBeInTheDocument();
        });
    });
});
//# sourceMappingURL=DeploymentStrategyView.test.js.map