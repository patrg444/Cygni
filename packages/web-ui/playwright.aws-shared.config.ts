import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/aws",
  testMatch: "**/shared-deployment.spec.ts",
  timeout: 30 * 60 * 1000, // 30 minutes per test
  fullyParallel: false, // Run tests sequentially
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for infrastructure tests
  workers: 1, // Single worker for sequential execution
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-aws-shared", open: "never" }],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});