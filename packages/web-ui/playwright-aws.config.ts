import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/aws",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30 * 60 * 1000, // 30 minutes per test
  
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "aws-deployment",
      use: { 
        ...devices["Desktop Chrome"],
        // No baseURL - will be determined dynamically from CDK outputs
      },
    },
  ],

  // No webServer - we're testing against real AWS deployment
});