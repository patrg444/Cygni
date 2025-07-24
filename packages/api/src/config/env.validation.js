"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.validateEnv = validateEnv;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Define environment schema
const envSchema = zod_1.z.object({
    // Server
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.string().default("3000"),
    // Database
    DATABASE_URL: zod_1.z.string().url().startsWith("postgresql://"),
    // Redis (optional in dev)
    REDIS_URL: zod_1.z.string().url().optional(),
    // JWT
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_EXPIRY: zod_1.z.string().default("24h"),
    // Stripe (required in production)
    STRIPE_SECRET_KEY: zod_1.z.string().startsWith("sk_").optional(),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().startsWith("whsec_").optional(),
    STRIPE_PRICE_COMPUTE: zod_1.z.string().startsWith("price_").optional(),
    STRIPE_PRICE_STORAGE: zod_1.z.string().startsWith("price_").optional(),
    STRIPE_PRICE_BANDWIDTH: zod_1.z.string().startsWith("price_").optional(),
    STRIPE_PRICE_REQUESTS: zod_1.z.string().startsWith("price_").optional(),
    // Email (required in production)
    EMAIL_API_KEY: zod_1.z.string().optional(),
    FROM_EMAIL: zod_1.z.string().email().optional(),
    // Admin
    ADMIN_API_KEY: zod_1.z.string().min(32).optional(),
    // Feature flags
    ENABLE_MULTI_REGION: zod_1.z
        .string()
        .transform((val) => val === "true")
        .default("false"),
    ENABLE_CANARY_DEPLOYMENTS: zod_1.z
        .string()
        .transform((val) => val === "true")
        .default("true"),
    FREE_TIER_LIMIT: zod_1.z
        .string()
        .transform((val) => parseFloat(val))
        .default("10.00"),
});
// Production-specific requirements
const productionSchema = envSchema.extend({
    STRIPE_SECRET_KEY: zod_1.z.string().startsWith("sk_live_"),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().startsWith("whsec_"),
    EMAIL_API_KEY: zod_1.z.string().min(1),
    FROM_EMAIL: zod_1.z.string().email(),
    ADMIN_API_KEY: zod_1.z.string().min(32),
});
// Validate environment
function validateEnv() {
    try {
        const schema = process.env.NODE_ENV === "production" ? productionSchema : envSchema;
        const env = schema.parse(process.env);
        console.log(" Environment variables validated");
        return env;
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            console.error(" Invalid environment variables:");
            error.errors.forEach((err) => {
                console.error(`  ${err.path.join(".")}: ${err.message}`);
            });
            process.exit(1);
        }
        throw error;
    }
}
// Export validated env
exports.env = validateEnv();
//# sourceMappingURL=env.validation.js.map