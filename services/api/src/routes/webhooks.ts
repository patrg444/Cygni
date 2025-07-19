import { FastifyPluginAsync } from "fastify";
import * as crypto from "crypto";
import { prisma } from "../utils/prisma";
import { BuildStatus } from "@prisma/client";
import axios from "axios";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL || "http://runtime-orchestrator:8080";

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // GitHub webhook
  app.post("/webhooks/github", async (request, reply) => {
    // Verify webhook signature
    const signature = request.headers["x-hub-signature-256"] as string;
    const event = request.headers["x-github-event"] as string;

    if (!signature || !verifyGitHubSignature(request.body, signature)) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const payload = request.body as any;

    switch (event) {
      case "pull_request":
        await handlePullRequestEvent(app, payload);
        break;

      case "push":
        await handlePushEvent(app, payload);
        break;

      default:
        app.log.info("Unhandled GitHub event", { event });
    }

    return { status: "ok" };
  });

  // GitLab webhook
  app.post("/webhooks/gitlab", async (request, reply) => {
    const token = request.headers["x-gitlab-token"] as string;

    if (!token || token !== process.env.GITLAB_WEBHOOK_SECRET) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    const event = request.headers["x-gitlab-event"] as string;
    const payload = request.body as any;

    switch (event) {
      case "Merge Request Hook":
        await handleGitLabMergeRequest(app, payload);
        break;

      case "Push Hook":
        await handleGitLabPush(app, payload);
        break;

      default:
        app.log.info("Unhandled GitLab event", { event });
    }

    return { status: "ok" };
  });
};

async function handlePullRequestEvent(app: any, payload: any) {
  const { action, pull_request: pr, repository } = payload;

  // Find project by repository URL
  const project = await prisma.project.findFirst({
    where: {
      repository: {
        in: [repository.html_url, repository.clone_url, repository.ssh_url],
      },
    },
  });

  if (!project) {
    app.log.info("No project found for repository", {
      repo: repository.html_url,
    });
    return;
  }

  switch (action) {
    case "opened":
    case "reopened":
    case "synchronize":
      // Create or update preview environment
      await createPreviewEnvironment(app, project, pr);

      // Trigger build for the PR
      await triggerBuild(app, project, {
        commitSha: pr.head.sha,
        branch: pr.head.ref,
        isPullRequest: true,
        pullRequestNumber: pr.number,
      });
      break;

    case "closed":
      // Delete preview environment
      await deletePreviewEnvironment(app, project, pr.number);
      break;
  }

  // Update PR status
  await updateGitHubStatus(app, {
    owner: repository.owner.login,
    repo: repository.name,
    sha: pr.head.sha,
    state: "pending",
    context: "cygni/preview",
    description: "Creating preview environment...",
  });
}

async function handlePushEvent(app: any, payload: any) {
  const { ref, after: commitSha, repository } = payload;

  // Only process default branch pushes
  if (ref !== `refs/heads/${repository.default_branch}`) {
    return;
  }

  const project = await prisma.project.findFirst({
    where: {
      repository: {
        in: [repository.html_url, repository.clone_url, repository.ssh_url],
      },
    },
  });

  if (!project) {
    return;
  }

  // Trigger production build
  await triggerBuild(app, project, {
    commitSha,
    branch: repository.default_branch,
    isPullRequest: false,
  });
}

async function createPreviewEnvironment(app: any, project: any, pr: any) {
  try {
    // Create preview environment in orchestrator
    await axios.post(`${ORCHESTRATOR_URL}/api/preview-environments`, {
      projectId: project.id,
      pullRequest: pr.number,
      branch: pr.head.ref,
      baseEnvironment: "production",
      ttl: "72h",
      database: {
        cloneFrom: "production",
        maxSize: "1Gi",
        anonymize: true,
      },
    });

    app.log.info("Created preview environment", {
      projectId: project.id,
      pr: pr.number,
    });

    // Add comment to PR
    await addGitHubComment(app, {
      owner: pr.base.repo.owner.login,
      repo: pr.base.repo.name,
      issue: pr.number,
      body:
        `🚀 **CloudExpress Preview Environment**\n\n` +
        `Your preview environment is being created!\n\n` +
        `It will be available at: https://pr-${pr.number}--${project.slug}.preview.cygni.app\n\n` +
        `This environment will automatically update with each push to this PR.`,
    });
  } catch (error) {
    app.log.error("Failed to create preview environment", { error });
  }
}

async function deletePreviewEnvironment(
  app: any,
  project: any,
  prNumber: number,
) {
  try {
    await axios.delete(
      `${ORCHESTRATOR_URL}/api/preview-environments/pr-${prNumber}-${project.slug}`,
    );

    app.log.info("Deleted preview environment", {
      projectId: project.id,
      pr: prNumber,
    });
  } catch (error) {
    app.log.error("Failed to delete preview environment", { error });
  }
}

async function triggerBuild(
  app: any,
  project: any,
  options: {
    commitSha: string;
    branch: string;
    isPullRequest: boolean;
    pullRequestNumber?: number;
  },
) {
  try {
    // Create build record
    const build = await prisma.build.create({
      data: {
        projectId: project.id,
        commitSha: options.commitSha,
        branch: options.branch,
        status: BuildStatus.pending,
        metadata: {
          isPullRequest: options.isPullRequest,
          pullRequestNumber: options.pullRequestNumber,
        },
      },
    });

    // Trigger build in builder service
    const builderUrl = process.env.BUILDER_SERVICE_URL || "http://builder:3001";
    await axios.post(`${builderUrl}/api/builds`, {
      buildId: build.id,
      projectId: project.id,
      repoUrl: project.repository,
      commitSha: options.commitSha,
      dockerfilePath: project.dockerfilePath,
    });

    app.log.info("Triggered build", {
      buildId: build.id,
      project: project.id,
      sha: options.commitSha,
    });
  } catch (error) {
    app.log.error("Failed to trigger build", { error });
  }
}

async function updateGitHubStatus(
  app: any,
  options: {
    owner: string;
    repo: string;
    sha: string;
    state: "pending" | "success" | "failure" | "error";
    context: string;
    description: string;
    targetUrl?: string;
  },
) {
  try {
    const githubToken =
      process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!githubToken) {
      app.log.warn("No GitHub token configured, skipping status update");
      return;
    }

    await axios.post(
      `https://api.github.com/repos/${options.owner}/${options.repo}/statuses/${options.sha}`,
      {
        state: options.state,
        context: options.context,
        description: options.description,
        target_url: options.targetUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );
  } catch (error) {
    app.log.error("Failed to update GitHub status", { error });
  }
}

async function addGitHubComment(
  app: any,
  options: {
    owner: string;
    repo: string;
    issue: number;
    body: string;
  },
) {
  try {
    const githubToken =
      process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return;
    }

    await axios.post(
      `https://api.github.com/repos/${options.owner}/${options.repo}/issues/${options.issue}/comments`,
      { body: options.body },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );
  } catch (error) {
    app.log.error("Failed to add GitHub comment", { error });
  }
}

async function handleGitLabMergeRequest(app: any, payload: any) {
  const { object_attributes: mr, project } = payload;

  const cygniProject = await prisma.project.findFirst({
    where: {
      repository: {
        in: [project.git_http_url, project.git_ssh_url],
      },
    },
  });

  if (!cygniProject) {
    return;
  }

  switch (mr.action) {
    case "open":
    case "reopen":
    case "update":
      await createPreviewEnvironment(app, cygniProject, {
        number: mr.iid,
        head: {
          ref: mr.source_branch,
          sha: mr.last_commit.id,
        },
        base: {
          repo: {
            owner: { login: project.namespace },
            name: project.name,
          },
        },
      });
      break;

    case "close":
    case "merge":
      await deletePreviewEnvironment(app, cygniProject, mr.iid);
      break;
  }
}

async function handleGitLabPush(app: any, payload: any) {
  const { ref, after: commitSha, project } = payload;

  if (ref !== `refs/heads/${project.default_branch}`) {
    return;
  }

  const cygniProject = await prisma.project.findFirst({
    where: {
      repository: {
        in: [project.git_http_url, project.git_ssh_url],
      },
    },
  });

  if (!cygniProject) {
    return;
  }

  await triggerBuild(app, cygniProject, {
    commitSha,
    branch: project.default_branch,
    isPullRequest: false,
  });
}

function verifyGitHubSignature(payload: any, signature: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  const calculatedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature),
  );
}
