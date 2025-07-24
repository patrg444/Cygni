import { Command } from "commander";
import chalk from "chalk";
import { GitDeployer } from "../lib/git-deployer";

export const deployGitCommand = new Command("deploy:git")
  .description("Deploy application directly from a Git repository")
  .argument("<repository>", "Git repository URL or GitHub URL")
  .option("-b, --branch <branch>", "Git branch to deploy", "main")
  .option("-c, --commit <commit>", "Specific commit SHA to deploy")
  .option("-e, --env <environment>", "Target environment", "production")
  .option("--provider <provider>", "Deployment provider", "cloudexpress")
  .option("--api-url <url>", "Backend API URL for frontend")
  .option("--skip-build", "Skip build step", false)
  .option("--template <name>", "Use a CloudExpress template")
  .action(async (repository: string, options) => {
    try {
      console.log(chalk.bold("\n🚀 CloudExpress Git Deployment\n"));

      const deployer = new GitDeployer();

      let result;

      if (options.template) {
        // Deploy from template
        result = await deployer.deployFromTemplate(
          options.template,
          repository,
          {
            environment: options.env,
            provider: options.provider,
            apiUrl: options.apiUrl,
            skipBuild: options.skipBuild,
          },
        );
      } else if (repository.includes("github.com")) {
        // Deploy from GitHub
        result = await deployer.deployFromGitHub(repository, {
          branch: options.branch,
          commit: options.commit,
          environment: options.env,
          provider: options.provider,
          apiUrl: options.apiUrl,
          skipBuild: options.skipBuild,
        });
      } else {
        // Deploy from generic Git URL
        result = await deployer.deployFromGit({
          repository,
          branch: options.branch,
          commit: options.commit,
          environment: options.env,
          provider: options.provider,
          apiUrl: options.apiUrl,
          skipBuild: options.skipBuild,
        });
      }

      if (result.success) {
        console.log(chalk.green("\n✅ Deployment Successful!"));

        if (result.deploymentUrls?.frontend || result.deploymentUrls?.backend) {
          console.log(chalk.bold("\n🌐 Your application is live at:"));

          if (result.deploymentUrls.frontend) {
            console.log(
              `  Frontend: ${chalk.cyan.underline(result.deploymentUrls.frontend)}`,
            );
          }

          if (result.deploymentUrls.backend) {
            console.log(
              `  Backend:  ${chalk.cyan.underline(result.deploymentUrls.backend)}`,
            );
          }
        }

        console.log(chalk.gray(`\n  Repository: ${result.repository}`));
        console.log(chalk.gray(`  Commit: ${result.commit.substring(0, 7)}`));
      } else {
        console.error(chalk.red("\n✗ Deployment failed:"), result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red("\n✗ Error:"), error.message);
      process.exit(1);
    }
  })
  .addHelpText(
    "after",
    `

Examples:
  $ cx deploy:git https://github.com/user/repo
  $ cx deploy:git https://github.com/user/repo --branch develop
  $ cx deploy:git git@github.com:user/repo.git --env staging
  $ cx deploy:git my-app --template nextjs-express

Available Templates:
  - nextjs-express    Next.js frontend + Express backend
  - react-fastify     React frontend + Fastify backend  
  - vue-django        Vue.js frontend + Django backend
  - angular-rails     Angular frontend + Rails backend
  - fullstack-ts      Full TypeScript stack
`,
  );
