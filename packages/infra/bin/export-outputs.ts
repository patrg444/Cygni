#!/usr/bin/env node
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Exports CDK stack outputs to a JSON file for use by the CLI
 */

const stackName = process.argv[2] || 'CygniStagingStack-staging';
const outputFile = path.join(__dirname, '..', 'cdk.outputs.json');

try {
  console.log(`📋 Exporting outputs from stack: ${stackName}`);
  
  // Get stack outputs using AWS CLI
  const outputs = execSync(
    `aws cloudformation describe-stacks --stack-name ${stackName} --query 'Stacks[0].Outputs' --output json`,
    { encoding: 'utf-8' }
  );
  
  const parsedOutputs = JSON.parse(outputs);
  
  // Convert to key-value format
  const formattedOutputs = parsedOutputs.reduce((acc: any, output: any) => {
    acc[output.OutputKey] = output.OutputValue;
    return acc;
  }, {});
  
  // Create the output structure
  const exportData = {
    [stackName]: formattedOutputs
  };
  
  // Write to file
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
  
  console.log(`✅ Outputs exported to: ${outputFile}`);
  console.log('\nOutputs:');
  Object.entries(formattedOutputs).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
} catch (error: any) {
  console.error('❌ Failed to export outputs:', error.message);
  console.error('\nMake sure:');
  console.error('1. The stack is deployed');
  console.error('2. You have AWS credentials configured');
  console.error('3. You have the correct stack name');
  process.exit(1);
}