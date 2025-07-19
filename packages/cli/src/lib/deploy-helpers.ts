import chalk from 'chalk';
import ora from 'ora';
// import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
// import { CygniConfig } from '../utils/config';
// import { BuildResult } from './builder';
import { getApiClient } from './api-client';

const execAsync = promisify(exec);

export interface DeploymentInfo {
  id: string;
  url: string;
  status: string;
  environment: string;
}

export interface BuildCacheEntry {
  gitSha: string;
  dockerfileHash: string;
  imageId: string;
  timestamp: number;
}

// Check if build is unchanged (idempotency)
export async function checkBuildCache(
  gitSha: string,
  dockerfilePath?: string
): Promise<BuildCacheEntry | null> {
  try {
    const api = await getApiClient();
    
    // Calculate dockerfile hash if present
    let dockerfileHash = '';
    if (dockerfilePath) {
      const { stdout } = await execAsync(`sha256sum ${dockerfilePath}`);
      dockerfileHash = stdout.split(' ')[0];
    }

    // Check cache
    const response = await api.get('/builds/cache', {
      params: {
        gitSha,
        dockerfileHash,
      },
    });

    if (response.data.cached) {
      return response.data.entry;
    }
  } catch (error) {
    // Cache miss or error, continue with build
  }

  return null;
}

// Validate deployment options
export function validateDeploymentOptions(options: any): void {
  const validStrategies = ['rolling', 'canary', 'blue-green'];
  if (options.strategy && !validStrategies.includes(options.strategy)) {
    throw new Error(`Invalid deployment strategy. Must be one of: ${validStrategies.join(', ')}`);
  }

  const validHealthGates = ['strict', 'normal', 'off'];
  if (options.healthGate && !validHealthGates.includes(options.healthGate)) {
    throw new Error(`Invalid health gate level. Must be one of: ${validHealthGates.join(', ')}`);
  }
}

// Display deployment summary
export function displayDeploymentSummary(deployment: DeploymentInfo, options: any): void {
  console.log('\n' + chalk.green('✅ Deployment Complete!'));
  console.log('\nYour app is available at:');
  console.log(chalk.cyan(deployment.url));
  console.log('\nDeployment ID: ' + chalk.gray(deployment.id));
  console.log('Environment: ' + chalk.gray(options.env));
  
  if (options.strategy !== 'rolling') {
    console.log('Strategy: ' + chalk.gray(options.strategy));
  }
}

// Get deployment history
export async function getDeploymentHistory(
  projectId: string,
  environment: string,
  limit: number = 10
): Promise<any[]> {
  const api = await getApiClient();
  const response = await api.get(`/projects/${projectId}/deployments`, {
    params: {
      environment,
      limit,
    },
  });

  return response.data.deployments;
}

// Check deployment health
export async function checkDeploymentHealth(
  deploymentId: string,
  healthGateLevel: string
): Promise<boolean> {
  const api = await getApiClient();
  const maxAttempts = healthGateLevel === 'strict' ? 10 : 5;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await api.get(`/deployments/${deploymentId}/health`);
      
      if (response.data.healthy) {
        return true;
      }

      if (healthGateLevel === 'off') {
        // Don't wait for health if gate is off
        return true;
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  return false;
}

// Handle deployment failure
export async function handleDeploymentFailure(
  deploymentId: string,
  error: any,
  options: any
): Promise<void> {
  console.error(chalk.red('\n❌ Deployment failed!'));
  console.error(chalk.red(error.message));

  if (options.autoRollback !== false) {
    const spinner = ora('Initiating automatic rollback...').start();
    
    try {
      const api = await getApiClient();
      await api.post(`/deployments/${deploymentId}/rollback`);
      spinner.succeed('Automatic rollback initiated');
    } catch (rollbackError) {
      spinner.fail('Automatic rollback failed');
    }
  }
}