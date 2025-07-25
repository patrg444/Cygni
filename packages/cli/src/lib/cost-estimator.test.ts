import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostEstimator } from "./cost-estimator";

// Mock AWS SDK clients
vi.mock("@aws-sdk/client-pricing", () => ({
  PricingClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  GetProductsCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  DescribeTaskDefinitionCommand: vi.fn(),
  DescribeServicesCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-elastic-load-balancing-v2", () => ({
  ElasticLoadBalancingV2Client: vi.fn(() => ({
    send: vi.fn(),
  })),
  DescribeLoadBalancersCommand: vi.fn(),
}));

describe("CostEstimator", () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = new CostEstimator("us-east-1");
  });

  describe("estimateDeploymentCost", () => {
    it("should calculate deployment cost for a task definition", async () => {
      // Mock ECS client response
      const mockEcsClient = {
        send: vi.fn().mockResolvedValue({
          taskDefinition: {
            cpu: "1024", // 1 vCPU
            memory: "2048", // 2 GB
          },
        }),
      };

      // @ts-ignore - accessing private property for testing
      estimator.ecsClient = mockEcsClient;

      const cost = await estimator.estimateDeploymentCost(
        "arn:aws:ecs:us-east-1:123456789:task-definition/app:1",
        2, // 2 tasks
        "us-east-1"
      );

      expect(cost.monthly).toBeGreaterThan(0);
      expect(cost.breakdown.compute).toBeGreaterThan(0);
      expect(cost.breakdown.loadBalancer).toBeGreaterThan(0);
      expect(cost.details.taskCount).toBe(2);
      expect(cost.details.taskCpu).toBe(1024);
      expect(cost.details.taskMemory).toBe(2048);
    });
  });

  describe("calculateCostDelta", () => {
    it("should calculate cost increase correctly", async () => {
      const current = {
        monthly: 50,
        breakdown: {
          compute: 30,
          loadBalancer: 10,
          dataTransfer: 10,
          storage: 0,
        },
        details: {
          taskCount: 1,
          taskCpu: 512,
          taskMemory: 1024,
          region: "us-east-1",
        },
      };

      const projected = {
        monthly: 100,
        breakdown: {
          compute: 60,
          loadBalancer: 10,
          dataTransfer: 30,
          storage: 0,
        },
        details: {
          taskCount: 2,
          taskCpu: 1024,
          taskMemory: 2048,
          region: "us-east-1",
        },
      };

      const delta = await estimator.calculateCostDelta(current, projected);

      expect(delta.difference.amount).toBe(50);
      expect(delta.difference.percentage).toBe(100);
      expect(delta.breakdown.compute.percentage).toBe(100);
      expect(delta.breakdown.dataTransfer.percentage).toBe(200);
    });

    it("should handle null current cost (new deployment)", async () => {
      const projected = {
        monthly: 100,
        breakdown: {
          compute: 60,
          loadBalancer: 10,
          dataTransfer: 30,
          storage: 0,
        },
        details: {
          taskCount: 2,
          taskCpu: 1024,
          taskMemory: 2048,
          region: "us-east-1",
        },
      };

      const delta = await estimator.calculateCostDelta(null, projected);

      expect(delta.current.monthly).toBe(0);
      expect(delta.difference.amount).toBe(100);
      expect(delta.difference.percentage).toBe(100);
    });
  });

  describe("formatCostDelta", () => {
    it("should format cost delta output correctly", () => {
      const delta = {
        current: {
          monthly: 50,
          breakdown: {
            compute: 30,
            loadBalancer: 10,
            dataTransfer: 10,
            storage: 0,
          },
          details: {
            taskCount: 1,
            taskCpu: 512,
            taskMemory: 1024,
            region: "us-east-1",
          },
        },
        projected: {
          monthly: 100,
          breakdown: {
            compute: 60,
            loadBalancer: 10,
            dataTransfer: 30,
            storage: 0,
          },
          details: {
            taskCount: 2,
            taskCpu: 1024,
            taskMemory: 2048,
            region: "us-east-1",
          },
        },
        difference: {
          amount: 50,
          percentage: 100,
        },
        breakdown: {
          compute: { amount: 30, percentage: 100 },
          loadBalancer: { amount: 0, percentage: 0 },
          dataTransfer: { amount: 20, percentage: 200 },
          storage: { amount: 0, percentage: 0 },
        },
      };

      const output = estimator.formatCostDelta(delta);

      expect(output).toContain("Current monthly cost: $50.00");
      expect(output).toContain("After deployment: $100.00");
      expect(output).toContain("Total increase: +$50.00/month (+100%)");
      expect(output).toContain("↑ 100%"); // Compute increase
      expect(output).toContain("↑ 200%"); // Data transfer increase
    });
  });
});