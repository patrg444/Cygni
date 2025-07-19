import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../lib/api-client";
import { loadConfig } from "../utils/config";
import { WebSocket } from "ws";

export const logsCommand = new Command("logs")
  .description("View application logs")
  .argument("[deployment-id]", "Deployment ID (defaults to latest)")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <number>", "Number of lines to show", "100")
  .option("-p, --project <project>", "Project name or ID")
  .option("-e, --env <environment>", "Environment", "production")
  .option("--since <duration>", "Show logs since duration (e.g. 5m, 1h)")
  .option("--json", "Output logs in JSON format")
  .action(async (deploymentId, options) => {
    try {
      const config = await loadConfig();
      const api = await getApiClient();

      let deployment;

      if (deploymentId) {
        deployment = await api.get(`/deployments/${deploymentId}`);
      } else {
        // Get latest deployment
        const projectId = options.project || config.projectId;
        if (!projectId) {
          console.error(
            chalk.red(
              "No project specified. Use --project or run from a project directory.",
            ),
          );
          process.exit(1);
        }

        const deployments = await api.get(
          `/projects/${projectId}/deployments`,
          {
            params: {
              environment: options.env,
              limit: 1,
            },
          },
        );

        if (deployments.data.deployments.length === 0) {
          console.error(chalk.red("No deployments found"));
          process.exit(1);
        }

        deployment = deployments.data.deployments[0];
      }

      console.log(
        chalk.blue(`Fetching logs for deployment ${deployment.id}...`),
      );

      if (options.follow) {
        // WebSocket connection for streaming logs
        const wsUrl = process.env.CLOUDEXPRESS_WS_URL || "wss://api.cygni.io";
        const ws = new WebSocket(
          `${wsUrl}/deployments/${deployment.id}/logs/stream`,
          {
            headers: {
              Authorization: `Bearer ${api.defaults.headers.Authorization}`,
            },
          },
        );

        ws.on("open", () => {
          console.log(chalk.gray("Connected to log stream...\n"));
        });

        ws.on("message", (data) => {
          const log = JSON.parse(data.toString());
          if (options.json) {
            console.log(JSON.stringify(log));
          } else {
            formatLog(log);
          }
        });

        ws.on("error", (error) => {
          console.error(chalk.red("WebSocket error:"), error.message);
          process.exit(1);
        });

        ws.on("close", () => {
          console.log(chalk.gray("\nLog stream closed"));
          process.exit(0);
        });

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          ws.close();
          process.exit(0);
        });
      } else {
        // Fetch static logs
        const response = await api.get(`/deployments/${deployment.id}/logs`, {
          params: {
            lines: options.lines,
            since: options.since,
          },
        });

        if (options.json) {
          console.log(JSON.stringify(response.data.logs, null, 2));
        } else {
          response.data.logs.forEach(formatLog);
        }
      }
    } catch (error: any) {
      console.error(
        chalk.red("Error:"),
        error.response?.data?.error || error.message,
      );
      process.exit(1);
    }
  });

function formatLog(log: any) {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  const level = log.level || "info";
  const levelColors: Record<string, typeof chalk.red> = {
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.blue,
    debug: chalk.gray,
  };
  const levelColor = levelColors[level] || chalk.white;

  const prefix = `${chalk.gray(timestamp)} ${levelColor(level.toUpperCase().padEnd(5))}`;
  const message = log.message || log.msg || JSON.stringify(log);

  console.log(`${prefix} ${message}`);

  // Show stack trace for errors
  if (log.stack && level === "error") {
    console.log(chalk.gray(log.stack));
  }
}
