import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../test/utils";
import { DeploymentStrategyView } from "./DeploymentStrategyView";

describe("DeploymentStrategyView", () => {
  const mockHandlers = {
    onPause: vi.fn(),
    onResume: vi.fn(),
    onPromote: vi.fn(),
    onRollback: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render rolling deployment", () => {
      const strategy = {
        type: "rolling" as const,
        status: "idle" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Rolling Deployment")).toBeInTheDocument();
      expect(screen.getByText("test-service")).toBeInTheDocument();
    });

    it("should render canary deployment", () => {
      const strategy = {
        type: "canary" as const,
        status: "idle" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="canary-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Canary Deployment")).toBeInTheDocument();
      expect(screen.getByText("canary-service")).toBeInTheDocument();
    });

    it("should render blue-green deployment", () => {
      const strategy = {
        type: "blue-green" as const,
        status: "idle" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="bg-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Blue Green Deployment")).toBeInTheDocument();
      expect(screen.getByText("bg-service")).toBeInTheDocument();
    });
  });

  describe("Status indicators", () => {
    it("should show correct status styling for in-progress", () => {
      const strategy = {
        type: "rolling" as const,
        status: "in-progress" as const,
        progress: {
          currentStep: 2,
          totalSteps: 5,
          startTime: new Date().toISOString(),
        },
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      // Check for action buttons when in progress
      expect(screen.getByText("Rollback")).toBeInTheDocument();
    });

    it("should show canary-specific controls when in progress", () => {
      const strategy = {
        type: "canary" as const,
        status: "in-progress" as const,
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

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Promote")).toBeInTheDocument();
      expect(screen.getByText("Pause")).toBeInTheDocument();
      expect(screen.getByText("Rollback")).toBeInTheDocument();
    });
  });

  describe("Action handlers", () => {
    it("should call onPromote when promote button is clicked", () => {
      const strategy = {
        type: "canary" as const,
        status: "in-progress" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      fireEvent.click(screen.getByText("Promote"));
      expect(mockHandlers.onPromote).toHaveBeenCalledTimes(1);
    });

    it("should call onPause when pause button is clicked", () => {
      const strategy = {
        type: "canary" as const,
        status: "in-progress" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      fireEvent.click(screen.getByText("Pause"));
      expect(mockHandlers.onPause).toHaveBeenCalledTimes(1);
    });

    it("should call onRollback when rollback button is clicked", () => {
      const strategy = {
        type: "rolling" as const,
        status: "in-progress" as const,
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      fireEvent.click(screen.getByText("Rollback"));
      expect(mockHandlers.onRollback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Details toggle", () => {
    it("should toggle deployment details visibility", () => {
      const strategy = {
        type: "canary" as const,
        status: "idle" as const,
        config: {
          canarySteps: [10, 25, 50, 100],
          observationTime: "5m",
          autoPromote: true,
        },
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      // Initially hidden
      expect(screen.queryByText("Configuration")).not.toBeInTheDocument();

      // Click to show details
      fireEvent.click(screen.getByText("Show deployment details"));

      // Details should be visible
      expect(screen.getByText("Configuration")).toBeInTheDocument();
      expect(screen.getByText("Traffic steps:")).toBeInTheDocument();
      expect(screen.getByText("10% 25% 50% 100%")).toBeInTheDocument();
      expect(screen.getByText("Observation time:")).toBeInTheDocument();
      expect(screen.getByText("5m")).toBeInTheDocument();
      expect(screen.getByText("Auto-promote:")).toBeInTheDocument();
      expect(screen.getByText("Enabled")).toBeInTheDocument();

      // Click to hide details
      fireEvent.click(screen.getByText("Hide deployment details"));
      expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    });

    it("should show rolling deployment config details", () => {
      const strategy = {
        type: "rolling" as const,
        status: "idle" as const,
        config: {
          maxUnavailable: 1,
          maxSurge: 2,
        },
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      fireEvent.click(screen.getByText("Show deployment details"));

      expect(screen.getByText("Max unavailable:")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("Max surge:")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  describe("Progress visualization", () => {
    it("should render canary progress with traffic split", () => {
      const strategy = {
        type: "canary" as const,
        status: "in-progress" as const,
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

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Traffic Distribution")).toBeInTheDocument();
      expect(screen.getByText("Canary: 25%")).toBeInTheDocument();
      expect(screen.getByText("75% Stable")).toBeInTheDocument();
      expect(screen.getByText("25% Canary")).toBeInTheDocument();
    });

    it("should render rolling progress bar", () => {
      const strategy = {
        type: "rolling" as const,
        status: "in-progress" as const,
        progress: {
          currentStep: 3,
          totalSteps: 10,
          startTime: new Date().toISOString(),
        },
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Rolling Update Progress")).toBeInTheDocument();
      expect(screen.getByText("3/10 pods updated")).toBeInTheDocument();
    });

    it("should render blue-green stages", () => {
      const strategy = {
        type: "blue-green" as const,
        status: "in-progress" as const,
        progress: {
          currentStep: 2,
          totalSteps: 4,
          startTime: new Date().toISOString(),
        },
      };

      render(
        <DeploymentStrategyView
          strategy={strategy}
          serviceName="test-service"
          {...mockHandlers}
        />,
      );

      expect(screen.getByText("Preparing Green")).toBeInTheDocument();
      expect(screen.getByText("Testing Green")).toBeInTheDocument();
      expect(screen.getByText("Switching Traffic")).toBeInTheDocument();
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });
  });
});
