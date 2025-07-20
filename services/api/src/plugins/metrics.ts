import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { register, collectDefaultMetrics, Counter, Histogram } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    metrics: {
      httpRequestsTotal: Counter;
      httpRequestDuration: Histogram;
    };
  }
}

const metricsPlugin: FastifyPluginAsync = async (fastify) => {
  // Collect default Node.js metrics
  collectDefaultMetrics({ prefix: "cygni_api_" });

  // Custom metrics
  const httpRequestsTotal = new Counter({
    name: "cygni_api_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
  });

  const httpRequestDuration = new Histogram({
    name: "cygni_api_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  });

  // Build jobs metrics
  const buildJobsTotal = new Counter({
    name: "cygni_api_build_jobs_total",
    help: "Total number of build jobs created",
    labelNames: ["status"],
  });

  // Decorate fastify with metrics
  fastify.decorate("metrics", {
    httpRequestsTotal,
    httpRequestDuration,
    buildJobsTotal,
  });

  // Add metrics collection hook
  fastify.addHook("onRequest", async (request, reply) => {
    request.startTime = Date.now();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const responseTime = Date.now() - (request.startTime || Date.now());
    const route = request.routerPath || request.url;
    
    httpRequestsTotal.labels(request.method, route, reply.statusCode.toString()).inc();
    httpRequestDuration.labels(request.method, route, reply.statusCode.toString()).observe(responseTime / 1000);
  });

  // Metrics endpoint
  fastify.get("/metrics", async (request, reply) => {
    reply.type("text/plain; version=0.0.4");
    return register.metrics();
  });
};

export const metrics = fp(metricsPlugin, {
  name: "metrics",
});

// Export for tests
export { metricsPlugin };