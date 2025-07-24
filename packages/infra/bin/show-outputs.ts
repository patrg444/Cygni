#!/usr/bin/env node
import { execSync } from 'child_process';

/**
 * Helper script to show stack outputs after deployment
 */

const stackName = process.argv[2] || 'CygniStagingStack-staging';

try {
  const outputs = execSync(`aws cloudformation describe-stacks --stack-name ${stackName} --query 'Stacks[0].Outputs' --output json`, {
    encoding: 'utf-8'
  });
  
  const parsedOutputs = JSON.parse(outputs);
  
  console.log('\n📋 Stack Outputs:\n');
  
  parsedOutputs.forEach((output: any) => {
    console.log(`${output.OutputKey}:`);
    console.log(`  ${output.Description}`);
    console.log(`  Value: ${output.OutputValue}\n`);
  });
  
  // Create environment variables file
  const envVars = parsedOutputs.reduce((acc: any, output: any) => {
    acc[output.OutputKey] = output.OutputValue;
    return acc;
  }, {});
  
  console.log('\n🔧 Environment Variables for CLI:\n');
  console.log(`export CYGNI_ECR_REPO="${envVars.ECRRepositoryUri}"`);
  console.log(`export CYGNI_ECS_CLUSTER="${envVars.ECSClusterName}"`);
  console.log(`export CYGNI_ECS_SERVICE="${envVars.ECSServiceName}"`);
  console.log(`export CYGNI_FRONTEND_BUCKET="${envVars.FrontendBucketName}"`);
  console.log(`export CYGNI_CLOUDFRONT_ID="${envVars.CloudFrontDistributionId}"`);
  console.log(`export CYGNI_CLOUDFRONT_URL="${envVars.CloudFrontUrl}"`);
  
} catch (error) {
  console.error('Failed to get stack outputs. Make sure the stack is deployed and you have AWS credentials configured.');
  process.exit(1);
}