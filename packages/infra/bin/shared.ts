#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CygniSharedStack } from '../lib/cygni-shared-stack';

const app = new cdk.App();

// Shared infrastructure is deployed in specific regions
// Can be extended to multiple regions if needed
const regions = [
  { region: 'us-east-1', name: 'us-east' },
  // Add more regions as needed: { region: 'eu-west-1', name: 'eu-west' },
];

// Deploy shared stack to each region
for (const { region, name } of regions) {
  new CygniSharedStack(app, `CygniSharedStack-${name}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region,
    },
    description: `Cygni shared multi-tenant infrastructure for ${region}`,
    tags: {
      Region: region,
      Environment: 'shared',
      Project: 'Cygni',
    },
  });
}