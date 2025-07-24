#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

console.log("🔍 Verifying AWS E2E Test Setup\n");

let allChecksPass = true;

// Check 1: AWS CLI
console.log("1. Checking AWS CLI...");
try {
  const identity = execSync("aws sts get-caller-identity", { encoding: "utf-8" });
  const accountInfo = JSON.parse(identity);
  console.log(`   ✅ AWS CLI configured (Account: ${accountInfo.Account})`);
} catch (error) {
  console.log("   ❌ AWS CLI not configured. Run 'aws configure' first.");
  allChecksPass = false;
}

// Check 2: Docker
console.log("\n2. Checking Docker...");
try {
  execSync("docker --version", { stdio: "pipe" });
  console.log("   ✅ Docker is installed");
  
  // Check if Docker daemon is running
  try {
    execSync("docker ps", { stdio: "pipe" });
    console.log("   ✅ Docker daemon is running");
  } catch {
    console.log("   ❌ Docker daemon is not running. Start Docker Desktop.");
    allChecksPass = false;
  }
} catch {
  console.log("   ❌ Docker not found. Install Docker Desktop.");
  allChecksPass = false;
}

// Check 3: AWS CDK
console.log("\n3. Checking AWS CDK...");
try {
  execSync("npx cdk --version", { stdio: "pipe" });
  console.log("   ✅ AWS CDK is available");
} catch {
  console.log("   ❌ AWS CDK not found. Run 'npm install -g aws-cdk'");
  allChecksPass = false;
}

// Check 4: CLI Build
console.log("\n4. Checking Cygni CLI build...");
const cliDistPath = path.join(__dirname, "..", "..", "..", "cli", "dist", "index.js");
if (fs.existsSync(cliDistPath)) {
  console.log("   ✅ CLI is built");
} else {
  console.log("   ❌ CLI not built. Run 'npm run build' in packages/cli");
  allChecksPass = false;
}

// Check 5: Infra package
console.log("\n5. Checking infrastructure package...");
const infraPath = path.join(__dirname, "..", "..", "..", "infra");
if (fs.existsSync(infraPath)) {
  console.log("   ✅ Infrastructure package exists");
  
  // Check if CDK app is built
  const cdkAppPath = path.join(infraPath, "lib", "cygni-staging-stack.js");
  if (fs.existsSync(cdkAppPath)) {
    console.log("   ✅ CDK app is built");
  } else {
    console.log("   ⚠️  CDK app not built. The test will build it automatically.");
  }
} else {
  console.log("   ❌ Infrastructure package not found");
  allChecksPass = false;
}

// Check 6: Fullstack demo
console.log("\n6. Checking fullstack-demo...");
const demoPath = path.join(__dirname, "..", "..", "..", "..", "examples", "fullstack-demo");
if (fs.existsSync(demoPath)) {
  console.log("   ✅ Fullstack demo exists");
} else {
  console.log("   ❌ Fullstack demo not found");
  allChecksPass = false;
}

// Check 7: Playwright
console.log("\n7. Checking Playwright...");
try {
  execSync("npx playwright --version", { stdio: "pipe" });
  console.log("   ✅ Playwright is installed");
} catch {
  console.log("   ⚠️  Playwright may need installation. Run 'npx playwright install chromium'");
}

// Summary
console.log("\n" + "=".repeat(50));
if (allChecksPass) {
  console.log("✅ All checks passed! You're ready to run the AWS E2E test.");
  console.log("\nRun: npm run test:e2e:aws");
} else {
  console.log("❌ Some checks failed. Please fix the issues above before running the test.");
  process.exit(1);
}

// Cost warning
console.log("\n⚠️  WARNING: This test creates real AWS resources and incurs costs!");
console.log("   Estimated cost: ~$0.50-$1.00 for a 30-minute test run");
console.log("   The test will automatically clean up resources when complete.\n");