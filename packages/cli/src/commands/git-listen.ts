import { Command } from "commander";
import express from "express";
import crypto from "crypto";
import chalk from "chalk";
import { execSync } from "child_process";
import axios from "axios";
import { loadConfig } from "../utils/config";

interface GitHubWebhookPayload {
  action: string;
  pull_request?: {
    number: number;
    title: string;
    head: {
      ref: string;
      sha: string;
      repo: {
        clone_url: string;
      };
    };
    base: {
      ref: string;
    };
    html_url: string;
    user: {
      login: string;
    };
  };
  repository?: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export const gitListenCommand = new Command()
  .name("listen")
  .description(
    "Listen for GitHub webhook events and create preview environments",
  )
  .option("-p, --port <port>", "Port to listen on", "3333")
  .option("--secret <secret>", "GitHub webhook secret for verification")
  .option("--dry-run", "Simulate deployments without actually creating them")
  .action(async (options) => {
    const app = express();

    // Middleware to capture raw body for signature verification
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf.toString("utf8");
        },
      }),
    );

    // GitHub webhook endpoint
    app.post("/webhook", async (req, res) => {
      console.log(chalk.blue("📨 Received webhook event"));

      try {
        // Verify webhook signature if secret is provided
        if (options.secret) {
          const signature = req.headers["x-hub-signature-256"] as string;
          if (
            !verifyWebhookSignature(req.body, signature, options.secret, req)
          ) {
            console.error(chalk.red("❌ Invalid webhook signature"));
            res.status(401).send("Unauthorized");
            return;
          }
        }

        const payload: GitHubWebhookPayload = req.body;
        const event = req.headers["x-github-event"] as string;

        console.log(chalk.gray(`Event: ${event}, Action: ${payload.action}`));

        // Handle pull request events
        if (event === "pull_request" && payload.pull_request) {
          const pr = payload.pull_request;

          switch (payload.action) {
            case "opened":
            case "synchronize": // New commits pushed
              await handlePROpened(pr, payload.repository!, options.dryRun);
              break;

            case "closed":
              await handlePRClosed(pr, payload.repository!, options.dryRun);
              break;
          }
        }

        res.status(200).send("OK");
      } catch (error) {
        console.error(chalk.red("Error handling webhook:"), error);
        res.status(500).send("Internal Server Error");
      }
    });

    // Health check endpoint
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    const server = app.listen(options.port, () => {
      console.log(
        chalk.green(`🎧 Git webhook listener started on port ${options.port}`),
      );
      console.log(
        chalk.gray(`Webhook URL: http://localhost:${options.port}/webhook`),
      );
      console.log(
        chalk.gray(`Health check: http://localhost:${options.port}/health`),
      );
      console.log(
        chalk.yellow(
          "\nMake sure to configure your GitHub webhook to point to this URL",
        ),
      );
      console.log(chalk.yellow("Events to subscribe: Pull requests"));
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log(chalk.gray("\n👋 Shutting down webhook listener..."));
      server.close(() => {
        process.exit(0);
      });
    });
  });

function verifyWebhookSignature(
  payload: any,
  signature: string,
  secret: string,
  req: any,
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest =
    "sha256=" +
    hmac.update(req.rawBody || JSON.stringify(payload)).digest("hex");

  // Constant time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

async function handlePROpened(
  pr: GitHubWebhookPayload["pull_request"],
  repo: GitHubWebhookPayload["repository"],
  dryRun: boolean = false,
) {
  if (!pr || !repo) return;

  const namespace = `preview-${pr.number}`;
  const prBranch = pr.head.ref;
  const repoUrl = pr.head.repo.clone_url;

  console.log(
    chalk.blue(`\n🔄 Creating preview environment for PR #${pr.number}`),
  );
  console.log(chalk.gray(`  Title: ${pr.title}`));
  console.log(chalk.gray(`  Branch: ${prBranch}`));
  console.log(chalk.gray(`  Namespace: ${namespace}`));

  try {
    if (dryRun) {
      console.log(chalk.yellow("🏃 Dry run mode - simulating deployment"));

      // Simulate deployment
      const previewUrl = `https://${namespace}.preview.cygni.dev`;
      console.log(chalk.green(`✅ Preview environment created: ${previewUrl}`));

      // Simulate posting comment
      console.log(chalk.blue("💬 Would post comment to PR:"));
      console.log(
        chalk.gray(generatePRComment(previewUrl, namespace, pr.head.sha)),
      );

      return;
    }

    // Step 1: Clone the repository to a temp directory
    const tempDir = `/tmp/preview-${pr.number}-${Date.now()}`;
    console.log(chalk.gray(`📁 Cloning repository to ${tempDir}`));

    execSync(`git clone --depth 1 --branch ${prBranch} ${repoUrl} ${tempDir}`, {
      stdio: "inherit",
    });

    // Step 2: Run deployment with namespace
    console.log(chalk.gray(`🚀 Deploying to namespace: ${namespace}`));

    execSync(`cx deploy --namespace ${namespace} --environment preview`, {
      cwd: tempDir,
      stdio: "inherit",
    });

    // Step 3: Get the preview URL (this would come from the deployment result)
    const previewUrl = `https://${namespace}.preview.cygni.dev`;

    // Step 4: Post comment back to PR
    await postPRComment(pr, repo, previewUrl, namespace);

    // Clean up temp directory
    execSync(`rm -rf ${tempDir}`);

    console.log(chalk.green(`✅ Preview environment created successfully!`));
  } catch (error) {
    console.error(
      chalk.red(`❌ Failed to create preview environment: ${error}`),
    );

    // Post error comment to PR
    if (!dryRun) {
      await postPRComment(pr, repo, null, namespace, error);
    }
  }
}

async function handlePRClosed(
  pr: GitHubWebhookPayload["pull_request"],
  repo: GitHubWebhookPayload["repository"],
  dryRun: boolean = false,
) {
  if (!pr || !repo) return;

  const namespace = `preview-${pr.number}`;

  console.log(
    chalk.blue(`\n🗑️  Cleaning up preview environment for PR #${pr.number}`),
  );
  console.log(chalk.gray(`  Namespace: ${namespace}`));

  try {
    if (dryRun) {
      console.log(chalk.yellow("🏃 Dry run mode - simulating cleanup"));
      console.log(
        chalk.green(`✅ Preview environment ${namespace} would be deleted`),
      );
      return;
    }

    // Delete the preview deployment
    execSync(`cx delete --namespace ${namespace} --force`, {
      stdio: "inherit",
    });

    console.log(chalk.green(`✅ Preview environment cleaned up successfully!`));
  } catch (error) {
    console.error(
      chalk.red(`❌ Failed to clean up preview environment: ${error}`),
    );
  }
}

async function postPRComment(
  pr: GitHubWebhookPayload["pull_request"],
  repo: GitHubWebhookPayload["repository"],
  previewUrl: string | null,
  namespace: string,
  error?: any,
) {
  if (!pr || !repo) return;

  const config = await loadConfig();
  const githubToken = process.env.GITHUB_TOKEN || (config as any).githubToken;

  if (!githubToken) {
    console.warn(
      chalk.yellow(
        "⚠️  No GitHub token found. Set GITHUB_TOKEN to post PR comments.",
      ),
    );
    return;
  }

  const comment = error
    ? generatePRErrorComment(namespace, error)
    : generatePRComment(previewUrl!, namespace, pr.head.sha);

  try {
    await axios.post(
      `https://api.github.com/repos/${repo.full_name}/issues/${pr.number}/comments`,
      { body: comment },
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    console.log(chalk.green("✅ Posted comment to PR"));
  } catch (error: any) {
    console.error(chalk.red(`❌ Failed to post PR comment: ${error.message}`));
  }
}

function generatePRComment(
  previewUrl: string,
  namespace: string,
  sha: string,
): string {
  return `🚀 **Preview Environment Ready!**

Your changes have been deployed to a preview environment:

🔗 **Preview URL**: ${previewUrl}
📦 **Namespace**: \`${namespace}\`
🔨 **Commit**: \`${sha.substring(0, 7)}\`

---

### Deployment Details
- **Environment**: Preview
- **Auto-cleanup**: This environment will be automatically deleted when the PR is closed
- **Database**: Isolated copy of production data

### Available Commands
\`\`\`bash
# View logs
cx logs --namespace ${namespace}

# Redeploy
cx deploy --namespace ${namespace}

# Delete manually
cx delete --namespace ${namespace}
\`\`\`

---
<sub>🤖 Posted by Cygni Preview Bot</sub>`;
}

function generatePRErrorComment(namespace: string, error: any): string {
  return `❌ **Preview Environment Failed**

Failed to create preview environment for this PR.

**Error**: \`\`\`
${error.message || error}
\`\`\`

**Namespace**: \`${namespace}\`

Please check your code and try again. If this issue persists, contact support.

---
<sub>🤖 Posted by Cygni Preview Bot</sub>`;
}
