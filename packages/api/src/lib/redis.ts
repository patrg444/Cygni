import Redis from "ioredis";
import logger from "./logger";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      reconnectOnError: (err) => {
        logger.error("Redis connection error", { error: err.message });
        return true;
      },
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Retrying Redis connection in ${delay}ms`);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      logger.info("Redis client connected");
    });

    redisClient.on("error", (error) => {
      logger.error("Redis client error", { error: error.message });
    });

    redisClient.on("ready", () => {
      logger.info("Redis client ready");
    });

    redisClient.on("close", () => {
      logger.warn("Redis connection closed");
    });

    redisClient.on("reconnecting", () => {
      logger.info("Redis client reconnecting");
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}