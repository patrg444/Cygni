import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  // Add tracing context if available
  mixin() {
    const context: any = {};
    if (process.env.OTEL_TRACE_ID) {
      context.traceId = process.env.OTEL_TRACE_ID;
    }
    if (process.env.OTEL_SPAN_ID) {
      context.spanId = process.env.OTEL_SPAN_ID;
    }
    return context;
  },
});