import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../lib/api-client";
import { loadConfig } from "../utils/config";
import { formatDistanceToNow } from "date-fns";

export const statusCommand = new Command("status")
  .description("Check deployment status")
  .option("-p, --project <project>", "Project name or ID")
  .option("-e, --env <environment>", "Environment", "production")
  .option("--json", "Output in JSON format")
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const api = await getApiClient();

      const projectId = options.project || config.projectId;
      if (!projectId) {
        console.error(
          chalk.red(
            "No project specified. Use --project or run from a project directory.",
          ),
        );
        process.exit(1);
      }

      // Get project info
      const project = await api.get(`/projects/${projectId}`);

      // Get latest deployments
      const deployments = await api.get(`/projects/${projectId}/deployments`, {
        params: {
          environment: options.env,
          limit: 5,
        },
      });

      // Get project metrics
      const metrics = await api
        .get(`/projects/${projectId}/metrics`)
        .catch(() => ({ data: {} }));

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              project: project.data,
              deployments: deployments.data.deployments,
              metrics: metrics.data,
            },
            null,
            2,
          ),
        );
        return;
      }

      // Display status
      console.log(chalk.bold.blue(`\n${project.data.name}`));
      console.log(chalk.gray(`Project ID: ${project.data.id}`));
      console.log(
        chalk.gray(`Organization: ${project.data.organization.name}`),
      );
      if (project.data.repository) {
        console.log(chalk.gray(`Repository: ${project.data.repository}`));
      }

      // Environments
      console.log(chalk.bold("\n📍 Environments:"));
      project.data.environments.forEach((env: any) => {
        const latestDeploy = deployments.data.deployments.find(
          (d: any) => d.environment === env.slug,
        );

        const status = latestDeploy?.status || "no deployments";
        const statusColors: Record<string, typeof chalk.green> = {
          active: chalk.green,
          failed: chalk.red,
          deploying: chalk.yellow,
          pending: chalk.yellow,
        };
        const statusColor = statusColors[status] || chalk.gray;

        console.log(`  ${env.name}: ${statusColor(status)}`);
        if (env.domain) {
          console.log(chalk.gray(`    → https://${env.domain}`));
        }
      });

      // Recent deployments
      console.log(chalk.bold("\n🚀 Recent Deployments:"));
      if (deployments.data.deployments.length === 0) {
        console.log(chalk.gray("  No deployments yet"));
      } else {
        deployments.data.deployments.forEach((deploy: any) => {
          const statusIcons: Record<string, string> = {
            active: "✅",
            failed: "❌",
            deploying: "🔄",
            pending: "⏳",
          };
          const statusIcon = statusIcons[deploy.status] || "❓";

          const time = formatDistanceToNow(new Date(deploy.createdAt), {
            addSuffix: true,
          });

          console.log(
            `  ${statusIcon} ${deploy.id.slice(0, 8)} - ${deploy.environment} - ${time}`,
          );
          console.log(
            chalk.gray(
              `     Commit: ${deploy.build.commitSha.slice(0, 7)} (${deploy.build.branch})`,
            ),
          );
        });
      }

      // Metrics
      if (metrics.data.requests) {
        console.log(chalk.bold("\n📊 Metrics (last 24h):"));
        console.log(`  Requests: ${metrics.data.requests.total || 0}`);
        console.log(`  Errors: ${metrics.data.requests.errors || 0}`);
        console.log(
          `  Avg Response Time: ${metrics.data.requests.avgResponseTime || 0}ms`,
        );
      }

      // Quick actions
      console.log(chalk.bold("\n💡 Quick Actions:"));
      console.log(chalk.gray("  Deploy:     ") + chalk.cyan("cygni deploy"));
      console.log(
        chalk.gray("  View logs:  ") + chalk.cyan("cygni logs --follow"),
      );
      console.log(
        chalk.gray("  Rollback:   ") + chalk.cyan("cygni deploy --rollback"),
      );
    } catch (error: any) {
      console.error(
        chalk.red("Error:"),
        error.response?.data?.error || error.message,
      );
      process.exit(1);
    }
  });
