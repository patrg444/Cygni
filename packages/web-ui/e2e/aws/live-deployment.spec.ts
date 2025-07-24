import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Live AWS Deployment End-to-End Test
 * 
 * This test proves that the entire Cygni platform works end-to-end:
 * 1. Infrastructure as Code (CDK) provisions real AWS resources
 * 2. CLI deploys the application to those resources
 * 3. The deployed application works correctly with real database
 * 
 * WARNING: This test creates real AWS resources and incurs costs.
 * Ensure AWS credentials are configured before running.
 */

// Test configuration
const TEST_TIMEOUT = 30 * 60 * 1000; // 30 minutes for full deployment
const ENV_NAME = `e2e-${Date.now()}`;
const STACK_NAME = `CygniStagingStack-${ENV_NAME}`;
const CDK_OUTPUTS_FILE = `cdk.outputs.${ENV_NAME}.json`;

// Helper to run commands with output
function runCommand(command: string, cwd?: string, env?: Record<string, string>): string {
  console.log(`\n📍 Running: ${command}`);
  try {
    const output = execSync(command, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    console.log(output);
    return output;
  } catch (error: any) {
    console.error(`❌ Command failed: ${command}`);
    console.error(error.stdout?.toString() || error.message);
    throw error;
  }
}

// Helper to wait for ECS service to be stable
async function waitForECSServiceStable(outputs: any, maxWaitTime = 600000): Promise<void> {
  console.log("⏳ Waiting for ECS service to stabilize...");
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = runCommand(
        `aws ecs describe-services --cluster ${outputs.ECSClusterName} --services ${outputs.ECSServiceName} --query 'services[0].deployments' --output json`
      );
      const deployments = JSON.parse(result);
      
      // Check if we have exactly one deployment (stable)
      if (deployments.length === 1 && deployments[0].runningCount === deployments[0].desiredCount) {
        console.log("✅ ECS service is stable");
        return;
      }
      
      console.log(`⏳ Waiting... (${deployments.length} deployments, ${deployments[0]?.runningCount || 0}/${deployments[0]?.desiredCount || 0} tasks)`);
    } catch (error) {
      console.log("⏳ Service not ready yet...");
    }
    
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
  }
  
  throw new Error("ECS service failed to stabilize within timeout");
}

test.describe("Live AWS Deployment", () => {
  let cloudFrontUrl: string;
  let cdkOutputs: any;
  let infrastructureDeployed = false;
  let applicationDeployed = false;

  test.beforeAll(async () => {
    console.log("\n🚀 Starting Live AWS Deployment Test");
    console.log("⚠️  This test creates real AWS resources and may incur costs");

    // Check AWS credentials
    try {
      runCommand("aws sts get-caller-identity");
    } catch {
      throw new Error("AWS credentials not configured. Please run 'aws configure' first.");
    }

    // Phase 1: Deploy Infrastructure
    console.log("\n📦 Phase 1: Deploying Infrastructure with CDK");
    
    const infraPath = path.join(process.cwd(), "..", "infra");
    
    // Install dependencies
    runCommand("npm install", infraPath);
    
    // Build the CDK app
    runCommand("npm run build", infraPath);
    
    // Deploy the stack with outputs
    runCommand(
      `npx cdk deploy --context envName=${ENV_NAME} --require-approval never --outputs-file ${CDK_OUTPUTS_FILE}`,
      infraPath
    );
    infrastructureDeployed = true;
    
    // Read the outputs
    const outputsPath = path.join(infraPath, CDK_OUTPUTS_FILE);
    const outputsContent = fs.readFileSync(outputsPath, "utf-8");
    const outputs = JSON.parse(outputsContent);
    cdkOutputs = outputs[STACK_NAME];
    cloudFrontUrl = cdkOutputs.CloudFrontUrl;
    
    console.log(`\n✅ Infrastructure deployed successfully`);
    console.log(`📍 CloudFront URL: ${cloudFrontUrl}`);
    console.log(`📍 ECR Repository: ${cdkOutputs.ECRRepositoryUri}`);
    console.log(`📍 ECS Service: ${cdkOutputs.ECSServiceName}`);

    // Phase 2: Deploy Application
    console.log("\n🚀 Phase 2: Deploying Application with CLI");
    
    const demoPath = path.join(process.cwd(), "..", "..", "examples", "fullstack-demo");
    
    // First, build the application
    console.log("📦 Building fullstack-demo...");
    runCommand("npm install", demoPath);
    const cliPath = path.join(process.cwd(), "..", "cli");
    const cxCommand = `node ${path.join(cliPath, "dist", "index.js")}`;
    runCommand(`${cxCommand} build`, demoPath);
    
    // Deploy using the CLI with CDK outputs
    console.log("🚀 Deploying with cx deploy:fullstack...");
    runCommand(
      `${cxCommand} deploy:fullstack --provider aws --no-dry-run`,
      demoPath,
      {
        CYGNI_ECR_REPO: cdkOutputs.ECRRepositoryUri,
        CYGNI_ECS_CLUSTER: cdkOutputs.ECSClusterName,
        CYGNI_ECS_SERVICE: cdkOutputs.ECSServiceName,
        CYGNI_FRONTEND_BUCKET: cdkOutputs.FrontendBucketName,
        CYGNI_CLOUDFRONT_ID: cdkOutputs.CloudFrontDistributionId,
        CYGNI_CLOUDFRONT_URL: cdkOutputs.CloudFrontUrl,
        CYGNI_LOAD_BALANCER_URL: cdkOutputs.LoadBalancerUrl,
        AWS_REGION: process.env.AWS_REGION || "us-east-1",
      }
    );
    applicationDeployed = true;
    
    // Wait for ECS service to be stable
    await waitForECSServiceStable(cdkOutputs);
    
    console.log("\n✅ Application deployed successfully");
    console.log(`🌐 Application URL: ${cloudFrontUrl}`);
    
    // Give CloudFront a moment to propagate
    console.log("⏳ Waiting for CloudFront distribution to propagate...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
  });

  test.afterAll(async () => {
    // Phase 4: Clean up AWS resources
    console.log("\n🧹 Phase 4: Cleaning up AWS resources");
    
    if (infrastructureDeployed) {
      try {
        const infraPath = path.join(process.cwd(), "..", "infra");
        
        console.log("🗑️  Destroying CDK stack...");
        runCommand(
          `npx cdk destroy --context envName=${ENV_NAME} --force`,
          infraPath
        );
        
        console.log("✅ Infrastructure cleaned up successfully");
      } catch (error) {
        console.error("⚠️  Failed to destroy stack. Please check AWS console and clean up manually.");
        console.error(error);
      }
    }
  });

  test("Phase 3: Verify application works with CRUD operations", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    console.log("\n🧪 Phase 3: Testing deployed application");
    
    // Navigate to the deployed application
    console.log(`📍 Navigating to ${cloudFrontUrl}`);
    await page.goto(cloudFrontUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    
    // Wait for the application to load
    await expect(page.locator("h1")).toContainText("Blog Posts", { timeout: 30000 });
    console.log("✅ Application loaded successfully");
    
    // Test 1: Read - Verify initial posts load
    console.log("\n📖 Test 1: Reading posts");
    const initialPosts = page.locator(".post-card");
    const initialCount = await initialPosts.count();
    console.log(`Found ${initialCount} initial posts`);
    expect(initialCount).toBeGreaterThanOrEqual(0);
    
    // Test 2: Create - Add a new post
    console.log("\n✏️ Test 2: Creating a new post");
    const testTitle = `E2E Test Post ${Date.now()}`;
    const testContent = "This post was created by an automated E2E test running on real AWS infrastructure.";
    
    // Click "New Post" button
    await page.getByRole("button", { name: /new post/i }).click();
    
    // Fill in the form
    await page.getByLabel(/title/i).fill(testTitle);
    await page.getByLabel(/content/i).fill(testContent);
    
    // Submit the form
    await page.getByRole("button", { name: /create/i }).click();
    
    // Wait for navigation back to posts list
    await page.waitForURL(cloudFrontUrl, { timeout: 10000 });
    
    // Verify the post was created
    const newPost = page.locator(".post-card").filter({ hasText: testTitle });
    await expect(newPost).toBeVisible({ timeout: 10000 });
    console.log("✅ Post created successfully");
    
    // Test 3: Read - Verify the new post appears in the list
    console.log("\n📖 Test 3: Verifying new post in list");
    const updatedPosts = page.locator(".post-card");
    const updatedCount = await updatedPosts.count();
    expect(updatedCount).toBe(initialCount + 1);
    
    // Click on the new post to view details
    await newPost.click();
    
    // Verify post details
    await expect(page.locator("h1")).toContainText(testTitle);
    await expect(page.locator(".post-content")).toContainText(testContent);
    console.log("✅ Post details verified");
    
    // Test 4: Delete - Remove the test post
    console.log("\n🗑️ Test 4: Deleting the test post");
    await page.getByRole("button", { name: /delete/i }).click();
    
    // Confirm deletion (if there's a confirmation dialog)
    const confirmButton = page.getByRole("button", { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }
    
    // Wait for navigation back to posts list
    await page.waitForURL(cloudFrontUrl, { timeout: 10000 });
    
    // Verify the post was deleted
    await expect(newPost).not.toBeVisible({ timeout: 10000 });
    const finalCount = await page.locator(".post-card").count();
    expect(finalCount).toBe(initialCount);
    console.log("✅ Post deleted successfully");
    
    // Test 5: Verify backend health
    console.log("\n💚 Test 5: Checking backend health");
    const healthResponse = await page.request.get(`${cdkOutputs.LoadBalancerUrl}/health`);
    expect(healthResponse.ok()).toBeTruthy();
    const healthData = await healthResponse.json();
    expect(healthData).toHaveProperty("status", "ok");
    console.log("✅ Backend is healthy");
    
    console.log("\n🎉 All tests passed! The full stack is working correctly on AWS.");
  });
});