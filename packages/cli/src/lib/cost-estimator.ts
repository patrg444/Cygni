import {
  PricingClient,
  GetProductsCommand,
  GetProductsCommandInput,
} from "@aws-sdk/client-pricing";
import { 
  ECSClient, 
  DescribeTaskDefinitionCommand,
  DescribeServicesCommand,
} from "@aws-sdk/client-ecs";
import chalk from "chalk";

export interface DeploymentCost {
  monthly: number;
  breakdown: {
    compute: number;
    loadBalancer: number;
    dataTransfer: number;
    storage: number;
  };
  details: {
    taskCount: number;
    taskCpu: number;
    taskMemory: number;
    region: string;
  };
}

export interface CostDelta {
  current: DeploymentCost;
  projected: DeploymentCost;
  difference: {
    amount: number;
    percentage: number;
  };
  breakdown: {
    compute: { amount: number; percentage: number };
    loadBalancer: { amount: number; percentage: number };
    dataTransfer: { amount: number; percentage: number };
    storage: { amount: number; percentage: number };
  };
}

interface PricingCache {
  [key: string]: {
    price: number;
    timestamp: number;
  };
}

export class CostEstimator {
  private pricingClient: PricingClient;
  private ecsClient: ECSClient;
  private pricingCache: PricingCache = {};
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
  
  constructor(region: string = "us-east-1") {
    // Pricing API is only available in us-east-1
    this.pricingClient = new PricingClient({ region: "us-east-1" });
    this.ecsClient = new ECSClient({ region });
  }

  async estimateDeploymentCost(
    taskDefinitionArn: string,
    desiredCount: number,
    region: string,
  ): Promise<DeploymentCost> {
    // Get task definition details
    const taskDef = await this.ecsClient.send(
      new DescribeTaskDefinitionCommand({ taskDefinition: taskDefinitionArn })
    );
    
    if (!taskDef.taskDefinition) {
      throw new Error("Task definition not found");
    }

    const cpu = parseInt(taskDef.taskDefinition.cpu || "256");
    const memory = parseInt(taskDef.taskDefinition.memory || "512");
    
    // Calculate compute costs
    const computeCost = await this.calculateComputeCost(cpu, memory, desiredCount, region);
    
    // Estimate load balancer cost
    const loadBalancerCost = await this.calculateLoadBalancerCost(region);
    
    // Estimate data transfer (based on typical usage)
    const dataTransferCost = await this.calculateDataTransferCost(desiredCount, region);
    
    // Estimate storage cost (EBS for containers)
    const storageCost = await this.calculateStorageCost(desiredCount, region);
    
    return {
      monthly: computeCost + loadBalancerCost + dataTransferCost + storageCost,
      breakdown: {
        compute: computeCost,
        loadBalancer: loadBalancerCost,
        dataTransfer: dataTransferCost,
        storage: storageCost,
      },
      details: {
        taskCount: desiredCount,
        taskCpu: cpu,
        taskMemory: memory,
        region,
      },
    };
  }

  async getCurrentDeploymentCost(
    clusterName: string,
    serviceName: string,
    region: string,
  ): Promise<DeploymentCost | null> {
    try {
      // Get current service details
      const services = await this.ecsClient.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [serviceName],
        })
      );
      
      if (!services.services || services.services.length === 0) {
        return null;
      }
      
      const service = services.services[0];
      if (!service || !service.taskDefinition) {
        return null;
      }
      
      return await this.estimateDeploymentCost(
        service.taskDefinition,
        service.desiredCount || 0,
        region,
      );
    } catch (error) {
      // Service might not exist yet
      return null;
    }
  }

  async calculateCostDelta(
    current: DeploymentCost | null,
    projected: DeploymentCost,
  ): Promise<CostDelta> {
    const defaultCost: DeploymentCost = {
      monthly: 0,
      breakdown: {
        compute: 0,
        loadBalancer: 0,
        dataTransfer: 0,
        storage: 0,
      },
      details: {
        taskCount: 0,
        taskCpu: 0,
        taskMemory: 0,
        region: projected.details.region,
      },
    };
    
    const currentCost = current || defaultCost;
    const difference = projected.monthly - currentCost.monthly;
    const percentage = currentCost.monthly > 0 
      ? (difference / currentCost.monthly) * 100 
      : 100;
    
    return {
      current: currentCost,
      projected,
      difference: {
        amount: difference,
        percentage,
      },
      breakdown: {
        compute: this.calculateDelta(
          currentCost.breakdown.compute,
          projected.breakdown.compute,
        ),
        loadBalancer: this.calculateDelta(
          currentCost.breakdown.loadBalancer,
          projected.breakdown.loadBalancer,
        ),
        dataTransfer: this.calculateDelta(
          currentCost.breakdown.dataTransfer,
          projected.breakdown.dataTransfer,
        ),
        storage: this.calculateDelta(
          currentCost.breakdown.storage,
          projected.breakdown.storage,
        ),
      },
    };
  }

  private calculateDelta(current: number, projected: number) {
    const amount = projected - current;
    const percentage = current > 0 ? (amount / current) * 100 : 100;
    return { amount, percentage };
  }

  private async calculateComputeCost(
    cpu: number,
    memory: number,
    taskCount: number,
    region: string,
  ): Promise<number> {
    // Fargate pricing (simplified)
    // CPU: $0.04048 per vCPU per hour
    // Memory: $0.004445 per GB per hour
    
    const cpuPrice = await this.getFargatePrice("cpu", region) || 0.04048;
    const memoryPrice = await this.getFargatePrice("memory", region) || 0.004445;
    
    const vcpus = cpu / 1024; // Convert CPU units to vCPUs
    const memoryGB = memory / 1024; // Convert MB to GB
    
    const hourlyComputeCost = (vcpus * cpuPrice + memoryGB * memoryPrice) * taskCount;
    const monthlyComputeCost = hourlyComputeCost * 24 * 30; // 30 days
    
    return monthlyComputeCost;
  }

  private async calculateLoadBalancerCost(_region: string): Promise<number> {
    // ALB pricing (simplified)
    // $0.0225 per ALB per hour + LCU charges
    // We'll estimate a fixed cost for simplicity
    
    const albHourlyPrice = await this.getALBPrice(_region) || 0.0225;
    const lcuEstimate = 0.008; // Estimated LCU cost per hour
    
    return (albHourlyPrice + lcuEstimate) * 24 * 30;
  }

  private async calculateDataTransferCost(
    taskCount: number,
    region: string,
  ): Promise<number> {
    // Estimate 100GB per task per month for moderate traffic
    const gbPerTask = 100;
    const totalGB = gbPerTask * taskCount;
    
    // Data transfer out pricing (simplified)
    const pricePerGB = await this.getDataTransferPrice(region) || 0.09;
    
    return totalGB * pricePerGB;
  }

  private async calculateStorageCost(
    taskCount: number,
    _region: string,
  ): Promise<number> {
    // EBS GP3 storage: $0.08 per GB per month
    // Assume 20GB per task
    const gbPerTask = 20;
    const totalGB = gbPerTask * taskCount;
    
    const pricePerGB = await this.getStoragePrice(_region) || 0.08;
    
    return totalGB * pricePerGB;
  }

  private async getFargatePrice(
    type: "cpu" | "memory",
    region: string,
  ): Promise<number | null> {
    const cacheKey = `fargate-${type}-${region}`;
    return this.getCachedPrice(cacheKey) || this.fetchFargatePrice(type, region);
  }

  private async getALBPrice(region: string): Promise<number | null> {
    const cacheKey = `alb-${region}`;
    return this.getCachedPrice(cacheKey) || this.fetchALBPrice(region);
  }

  private async getDataTransferPrice(region: string): Promise<number | null> {
    const cacheKey = `transfer-${region}`;
    return this.getCachedPrice(cacheKey) || this.fetchDataTransferPrice(region);
  }

  private async getStoragePrice(region: string): Promise<number | null> {
    const cacheKey = `storage-${region}`;
    return this.getCachedPrice(cacheKey) || this.fetchStoragePrice(region);
  }

  private getCachedPrice(key: string): number | null {
    const cached = this.pricingCache[key];
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }
    return null;
  }

  private async fetchFargatePrice(
    type: "cpu" | "memory",
    region: string,
  ): Promise<number | null> {
    try {
      const filters = [
        { Type: "TERM_MATCH", Field: "ServiceCode", Value: "AmazonECS" },
        { Type: "TERM_MATCH", Field: "productFamily", Value: "Compute" },
        { Type: "TERM_MATCH", Field: "location", Value: this.getRegionName(region) },
        { Type: "TERM_MATCH", Field: "usagetype", Value: type === "cpu" ? "Fargate-vCPU-Hours" : "Fargate-GB-Hours" },
      ];
      
      const price = await this.fetchPrice(filters);
      if (price !== null) {
        this.pricingCache[`fargate-${type}-${region}`] = {
          price,
          timestamp: Date.now(),
        };
      }
      return price;
    } catch (error) {
      console.error("Error fetching Fargate price:", error);
      return null;
    }
  }

  private async fetchALBPrice(region: string): Promise<number | null> {
    try {
      const filters = [
        { Type: "TERM_MATCH", Field: "ServiceCode", Value: "AWSELB" },
        { Type: "TERM_MATCH", Field: "productFamily", Value: "Load Balancer-Application" },
        { Type: "TERM_MATCH", Field: "location", Value: this.getRegionName(region) },
      ];
      
      const price = await this.fetchPrice(filters);
      if (price !== null) {
        this.pricingCache[`alb-${region}`] = {
          price,
          timestamp: Date.now(),
        };
      }
      return price;
    } catch (error) {
      console.error("Error fetching ALB price:", error);
      return null;
    }
  }

  private async fetchDataTransferPrice(_region: string): Promise<number | null> {
    // Data transfer pricing is complex; using simplified estimate
    return 0.09; // $0.09 per GB is a common rate
  }

  private async fetchStoragePrice(_region: string): Promise<number | null> {
    // EBS GP3 pricing
    return 0.08; // $0.08 per GB per month
  }

  private async fetchPrice(filters: any[]): Promise<number | null> {
    try {
      const serviceCodeFilter = filters.find(f => f.Field === "ServiceCode");
      if (!serviceCodeFilter) {
        return null;
      }
      
      const params: GetProductsCommandInput = {
        ServiceCode: serviceCodeFilter.Value as string,
        Filters: filters,
        MaxResults: 1,
      };
      
      const response = await this.pricingClient.send(new GetProductsCommand(params));
      
      if (response.PriceList && response.PriceList.length > 0) {
        const priceData = JSON.parse(response.PriceList[0]);
        const onDemandPricing = priceData.terms?.OnDemand;
        
        if (onDemandPricing) {
          const firstKey = Object.keys(onDemandPricing)[0];
          if (firstKey) {
            const priceDimensions = onDemandPricing[firstKey]?.priceDimensions;
            
            if (priceDimensions) {
              const dimensionKey = Object.keys(priceDimensions)[0];
              if (dimensionKey) {
                const price = parseFloat(priceDimensions[dimensionKey]?.pricePerUnit?.USD || "0");
                return price;
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error fetching price:", error);
      return null;
    }
  }

  private getRegionName(region: string): string {
    const regionMap: Record<string, string> = {
      "us-east-1": "US East (N. Virginia)",
      "us-east-2": "US East (Ohio)",
      "us-west-1": "US West (N. California)",
      "us-west-2": "US West (Oregon)",
      "eu-west-1": "EU (Ireland)",
      "eu-central-1": "EU (Frankfurt)",
      "ap-southeast-1": "Asia Pacific (Singapore)",
      "ap-northeast-1": "Asia Pacific (Tokyo)",
      // Add more regions as needed
    };
    
    return regionMap[region] || region;
  }

  formatCostDelta(delta: CostDelta): string {
    const { current, projected, difference, breakdown } = delta;
    
    let output = chalk.bold("Deployment Cost Analysis\n");
    output += "─".repeat(50) + "\n\n";
    
    // Current costs
    output += chalk.bold("Current monthly cost: ") + chalk.cyan(`$${current.monthly.toFixed(2)}\n`);
    if (current.monthly > 0) {
      output += `  - ECS Tasks (${current.details.taskCount}x ${current.details.taskCpu/1024}vCPU, ${current.details.taskMemory/1024}GB): $${current.breakdown.compute.toFixed(2)}\n`;
      output += `  - Load Balancer: $${current.breakdown.loadBalancer.toFixed(2)}\n`;
      output += `  - Data Transfer: $${current.breakdown.dataTransfer.toFixed(2)}\n`;
    }
    
    output += "\n";
    
    // Projected costs
    output += chalk.bold("After deployment: ") + chalk.cyan(`$${projected.monthly.toFixed(2)}\n`);
    output += `  - ECS Tasks (${projected.details.taskCount}x ${projected.details.taskCpu/1024}vCPU, ${projected.details.taskMemory/1024}GB): $${projected.breakdown.compute.toFixed(2)}`;
    if (breakdown.compute.percentage !== 0) {
      const arrow = breakdown.compute.percentage > 0 ? "↑" : "↓";
      const color = breakdown.compute.percentage > 0 ? chalk.red : chalk.green;
      output += color(`  ${arrow} ${Math.abs(breakdown.compute.percentage).toFixed(0)}%`);
    }
    output += "\n";
    
    output += `  - Load Balancer: $${projected.breakdown.loadBalancer.toFixed(2)}\n`;
    output += `  - Data Transfer: $${projected.breakdown.dataTransfer.toFixed(2)}`;
    if (breakdown.dataTransfer.percentage !== 0) {
      const arrow = breakdown.dataTransfer.percentage > 0 ? "↑" : "↓";
      const color = breakdown.dataTransfer.percentage > 0 ? chalk.red : chalk.green;
      output += color(`  ${arrow} ${Math.abs(breakdown.dataTransfer.percentage).toFixed(0)}%`);
    }
    output += "\n\n";
    
    // Total change
    if (difference.amount === 0) {
      output += chalk.gray("No change in monthly cost.\n");
    } else if (difference.amount > 0) {
      output += chalk.red(`Total increase: +$${difference.amount.toFixed(2)}/month (+${difference.percentage.toFixed(0)}%)\n`);
    } else {
      output += chalk.green(`Total savings: -$${Math.abs(difference.amount).toFixed(2)}/month (${difference.percentage.toFixed(0)}%)\n`);
    }
    
    return output;
  }
}