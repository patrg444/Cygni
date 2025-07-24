#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CygniStagingStack } from '../lib/cygni-staging-stack';

const app = new cdk.App();

// Get environment from context or use defaults
const envName = app.node.tryGetContext('envName') || 'staging';
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

new CygniStagingStack(app, `CygniStagingStack-${envName}`, {
  env: {
    account,
    region,
  },
  description: 'Cygni staging environment infrastructure',
  tags: {
    Environment: envName,
    Project: 'Cygni',
    ManagedBy: 'CDK',
  },
});