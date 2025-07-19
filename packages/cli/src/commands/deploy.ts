import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { loadConfig } from '../utils/config';
import { buildProject } from '../lib/builder';
import { deployToCloudExpress } from '../lib/deployer';
import { watchLogs } from '../lib/logs';
import { getApiClient } from '../lib/api-client';

export const deployCommand = new Command('deploy')
  .description('Deploy your application to CloudExpress')
  .option('-w, --watch', 'Watch deployment logs')
  .option('-e, --env <environment>', 'Target environment', 'production')
  .option('--rollback', 'Rollback to previous deployment')
  .option('--health-gate <level>', 'Health gate level (strict, normal, off)', 'normal')
  .option('--strategy <strategy>', 'Deployment strategy (rolling, canary)', 'rolling')
  .action(async (options) => {
    if (options.rollback) {
      return handleRollback(options);
    }
    console.log(chalk.blue('Deploying to CloudExpress...\n'));

    try {
      // Load configuration
      const config = await loadConfig();
      
      // Build project
      const buildSpinner = ora('Building project...').start();
      const buildResult = await buildProject(config);
      buildSpinner.succeed('Build complete!');

      // Deploy
      const deploySpinner = ora('Deploying application...').start();
      const deployment = await deployToCloudExpress({
        config,
        buildResult,
        environment: options.env,
      });
      deploySpinner.succeed('Deployment successful!');

      // Show deployment info
      console.log('\n' + chalk.green('✅ Deployment Complete!'));
      console.log('\nYour app is available at:');
      console.log(chalk.cyan(deployment.url));
      console.log('\nDeployment ID: ' + chalk.gray(deployment.id));
      console.log('Environment: ' + chalk.gray(options.env));

      // Watch logs if requested
      if (options.watch) {
        console.log('\n' + chalk.yellow('Watching deployment logs...'));
        await watchLogs(deployment.id);
      }
    } catch (error: any) {
      console.error(chalk.red('Deployment failed:'), error.message);
      process.exit(1);
    }
  });

async function handleRollback(options: any) {
  console.log(chalk.blue('Rolling back deployment...\n'));

  try {
    const config = await loadConfig();
    const api = await getApiClient();

    // Get current deployment status
    const projectId = config.projectId;
    if (!projectId) {
      console.error(chalk.red('No project found. Run "cygni init" first.'));
      process.exit(1);
    }

    // Get latest deployment
    const deployments = await api.get(`/projects/${projectId}/deployments`, {
      params: {
        environment: options.env,
        limit: 1,
      },
    });

    if (deployments.data.deployments.length === 0) {
      console.error(chalk.red('No deployments found to rollback'));
      process.exit(1);
    }

    const currentDeployment = deployments.data.deployments[0];
    
    // Get deployment details to check if rollback is possible
    const deploymentDetails = await api.get(`/deployments/${currentDeployment.id}`);
    
    if (!deploymentDetails.data.previousImage) {
      console.error(chalk.red('No previous deployment available for rollback'));
      process.exit(1);
    }

    console.log('Current deployment:');
    console.log(chalk.gray(`  Image: ${deploymentDetails.data.currentImage}`));
    console.log(chalk.gray(`  Status: ${deploymentDetails.data.status}`));
    console.log('\nWill rollback to:');
    console.log(chalk.green(`  Image: ${deploymentDetails.data.previousImage}`));

    const confirmed = await confirm({
      message: 'Are you sure you want to rollback?',
      default: false,
    });

    if (!confirmed) {
      console.log('Rollback cancelled');
      return;
    }

    const spinner = ora('Initiating rollback...').start();

    // Trigger rollback
    const rollbackResponse = await api.post(`/deployments/${currentDeployment.id}/rollback`);
    
    spinner.succeed('Rollback initiated!');

    console.log('\n' + chalk.green('✅ Rollback Started!'));
    console.log('Deployment ID: ' + chalk.gray(rollbackResponse.data.id));
    
    if (options.watch) {
      console.log('\n' + chalk.yellow('Watching rollback progress...'));
      await watchLogs(rollbackResponse.data.id);
    } else {
      console.log('\nMonitor rollback with:');
      console.log(chalk.cyan(`  cygni logs ${rollbackResponse.data.id} --follow`));
    }
  } catch (error: any) {
    console.error(chalk.red('Rollback failed:'), error.response?.data?.error || error.message);
    process.exit(1);
  }
}