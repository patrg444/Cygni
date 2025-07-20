import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "info",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Log Prisma queries in development
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e) => {
    logger.debug({
      query: e.query,
      params: e.params,
      duration: e.duration,
    }, "Prisma query");
  });
}

prisma.$on("error", (e) => {
  logger.error({ error: e }, "Prisma error");
});

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});