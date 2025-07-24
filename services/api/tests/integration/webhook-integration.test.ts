import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

describe("Webhook Integration", () => {
  const API_URL = process.env.API_URL || "http://localhost:3000";
  const prisma = new PrismaClient();

  let isServicesRunning = false;
  let authToken: string;
  let projectId: string;
  let webhookId: string;
  let organizationId: string;

  beforeAll(async () => {
    // Check if services are running
    try {
      const health = await axios.get(`${API_URL}/health`);
      isServicesRunning = health.status === 200;
    } catch {
      isServicesRunning = false;
    }

    if (isServicesRunning) {
      // Create test user and project
      const testEmail = `webhook-test-${Date.now()}@example.com`;
      const signupResponse = await axios.post(`${API_URL}/api/auth/signup`, {
        email: testEmail,
        password: "TestPassword123!",
        name: "Webhook Test User",
        organizationName: "Webhook Test Org",
      });

      authToken = signupResponse.data.token;
      organizationId = signupResponse.data.organization.id;

      // Create a project
      const projectResponse = await axios.post(
        `${API_URL}/api/projects`,
        {
          name: "Webhook Test Project",
          slug: "webhook-test",
          repository: "https://github.com/test/webhook-project",
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      projectId = projectResponse.data.id;
    }
  });

  afterAll(async () => {
    // Cleanup
    if (isServicesRunning && organizationId) {
      try {
        await prisma.webhook.deleteMany({
          where: { projectId },
        });
        await prisma.project.deleteMany({
          where: { organizationId },
        });
        await prisma.user.deleteMany({
          where: { organizationId },
        });
        await prisma.organization.delete({
          where: { id: organizationId },
        });
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    }
    await prisma.$disconnect();
  });

  it("should create a webhook configuration", async function () {
    if (!isServicesRunning || !authToken || !projectId) {
      this.skip();
    }

    const webhookResponse = await axios.post(
      `${API_URL}/api/projects/${projectId}/webhooks`,
      {
        provider: "github",
        events: ["push", "pull_request"],
        config: {
          branch: "main",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(webhookResponse.status).toBe(201);
    expect(webhookResponse.data).toHaveProperty("id");
    expect(webhookResponse.data).toHaveProperty("secret");
    expect(webhookResponse.data.provider).toBe("github");
    expect(webhookResponse.data.events).toContain("push");
    expect(webhookResponse.data.events).toContain("pull_request");

    webhookId = webhookResponse.data.id;
  });

  it("should list webhooks for project", async function () {
    if (!isServicesRunning || !authToken || !projectId) {
      this.skip();
    }

    const listResponse = await axios.get(
      `${API_URL}/api/projects/${projectId}/webhooks`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.data)).toBe(true);
    expect(listResponse.data.length).toBeGreaterThan(0);

    const webhook = listResponse.data.find((w: any) => w.id === webhookId);
    expect(webhook).toBeDefined();
    expect(webhook.secret).toBeUndefined(); // Should not expose secret in list
  });

  it("should get webhook details", async function () {
    if (!isServicesRunning || !authToken || !webhookId) {
      this.skip();
    }

    const webhookResponse = await axios.get(
      `${API_URL}/api/webhooks/${webhookId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.data.id).toBe(webhookId);
    expect(webhookResponse.data).toHaveProperty("secret"); // Should show secret in detail view
  });

  it("should handle GitHub push webhook", async function () {
    if (!isServicesRunning || !webhookId) {
      this.skip();
    }

    // Get webhook secret
    const webhookResponse = await axios.get(
      `${API_URL}/api/webhooks/${webhookId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const webhookSecret = webhookResponse.data.secret;

    // Create GitHub push payload
    const payload = {
      ref: "refs/heads/main",
      repository: {
        full_name: "test/webhook-project",
        clone_url: "https://github.com/test/webhook-project.git",
      },
      head_commit: {
        id: "abc123def456",
        message: "Test commit",
        author: {
          name: "Test User",
          email: "test@example.com",
        },
      },
      pusher: {
        name: "test-user",
      },
    };

    // Calculate signature
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Send webhook
    const webhookCallResponse = await axios.post(
      `${API_URL}/api/webhooks/github`,
      payload,
      {
        headers: {
          "X-GitHub-Event": "push",
          "X-Hub-Signature-256": `sha256=${signature}`,
          "X-GitHub-Delivery": `test-delivery-${Date.now()}`,
          "Content-Type": "application/json",
        },
      },
    );

    expect(webhookCallResponse.status).toBe(200);
    expect(webhookCallResponse.data).toHaveProperty("buildId");
  });

  it("should handle GitHub pull request webhook", async function () {
    if (!isServicesRunning || !webhookId) {
      this.skip();
    }

    // Get webhook secret
    const webhookResponse = await axios.get(
      `${API_URL}/api/webhooks/${webhookId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const webhookSecret = webhookResponse.data.secret;

    // Create GitHub PR payload
    const payload = {
      action: "opened",
      pull_request: {
        number: 123,
        title: "Test PR",
        head: {
          ref: "feature/test-branch",
          sha: "def456abc789",
        },
        base: {
          ref: "main",
        },
        user: {
          login: "test-user",
        },
      },
      repository: {
        full_name: "test/webhook-project",
        clone_url: "https://github.com/test/webhook-project.git",
      },
    };

    // Calculate signature
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Send webhook
    const webhookCallResponse = await axios.post(
      `${API_URL}/api/webhooks/github`,
      payload,
      {
        headers: {
          "X-GitHub-Event": "pull_request",
          "X-Hub-Signature-256": `sha256=${signature}`,
          "X-GitHub-Delivery": `test-pr-delivery-${Date.now()}`,
          "Content-Type": "application/json",
        },
      },
    );

    expect(webhookCallResponse.status).toBe(200);
    expect(webhookCallResponse.data).toHaveProperty("message");
  });

  it("should reject webhook with invalid signature", async function () {
    if (!isServicesRunning) {
      this.skip();
    }

    const payload = {
      ref: "refs/heads/main",
      repository: {
        full_name: "test/webhook-project",
      },
    };

    try {
      await axios.post(`${API_URL}/api/webhooks/github`, payload, {
        headers: {
          "X-GitHub-Event": "push",
          "X-Hub-Signature-256": "sha256=invalidsignature",
          "X-GitHub-Delivery": "test-invalid",
          "Content-Type": "application/json",
        },
      });

      expect.fail("Expected webhook to fail with invalid signature");
    } catch (error: any) {
      expect(error.response?.status).toBe(401);
    }
  });

  it("should handle GitLab push webhook", async function () {
    if (!isServicesRunning || !projectId) {
      this.skip();
    }

    // Create GitLab webhook
    const gitlabWebhookResponse = await axios.post(
      `${API_URL}/api/projects/${projectId}/webhooks`,
      {
        provider: "gitlab",
        events: ["push", "merge_request"],
        config: {
          branch: "main",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const gitlabSecret = gitlabWebhookResponse.data.secret;

    // Create GitLab push payload
    const payload = {
      object_kind: "push",
      ref: "refs/heads/main",
      project: {
        path_with_namespace: "test/webhook-project",
        git_http_url: "https://gitlab.com/test/webhook-project.git",
      },
      commits: [
        {
          id: "abc123def456",
          message: "Test commit",
          author: {
            name: "Test User",
            email: "test@example.com",
          },
        },
      ],
      user_name: "test-user",
    };

    // Send webhook
    const webhookCallResponse = await axios.post(
      `${API_URL}/api/webhooks/gitlab`,
      payload,
      {
        headers: {
          "X-Gitlab-Event": "Push Hook",
          "X-Gitlab-Token": gitlabSecret,
          "Content-Type": "application/json",
        },
      },
    );

    expect(webhookCallResponse.status).toBe(200);
    expect(webhookCallResponse.data).toHaveProperty("buildId");
  });

  it("should update webhook configuration", async function () {
    if (!isServicesRunning || !authToken || !webhookId) {
      this.skip();
    }

    const updateResponse = await axios.patch(
      `${API_URL}/api/webhooks/${webhookId}`,
      {
        events: ["push"], // Remove pull_request
        config: {
          branch: "develop",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data.events).toEqual(["push"]);
    expect(updateResponse.data.config.branch).toBe("develop");
  });

  it("should test webhook connectivity", async function () {
    if (!isServicesRunning || !authToken || !webhookId) {
      this.skip();
    }

    const testResponse = await axios.post(
      `${API_URL}/api/webhooks/${webhookId}/test`,
      {},
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(testResponse.status).toBe(200);
    expect(testResponse.data).toHaveProperty("success");
    expect(testResponse.data).toHaveProperty("message");
  });

  it("should delete webhook", async function () {
    if (!isServicesRunning || !authToken || !webhookId) {
      this.skip();
    }

    const deleteResponse = await axios.delete(
      `${API_URL}/api/webhooks/${webhookId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    // Verify deletion
    const listResponse = await axios.get(
      `${API_URL}/api/projects/${projectId}/webhooks`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const deletedWebhook = listResponse.data.find(
      (w: any) => w.id === webhookId,
    );
    expect(deletedWebhook).toBeUndefined();
  });

  it("should handle webhook for non-existent project", async function () {
    if (!isServicesRunning) {
      this.skip();
    }

    const payload = {
      ref: "refs/heads/main",
      repository: {
        full_name: "test/non-existent-project",
      },
    };

    try {
      await axios.post(`${API_URL}/api/webhooks/github`, payload, {
        headers: {
          "X-GitHub-Event": "push",
          "X-Hub-Signature-256": "sha256=doesntmatter",
          "Content-Type": "application/json",
        },
      });

      expect.fail("Expected webhook to fail for non-existent project");
    } catch (error: any) {
      expect(error.response?.status).toBe(404);
    }
  });
});
