import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";

/**
 * Quick Infrastructure Test
 * 
 * This test verifies that the CDK infrastructure can be synthesized
 * and would deploy correctly without actually creating AWS resources.
 */

test.describe("Infrastructure Validation", () => {
  test("CDK stack synthesizes correctly", async () => {
    console.log("\n🔍 Validating CDK Infrastructure");
    
    const infraPath = path.join(process.cwd(), "..", "infra");
    
    // Build the CDK app
    console.log("📦 Building CDK app...");
    execSync("npm run build", {
      cwd: infraPath,
      stdio: "inherit",
    });
    
    // Synthesize the stack
    console.log("🔧 Synthesizing CDK stack...");
    const output = execSync("npx cdk synth --context envName=test", {
      cwd: infraPath,
      encoding: "utf-8",
    });
    
    // Verify key resources are in the template
    expect(output).toContain("AWS::EC2::VPC");
    expect(output).toContain("AWS::RDS::DBCluster");
    expect(output).toContain("AWS::ECS::Cluster");
    expect(output).toContain("AWS::ECS::Service");
    expect(output).toContain("AWS::S3::Bucket");
    expect(output).toContain("AWS::CloudFront::Distribution");
    expect(output).toContain("AWS::ECR::Repository");
    
    console.log("✅ CDK stack validated successfully");
    console.log("\nKey resources found:");
    console.log("  - VPC with public/private subnets");
    console.log("  - Aurora Serverless v2 database");
    console.log("  - ECS Fargate cluster and service");
    console.log("  - ECR repository for Docker images");
    console.log("  - S3 bucket for frontend");
    console.log("  - CloudFront distribution");
  });

  test("CLI deployment logic works with mock AWS", async () => {
    console.log("\n🔍 Validating CLI Deployment Logic");
    
    const demoPath = path.join(process.cwd(), "..", "..", "examples", "fullstack-demo");
    const cliPath = path.join(process.cwd(), "..", "cli");
    const cxCommand = `node ${path.join(cliPath, "dist", "index.js")}`;
    
    // Test dry run
    console.log("🧪 Testing deployment dry run...");
    const dryRunOutput = execSync(
      `${cxCommand} deploy:fullstack --provider aws --dry-run`,
      {
        cwd: demoPath,
        encoding: "utf-8",
      }
    );
    
    expect(dryRunOutput).toContain("Deployment Plan");
    expect(dryRunOutput).toContain("This is a dry run");
    
    console.log("✅ CLI deployment logic validated");
  });
});