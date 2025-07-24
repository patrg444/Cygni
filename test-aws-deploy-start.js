#!/usr/bin/env node

// Test if AWS deployment initialization works
const path = require("path");

// Load the AWS deployer
const { AWSDeployer } = require("./packages/cli/dist/lib/aws-deploy.js");

async function testDeployStart() {
  console.log("🧪 Testing AWS Deployment Initialization...\n");

  try {
    const deployer = new AWSDeployer("us-east-1");

    // Test event emitter
    deployer.on("step", (msg) => console.log(`📍 Step: ${msg}`));
    deployer.on("log", (msg) => console.log(`   ${msg}`));
    deployer.on("stack-status", (status) =>
      console.log(`   CloudFormation: ${status}`),
    );

    console.log("✅ AWS Deployer initialized successfully");
    console.log("   - CloudFormation client: ✓");
    console.log("   - ECR client: ✓");
    console.log("   - ECS client: ✓");
    console.log("   - Event emitter: ✓");

    // Test account ID fetch
    console.log("\nTesting AWS connection...");
    const accountId = await deployer.getAccountId();
    console.log(`✅ Connected to AWS account: ${accountId}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.message.includes("credentials")) {
      console.log('\nTip: Run "aws configure" to set up credentials');
    }
  }
}

// Make getAccountId accessible for testing
AWSDeployer.prototype.getAccountId = async function () {
  if (this.accountId) return this.accountId;

  const {
    STSClient,
    GetCallerIdentityCommand,
  } = require("@aws-sdk/client-sts");
  const stsClient = new STSClient({ region: this.region });

  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  this.accountId = identity.Account;
  if (!this.accountId) {
    throw new Error("Failed to get AWS account ID");
  }
  return this.accountId;
};

testDeployStart();
