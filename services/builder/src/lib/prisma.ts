import { PrismaClient } from "@prisma/client-api";
import { logger } from "./logger";

declare global {
  // eslint-disable-next-line no-var
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
  (prisma as any).$on("query", (e: any) => {
    logger.debug({
      query: e.query,
      params: e.params,
      duration: e.duration,
    }, "Prisma query");
  });
}

(prisma as any).$on("error", (e: any) => {
  logger.error({ error: e }, "Prisma error");
});

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});