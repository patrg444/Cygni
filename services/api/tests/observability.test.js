"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fastify_1 = __importDefault(require("fastify"));
const health_1 = require("../src/routes/health");
const metrics_1 = require("../src/plugins/metrics");
// Mock dependencies
vitest_1.vi.mock("../src/utils/prisma", () => ({
    prisma: {
        $queryRaw: vitest_1.vi.fn().mockResolvedValue([{ 1: 1 }]),
    },
}));
vitest_1.vi.mock("ioredis", () => {
    return {
        default: vitest_1.vi.fn().mockImplementation(() => ({
            ping: vitest_1.vi.fn().mockResolvedValue("PONG"),
            quit: vitest_1.vi.fn().mockResolvedValue("OK"),
        })),
    };
});
(0, vitest_1.describe)("Observability - Metrics Endpoint", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = (0, fastify_1.default)({ logger: false });
        await app.register(metrics_1.metricsPlugin);
        await app.register(health_1.healthRoutes);
        await app.ready();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.it)("should return Prometheus metrics at /metrics", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/metrics",
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(response.headers["content-type"]).toContain("text/plain");
        const body = response.body;
        // Check for standard Prometheus format
        (0, vitest_1.expect)(body).toMatch(/^# HELP/m);
        (0, vitest_1.expect)(body).toMatch(/^# TYPE/m);
        // Check for specific metrics
        (0, vitest_1.expect)(body).toContain("cygni_api_http_requests_total");
        (0, vitest_1.expect)(body).toContain("cygni_api_http_request_duration_seconds");
        (0, vitest_1.expect)(body).toContain("nodejs_version_info");
    });
    (0, vitest_1.it)("should increment http_requests_total on each request", async () => {
        // Get initial metrics
        const initialResponse = await app.inject({
            method: "GET",
            url: "/metrics",
        });
        const initialCount = extractMetricValue(initialResponse.body, "cygni_api_http_requests_total");
        // Make a health check request
        await app.inject({
            method: "GET",
            url: "/health",
        });
        // Get updated metrics
        const updatedResponse = await app.inject({
            method: "GET",
            url: "/metrics",
        });
        const updatedCount = extractMetricValue(updatedResponse.body, "cygni_api_http_requests_total");
        // Should have incremented
        (0, vitest_1.expect)(updatedCount).toBeGreaterThan(initialCount);
    });
});
(0, vitest_1.describe)("Observability - Health Checks", () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        app = (0, fastify_1.default)({ logger: false });
        await app.register(health_1.healthRoutes);
        await app.ready();
    });
    (0, vitest_1.afterAll)(async () => {
        await app.close();
    });
    (0, vitest_1.it)("should return health status at /health", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/health",
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        (0, vitest_1.expect)(body).toHaveProperty("status", "ok");
        (0, vitest_1.expect)(body).toHaveProperty("timestamp");
        (0, vitest_1.expect)(body).toHaveProperty("uptime");
    });
    (0, vitest_1.it)("should return readiness status at /ready", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/ready",
        });
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        (0, vitest_1.expect)(body).toHaveProperty("status", "ready");
        (0, vitest_1.expect)(body).toHaveProperty("checks");
        (0, vitest_1.expect)(body.checks).toHaveProperty("database");
        (0, vitest_1.expect)(body.checks).toHaveProperty("redis");
    });
});
(0, vitest_1.describe)("Observability - Structured Logs", () => {
    (0, vitest_1.it)("should output structured JSON logs", async () => {
        const logs = [];
        // Create app with custom logger
        const app = (0, fastify_1.default)({
            logger: {
                level: "info",
                serializers: {
                    req: (req) => ({
                        method: req.method,
                        url: req.url,
                        id: req.id,
                    }),
                    res: (res) => ({
                        statusCode: res.statusCode,
                    }),
                },
                hooks: {
                    logMethod(inputArgs, method) {
                        // Capture the log object
                        if (inputArgs && inputArgs.length > 0) {
                            logs.push(inputArgs[0]);
                        }
                        return method.apply(this, inputArgs);
                    },
                },
            },
        });
        await app.register(health_1.healthRoutes);
        await app.ready();
        // Make a request
        await app.inject({
            method: "GET",
            url: "/health",
        });
        await app.close();
        // Check logs are structured
        (0, vitest_1.expect)(logs.length).toBeGreaterThan(0);
        // Find a log entry with level property
        const logWithLevel = logs.find((log) => log && typeof log === "object" && "level" in log);
        if (logWithLevel) {
            (0, vitest_1.expect)(logWithLevel).toHaveProperty("level");
        }
        else {
            // All logs should be structured objects
            (0, vitest_1.expect)(logs[0]).toBeDefined();
            (0, vitest_1.expect)(typeof logs[0]).toBe("object");
        }
    });
});
// Helper function to extract metric value
function extractMetricValue(metricsText, metricName) {
    // Try to match metric with labels first
    let regex = new RegExp(`${metricName}\\{[^}]*\\}\\s+(\\d+(?:\\.\\d+)?)`);
    let match = metricsText.match(regex);
    // If no match with labels, try without labels
    if (!match) {
        regex = new RegExp(`${metricName}\\s+(\\d+(?:\\.\\d+)?)`);
        match = metricsText.match(regex);
    }
    return match ? parseFloat(match[1]) : 0;
}
//# sourceMappingURL=observability.test.js.map