#!/usr/bin/env node

// Quick test to verify AWS connection and permissions
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { ECRClient, DescribeRepositoriesCommand } = require("@aws-sdk/client-ecr");

async function testAWSConnection() {
  console.log("🧪 Testing AWS Connection...\n");

  const region = process.env.AWS_DEFAULT_REGION || "us-east-1";
  
  try {
    // Test STS
    const stsClient = new STSClient({ region });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log("✓ AWS credentials working");
    console.log(`  Account: ${identity.Account}`);
    console.log(`  Region: ${region}`);
    
    // Test ECR
    const ecrClient = new ECRClient({ region });
    try {
      await ecrClient.send(new DescribeRepositoriesCommand({ maxResults: 1 }));
      console.log("✓ ECR access working");
    } catch (error) {
      if (error.name === "AccessDeniedException") {
        console.log("✗ ECR access denied - check IAM permissions");
        console.log("  Need: ecr:CreateRepository, ecr:GetAuthorizationToken");
      }
    }
    
    console.log("\n✅ AWS connection test passed!");
    
  } catch (error) {
    console.error("✗ AWS connection failed:", error.message);
    console.log("\nTroubleshooting:");
    console.log("1. Run: aws configure");
    console.log("2. Or set environment variables:");
    console.log("   export AWS_ACCESS_KEY_ID=...");
    console.log("   export AWS_SECRET_ACCESS_KEY=...");
    console.log("   export AWS_DEFAULT_REGION=us-east-1");
    process.exit(1);
  }
}

testAWSConnection();