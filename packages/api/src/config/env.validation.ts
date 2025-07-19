import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define environment schema
const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.string().default("3000"),

  // Database
  DATABASE_URL: z.string().url().startsWith("postgresql://"),

  // Redis (optional in dev)
  REDIS_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("24h"),

  // Stripe (required in production)
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_COMPUTE: z.string().startsWith("price_").optional(),
  STRIPE_PRICE_STORAGE: z.string().startsWith("price_").optional(),
  STRIPE_PRICE_BANDWIDTH: z.string().startsWith("price_").optional(),
  STRIPE_PRICE_REQUESTS: z.string().startsWith("price_").optional(),

  // Email (required in production)
  EMAIL_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // Admin
  ADMIN_API_KEY: z.string().min(32).optional(),

  // Feature flags
  ENABLE_MULTI_REGION: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  ENABLE_CANARY_DEPLOYMENTS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  FREE_TIER_LIMIT: z
    .string()
    .transform((val) => parseFloat(val))
    .default("10.00"),
});

// Production-specific requirements
const productionSchema = envSchema.extend({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_live_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  EMAIL_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().email(),
  ADMIN_API_KEY: z.string().min(32),
});

// Validate environment
export function validateEnv() {
  try {
    const schema =
      process.env.NODE_ENV === "production" ? productionSchema : envSchema;
    const env = schema.parse(process.env);

    console.log("✅ Environment variables validated");
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Invalid environment variables:");
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

// Export validated env
export const env = validateEnv();
