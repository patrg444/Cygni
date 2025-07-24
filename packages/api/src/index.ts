import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createServer } from "./server";
import { jwtService } from "./routes/auth";
import { initializeBudgetCheckJob } from "./jobs/budget-check.job";
import logger from "./lib/logger";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await prisma.$connect();
    logger.info("Database connected", { 
      database: process.env.DATABASE_URL?.split("@")[1]?.split("/")[1] 
    });

    // Create Express app
    const app = createServer();

    // Initialize background jobs
    initializeBudgetCheckJob();
    logger.info("Background jobs initialized", { 
      jobs: ["budget-check"] 
    });

    // Start JWT rotation
    jwtService.startRotationJob();
    logger.info("JWT rotation job started", { 
      rotationInterval: "24h" 
    });

    // Start Express server
    app.listen(PORT, () => {
      logger.info("CloudExpress API started", {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        endpoints: {
          health: `http://localhost:${PORT}/api/health`,
          waitlist: `http://localhost:${PORT}/api/waitlist`,
          jwks: `http://localhost:${PORT}/api/auth/.well-known/jwks.json`,
        },
        features: {
          cors: process.env.CORS_ORIGIN || "*",
          stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
          emailEnabled: !!process.env.SENDGRID_API_KEY,
        },
      });
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutdown signal received, closing connections...");
  
  try {
    await prisma.$disconnect();
    logger.info("Database connection closed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the server
startServer();
