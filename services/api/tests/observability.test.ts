import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fastify, { FastifyInstance } from "fastify";
import { healthRoutes } from "../../src/routes/health";
import { metricsPlugin } from "../../src/plugins/metrics";

describe("Observability - Metrics Endpoint", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify({ logger: false });
    await app.register(metricsPlugin);
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return Prometheus metrics at /metrics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    
    const body = response.body;
    
    // Check for standard Prometheus format
    expect(body).toMatch(/^# HELP/m);
    expect(body).toMatch(/^# TYPE/m);
    
    // Check for specific metrics
    expect(body).toContain("http_requests_total");
    expect(body).toContain("http_request_duration_seconds");
    expect(body).toContain("nodejs_version_info");
  });

  it("should increment http_requests_total on each request", async () => {
    // Get initial metrics
    const initialResponse = await app.inject({
      method: "GET",
      url: "/metrics",
    });
    
    const initialCount = extractMetricValue(initialResponse.body, "http_requests_total");
    
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
    
    const updatedCount = extractMetricValue(updatedResponse.body, "http_requests_total");
    
    // Should have incremented
    expect(updatedCount).toBeGreaterThan(initialCount);
  });
});

describe("Observability - Health Checks", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify({ logger: false });
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return health status at /health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
  });

  it("should return readiness status at /ready", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("status", "ready");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("redis");
  });
});

describe("Observability - Structured Logs", () => {
  it("should output structured JSON logs", async () => {
    const logs: string[] = [];
    
    // Create app with custom logger
    const app = fastify({
      logger: {
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            destination: 1,
            colorize: false,
            translateTime: false,
          },
        },
        hooks: {
          logMethod(inputArgs, method) {
            logs.push(JSON.stringify(inputArgs[0]));
            return method.apply(this, inputArgs);
          },
        },
      },
    });

    await app.register(healthRoutes);
    await app.ready();

    // Make a request
    await app.inject({
      method: "GET",
      url: "/health",
    });

    await app.close();

    // Check logs are structured
    expect(logs.length).toBeGreaterThan(0);
    
    // Parse one log entry
    const logEntry = JSON.parse(logs[0]);
    expect(logEntry).toHaveProperty("level");
    expect(logEntry).toHaveProperty("time");
  });
});

// Helper function to extract metric value
function extractMetricValue(metricsText: string, metricName: string): number {
  const regex = new RegExp(`${metricName}\\{[^}]*\\}\\s+(\\d+(?:\\.\\d+)?)`);
  const match = metricsText.match(regex);
  return match ? parseFloat(match[1]) : 0;
}