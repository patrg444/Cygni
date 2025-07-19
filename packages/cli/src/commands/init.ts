import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { detectFramework } from '../utils/framework-detector';
import { createProjectConfig, saveConfig } from '../utils/config';

export const initCommand = new Command('init')
  .description('Initialize a new CloudExpress project')
  .argument('[name]', 'Project name')
  .option('-f, --framework <framework>', 'Framework to use')
  .action(async (projectName, options) => {
    console.log(chalk.blue('Welcome to CloudExpress!'));
    console.log('Let\'s set up your new project.\n');

    // Get project name
    const name = projectName || await input({
      message: 'What is your project name?',
      default: path.basename(process.cwd()),
    });

    // Detect or ask for framework
    const detectedFramework = await detectFramework();
    const framework = options.framework || detectedFramework || await select({
      message: 'Which framework are you using?',
      choices: [
        { name: 'Next.js', value: 'nextjs' },
        { name: 'React', value: 'react' },
        { name: 'Vue', value: 'vue' },
        { name: 'Express', value: 'express' },
        { name: 'Fastify', value: 'fastify' },
        { name: 'Django', value: 'django' },
        { name: 'FastAPI', value: 'fastapi' },
        { name: 'Other', value: 'other' },
      ],
    });

    // Ask about services (for future use)
    // const needsDatabase = await confirm({
    //   message: 'Do you need a database?',
    //   default: true,
    // });

    // const needsAuth = await confirm({
    //   message: 'Do you need authentication?',
    //   default: true,
    // });

    // const needsStorage = await confirm({
    //   message: 'Do you need file storage?',
    //   default: false,
    // });

    // Create configuration
    const spinner = ora('Creating CloudExpress configuration...').start();

    try {
      const config = createProjectConfig(name, framework);

      // Save config file
      await saveConfig(config);

      spinner.succeed('Configuration created!');

      console.log('\n' + chalk.green('✨ Your project is ready!'));
      console.log('\nNext steps:');
      console.log(chalk.gray('  1. ') + 'Review your cygni.yaml configuration');
      console.log(chalk.gray('  2. ') + 'Run ' + chalk.cyan('cygni login') + ' to authenticate');
      console.log(chalk.gray('  3. ') + 'Run ' + chalk.cyan('cygni deploy') + ' to deploy your app');
      console.log('\nHappy coding! 🚀');
    } catch (error) {
      spinner.fail('Failed to create configuration');
      throw error;
    }
  });