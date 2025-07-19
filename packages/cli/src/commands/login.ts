import { Command } from 'commander';
import { input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { saveAuth } from '../utils/auth';

export const loginCommand = new Command('login')
  .description('Login to CloudExpress')
  .option('--email <email>', 'Email address')
  .option('--token <token>', 'Use API token instead of password')
  .action(async (options) => {
    console.log(chalk.blue('Welcome to CloudExpress!'));
    console.log('Please login to continue.\n');

    const baseURL = process.env.CLOUDEXPRESS_API_URL || 'https://api.cygni.io';

    try {
      let token: string;
      let userData: any;

      if (options.token) {
        // API token login
        token = options.token;
        
        // Verify token
        const response = await axios.get(`${baseURL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        userData = response.data;
      } else {
        // Email/password login
        const email = options.email || await input({
          message: 'Email:',
          validate: (value) => {
            if (!value.includes('@')) {
              return 'Please enter a valid email address';
            }
            return true;
          },
        });

        const userPassword = await password({
          message: 'Password:',
          mask: '*',
        });

        const spinner = ora('Logging in...').start();

        try {
          const response = await axios.post(`${baseURL}/api/auth/login`, {
            email,
            password: userPassword,
          });

          spinner.succeed('Login successful!');
          
          token = response.data.token;
          userData = response.data;
        } catch (error: any) {
          spinner.fail('Login failed');
          
          if (error.response?.status === 401) {
            console.error(chalk.red('Invalid email or password'));
          } else {
            console.error(chalk.red('Error:'), error.response?.data?.error || error.message);
          }
          
          process.exit(1);
        }
      }

      // Save auth data
      await saveAuth({
        token,
        email: userData.user.email,
        organizations: userData.organizations || [],
      });

      console.log('\n' + chalk.green('✓ Logged in successfully!'));
      console.log('\nOrganizations:');
      userData.organizations?.forEach((org: any) => {
        console.log(`  - ${org.name} (${org.slug}) [${org.role}]`);
      });
      
      console.log('\nYou can now deploy your applications with ' + chalk.cyan('cygni deploy'));
    } catch (error: any) {
      console.error(chalk.red('Login failed:'), error.response?.data?.error || error.message);
      process.exit(1);
    }
  });