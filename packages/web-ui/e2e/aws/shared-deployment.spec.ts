import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import axios from "axios";

// Increase timeout for AWS operations
test.setTimeout(30 * 60 * 1000); // 30 minutes total

// Helper to execute shell commands
function execCommand(command: string, cwd?: string): string {
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, PATH: process.env.PATH || "" }
    });
    return output.trim();
  } catch (error: any) {
    console.error(`Command failed: ${command}`);
    console.error(`Error: ${error.message}`);
    if (error.stdout) console.error(`Stdout: ${error.stdout}`);
    if (error.stderr) console.error(`Stderr: ${error.stderr}`);
    throw error;
  }
}

// Helper to retry HTTP requests
async function retryRequest(
  url: string,
  maxRetries: number = 30,
  delayMs: number = 10000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept any non-5xx status
      });
      
      if (response.status === 200 || response.status === 404) {
        console.log(`✓ URL ${url} is accessible (status: ${response.status})`);
        return true;
      }
    } catch (error: any) {
      console.log(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}`);
    }
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

test.describe("AWS Shared Infrastructure Deployment", () => {
  const region = process.env.AWS_REGION || "us-east-1";
  const rootPath = path.join(__dirname, "..", "..", "..", "..");
  const infraPath = path.join(rootPath, "packages", "infra");
  const cliPath = path.join(rootPath, "packages", "cli");
  const demoPath = path.join(rootPath, "packages", "fullstack-demo");
  
  let sharedAlbUrl: string = "";
  const projectIds = ["app-one", "app-two"];
  
  test.beforeAll(async () => {
    // Ensure AWS credentials are configured
    try {
      execCommand("aws sts get-caller-identity");
    } catch {
      throw new Error("AWS credentials not configured. Please run 'aws configure'");
    }
    
    // Ensure CDK is bootstrapped
    console.log("Ensuring CDK is bootstrapped...");
    try {
      execCommand(`npx cdk bootstrap aws://unknown-account/${region}`, infraPath);
    } catch {
      // Bootstrap might already exist, that's ok
    }
  });
  
  test("1. Deploy shared infrastructure stack", async () => {
    console.log("\n🚀 Deploying shared infrastructure stack...");
    
    // Deploy the shared stack
    const deployOutput = execCommand(
      "npm run deploy:shared:outputs",
      infraPath
    );
    
    console.log("Deploy output:", deployOutput);
    
    // Verify outputs file was created
    const outputsPath = path.join(infraPath, "shared.outputs.json");
    expect(fs.existsSync(outputsPath)).toBe(true);
    
    // Parse outputs to get ALB URL
    const outputs = JSON.parse(fs.readFileSync(outputsPath, "utf8"));
    const stackName = Object.keys(outputs)[0];
    expect(stackName).toBeTruthy();
    
    const stackOutputs = outputs[stackName];
    sharedAlbUrl = stackOutputs.ALBDnsName;
    
    expect(sharedAlbUrl).toBeTruthy();
    console.log(`✓ Shared infrastructure deployed. ALB URL: ${sharedAlbUrl}`);
    
    // Verify infrastructure components
    expect(stackOutputs.ClusterName).toBe("cygni-shared-cluster");
    expect(stackOutputs.ECRRepositoryUri).toContain("cygni-shared-apps");
    expect(stackOutputs.VPCId).toBeTruthy();
    expect(stackOutputs.TaskExecutionRoleArn).toBeTruthy();
  });
  
  test("2. Deploy first application to shared infrastructure", async () => {
    console.log(`\n🚀 Deploying ${projectIds[0]} to shared infrastructure...`);
    
    // Change to demo directory for deployment
    process.chdir(demoPath);
    
    // Deploy app-one
    const deployCommand = `node ${path.join(cliPath, 'dist/index.js')} deploy:fullstack --provider aws --tier shared --project-id ${projectIds[0]} --skip-build`;
    const output = execCommand(deployCommand);
    
    expect(output).toContain("Deployment Complete!");
    expect(output).toContain(`http://${sharedAlbUrl}/${projectIds[0]}`);
    
    console.log(`✓ ${projectIds[0]} deployed successfully`);
  });
  
  test("3. Deploy second application to shared infrastructure", async () => {
    console.log(`\n🚀 Deploying ${projectIds[1]} to shared infrastructure...`);
    
    // Change to demo directory for deployment
    process.chdir(demoPath);
    
    // Deploy app-two
    const deployCommand = `node ${path.join(cliPath, 'dist/index.js')} deploy:fullstack --provider aws --tier shared --project-id ${projectIds[1]} --skip-build`;
    const output = execCommand(deployCommand);
    
    expect(output).toContain("Deployment Complete!");
    expect(output).toContain(`http://${sharedAlbUrl}/${projectIds[1]}`);
    
    console.log(`✓ ${projectIds[1]} deployed successfully`);
  });
  
  test("4. Verify both applications are accessible", async () => {
    console.log("\n🔍 Verifying applications are accessible...");
    
    // Wait a bit for services to stabilize
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    for (const projectId of projectIds) {
      const url = `http://${sharedAlbUrl}/${projectId}`;
      console.log(`Testing ${url}...`);
      
      const isAccessible = await retryRequest(url);
      expect(isAccessible).toBe(true);
      
      // Verify the response contains expected content
      const response = await axios.get(url);
      expect(response.status).toBe(200);
      
      // Check if it returns API response or HTML
      const contentType = response.headers["content-type"];
      console.log(`${projectId} content-type: ${contentType}`);
      
      if (contentType?.includes("application/json")) {
        expect(response.data).toHaveProperty("message");
      } else if (contentType?.includes("text/html")) {
        expect(response.data).toContain("<");
      }
    }
    
    console.log("✓ Both applications are accessible");
  });
  
  test("5. Test project management commands", async () => {
    console.log("\n📋 Testing project management commands...");
    
    // Test projects list
    const listOutput = execCommand(
      `node ${path.join(cliPath, 'dist/index.js')} projects list --region ${region}`
    );
    
    expect(listOutput).toContain(projectIds[0]);
    expect(listOutput).toContain(projectIds[1]);
    expect(listOutput).toContain("ACTIVE");
    expect(listOutput).toContain(`http://${sharedAlbUrl}`);
    
    console.log("✓ projects list shows both applications");
    
    // Test projects info
    const infoOutput = execCommand(
      `node ${path.join(cliPath, 'dist/index.js')} projects info ${projectIds[0]} --region ${region}`
    );
    
    expect(infoOutput).toContain(projectIds[0]);
    expect(infoOutput).toContain("ACTIVE");
    expect(infoOutput).toContain("Shared");
    
    console.log("✓ projects info shows correct details");
  });
  
  test("6. Remove one application", async () => {
    console.log(`\n🗑️  Removing ${projectIds[0]}...`);
    
    // Remove app-one with force flag to skip confirmation
    const removeOutput = execCommand(
      `node ${path.join(cliPath, 'dist/index.js')} projects remove ${projectIds[0]} --force --region ${region}`
    );
    
    expect(removeOutput).toContain("removed successfully");
    
    // Wait for removal to complete
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    // Verify it's removed from the list
    const listOutput = execCommand(
      `node ${path.join(cliPath, 'dist/index.js')} projects list --region ${region}`
    );
    
    expect(listOutput).not.toContain(projectIds[0]);
    expect(listOutput).toContain(projectIds[1]); // app-two should still be there
    
    console.log(`✓ ${projectIds[0]} removed successfully`);
    
    // Verify app-one is no longer accessible
    const url = `http://${sharedAlbUrl}/${projectIds[0]}`;
    const response = await axios.get(url, {
      validateStatus: () => true,
    });
    
    expect(response.status).toBe(404);
    console.log(`✓ ${projectIds[0]} returns 404 as expected`);
  });
  
  test("7. Verify remaining application still works", async () => {
    console.log(`\n🔍 Verifying ${projectIds[1]} still works...`);
    
    const url = `http://${sharedAlbUrl}/${projectIds[1]}`;
    const isAccessible = await retryRequest(url);
    
    expect(isAccessible).toBe(true);
    console.log(`✓ ${projectIds[1]} is still accessible after removing ${projectIds[0]}`);
  });
  
  test.afterAll(async () => {
    console.log("\n🧹 Cleaning up...");
    
    try {
      // Remove remaining application
      execCommand(
        `node ${path.join(cliPath, 'dist/index.js')} projects remove ${projectIds[1]} --force --region ${region}`
      );
      console.log(`✓ Removed ${projectIds[1]}`);
    } catch {
      // Might already be removed
    }
    
    // Destroy shared infrastructure
    console.log("Destroying shared infrastructure stack...");
    try {
      execCommand("npm run destroy:shared", infraPath);
      console.log("✓ Shared infrastructure destroyed");
    } catch (error) {
      console.error("Failed to destroy shared infrastructure:", error);
      // Don't fail the test, as the stack might need manual cleanup
    }
    
    // Clean up outputs file
    const outputsPath = path.join(infraPath, "shared.outputs.json");
    if (fs.existsSync(outputsPath)) {
      fs.unlinkSync(outputsPath);
    }
  });
});

test.describe("Shared Deployment Performance", () => {
  test("Deployment completes in under 1 minute", async () => {
    console.log("\n⏱️  Testing deployment performance...");
    
    const rootPath = path.join(__dirname, "..", "..", "..", "..");
    const cliPath = path.join(rootPath, "packages", "cli");
    const demoPath = path.join(rootPath, "packages", "fullstack-demo");
    const projectId = `perf-test-${Date.now()}`;
    
    // Change to demo directory
    process.chdir(demoPath);
    
    const startTime = Date.now();
    
    try {
      // Deploy with timing
      const output = execCommand(
        `node ${path.join(cliPath, 'dist/index.js')} deploy:fullstack --provider aws --tier shared --project-id ${projectId} --skip-build`
      );
      
      const deploymentTime = (Date.now() - startTime) / 1000;
      console.log(`✓ Deployment completed in ${deploymentTime.toFixed(1)} seconds`);
      
      expect(deploymentTime).toBeLessThan(60);
      expect(output).toContain("Deployment Complete!");
      
      // Clean up
      execCommand(
        `node ${path.join(cliPath, 'dist/index.js')} projects remove ${projectId} --force`
      );
    } catch (error) {
      console.error("Performance test failed:", error);
      throw error;
    }
  });
});