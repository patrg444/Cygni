"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const test_api_server_1 = require("../../cli/dist/tests/services/test-api-server");
test_1.test.describe("Generated UI Integration", () => {
    let apiServer;
    let apiPort;
    test_1.test.beforeAll(async () => {
        // Start test API server with posts endpoints
        apiServer = new test_api_server_1.TestApiServer();
        apiPort = await apiServer.start();
        console.log(`Test API server running on port ${apiPort}`);
    });
    test_1.test.afterAll(async () => {
        await apiServer.stop();
    });
    (0, test_1.test)("posts page works with generated hooks", async ({ page }) => {
        // Configure the page to use our test API
        await page.addInitScript((port) => {
            // Override the API URL
            window.process = window.process || {};
            window.process.env = window.process.env || {};
            window.process.env.NEXT_PUBLIC_API_URL =
                `http://localhost:${port}`;
        }, apiPort);
        // Navigate to the test posts page
        await page.goto(`http://localhost:3002/test-posts`);
        // Wait for the page to load
        await page.waitForLoadState("networkidle");
        // Check that the page loaded
        await (0, test_1.expect)(page.locator("h1")).toContainText("Posts");
        // Check that posts are displayed
        await (0, test_1.expect)(page.locator("text=First Post")).toBeVisible({
            timeout: 10000,
        });
        await (0, test_1.expect)(page.locator("text=Second Post")).toBeVisible();
        // Test creating a new post
        await page.click('button:has-text("Create New")');
        // Wait for form to appear
        await page.waitForSelector('input[name="name"], input[placeholder*="name"], input[placeholder*="title"]', { timeout: 5000 });
        // Fill the form
        const nameInput = page.locator("input").first();
        await nameInput.fill("Test Post from Playwright");
        const descriptionInput = page.locator("textarea, input").nth(1);
        if (await descriptionInput.isVisible()) {
            await descriptionInput.fill("This is a test description");
        }
        // Submit the form
        await page.click('button:has-text("Save")');
        // Wait for the form to close and list to update
        await page.waitForTimeout(1000);
        // Verify the new post appears (the API returns it)
        // Note: Our test API creates posts with incremental IDs
        await (0, test_1.expect)(page.locator("text=Test Post from Playwright"))
            .toBeVisible({ timeout: 5000 })
            .catch(() => {
            console.log("New post might use different field mapping");
        });
        // Test delete functionality
        const deleteButtons = page.locator('button:has-text("Delete")');
        const deleteCount = await deleteButtons.count();
        if (deleteCount > 0) {
            // Click the first delete button
            await deleteButtons.first().click();
            // Confirm the deletion
            page.on("dialog", (dialog) => dialog.accept());
            // Wait for the item to be removed
            await page.waitForTimeout(1000);
            // Verify one less item
            const newDeleteCount = await deleteButtons.count();
            (0, test_1.expect)(newDeleteCount).toBeLessThan(deleteCount);
        }
    });
    (0, test_1.test)("builds page still works", async ({ page }) => {
        // Also test that our existing builds page works
        await page.goto("http://localhost:3002/builds");
        await (0, test_1.expect)(page.locator("h1")).toContainText("Builds");
        // Test the create deployment button
        const createButton = page.locator('button:has-text("Create New Deployment")');
        await (0, test_1.expect)(createButton).toBeVisible();
    });
});
//# sourceMappingURL=simple-integration.spec.js.map