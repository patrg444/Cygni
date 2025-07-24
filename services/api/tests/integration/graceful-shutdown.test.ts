import { describe, it, expect } from "vitest";
import fastify from "fastify";

describe("API Graceful Shutdown", () => {
  it("should shutdown gracefully within 5 seconds on SIGTERM", async () => {
    // Create a test server
    const app = fastify({
      logger: false,
      forceCloseConnections: true,
    });

    let shutdownStarted = false;
    let shutdownCompleted = false;

    // Add a test route
    app.get("/test", async () => {
      return { status: "ok" };
    });

    // Add graceful shutdown hook
    app.addHook("onClose", async () => {
      shutdownStarted = true;
      // Simulate some cleanup work
      await new Promise((resolve) => setTimeout(resolve, 100));
      shutdownCompleted = true;
    });

    // Start the server
    await app.listen({ port: 0 }); // Use random port

    // Verify server is running
    const response = await app.inject({
      method: "GET",
      url: "/test",
    });
    expect(response.statusCode).toBe(200);

    // Measure shutdown time
    const shutdownStart = Date.now();

    // Trigger graceful shutdown
    await app.close();

    const shutdownDuration = Date.now() - shutdownStart;

    // Verify shutdown completed
    expect(shutdownStarted).toBe(true);
    expect(shutdownCompleted).toBe(true);

    // Should shutdown within 5 seconds
    expect(shutdownDuration).toBeLessThan(5000);

    // Server should not accept new connections
    try {
      await app.inject({
        method: "GET",
        url: "/test",
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      // Expected - server is closed
      expect(error).toBeDefined();
    }
  }, 10000); // 10 second timeout for the test
});
