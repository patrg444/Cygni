import { Page } from "@playwright/test";

export async function setupTestEnvironment(page: Page, apiPort: number) {
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
    (window as any).process = (window as any).process || {};
    (window as any).process.env = (window as any).process.env || {};
    (window as any).process.env.NEXT_PUBLIC_API_URL =
      `http://localhost:${port}`;
  }, apiPort);
}
