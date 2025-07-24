"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
exports.default = (0, test_1.defineConfig)({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
        baseURL: "http://localhost:3002",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...test_1.devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npm run dev -- --port 3002",
        port: 3002,
        reuseExistingServer: !process.env.CI,
    },
});
//# sourceMappingURL=playwright.config.js.map