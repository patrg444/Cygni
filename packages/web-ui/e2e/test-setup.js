"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTestEnvironment = setupTestEnvironment;
async function setupTestEnvironment(page, apiPort) {
    // Inject API configuration into the page
    await page.addInitScript((port) => {
        // Override fetch to use our test API server
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
            let url = input.toString();
            // Redirect API calls to our test server
            if (url.startsWith("/api") || url.includes("localhost:3000")) {
                url = url.replace("http://localhost:3000", `http://localhost:${port}`);
                url = url.replace("/api", "");
            }
            return originalFetch(url, init);
        };
        // Set environment variable
        window.process = window.process || {};
        window.process.env = window.process.env || {};
        window.process.env.NEXT_PUBLIC_API_URL =
            `http://localhost:${port}`;
    }, apiPort);
}
//# sourceMappingURL=test-setup.js.map