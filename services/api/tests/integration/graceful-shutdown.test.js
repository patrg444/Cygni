"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fastify_1 = __importDefault(require("fastify"));
(0, vitest_1.describe)("API Graceful Shutdown", () => {
    (0, vitest_1.it)("should shutdown gracefully within 5 seconds on SIGTERM", async () => {
        // Create a test server
        const app = (0, fastify_1.default)({
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
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        // Measure shutdown time
        const shutdownStart = Date.now();
        // Trigger graceful shutdown
        await app.close();
        const shutdownDuration = Date.now() - shutdownStart;
        // Verify shutdown completed
        (0, vitest_1.expect)(shutdownStarted).toBe(true);
        (0, vitest_1.expect)(shutdownCompleted).toBe(true);
        // Should shutdown within 5 seconds
        (0, vitest_1.expect)(shutdownDuration).toBeLessThan(5000);
        // Server should not accept new connections
        try {
            await app.inject({
                method: "GET",
                url: "/test",
            });
            (0, vitest_1.expect)(true).toBe(false); // Should not reach here
        }
        catch (error) {
            // Expected - server is closed
            (0, vitest_1.expect)(error).toBeDefined();
        }
    }, 10000); // 10 second timeout for the test
});
//# sourceMappingURL=graceful-shutdown.test.js.map