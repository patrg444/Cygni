"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const env_validation_1 = require("./config/env.validation");
// Import routes
const auth_1 = require("./routes/auth");
const waitlist_1 = __importDefault(require("./routes/waitlist"));
// Import middleware
const jwt_rotation_service_1 = require("./services/auth/jwt-rotation.service");
function createServer() {
    // Validate environment first
    (0, env_validation_1.validateEnv)();
    const app = (0, express_1.default)();
    const prisma = new client_1.PrismaClient();
    // Middleware
    app.use((0, cors_1.default)({
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
    }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Health check endpoints
    app.get("/api/health", async (req, res) => {
        const deep = req.query.deep === "true";
        const health = {
            status: "healthy",
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || "1.0.0",
        };
        if (deep) {
            // Check database
            try {
                await prisma.$queryRaw `SELECT 1`;
                health.database = "connected";
            }
            catch (error) {
                health.database = "error";
                health.status = "degraded";
            }
            // Check Redis (if configured)
            health.redis = process.env.REDIS_URL ? "configured" : "not configured";
            // Check Stripe
            health.stripe = process.env.STRIPE_SECRET_KEY
                ? "configured"
                : "not configured";
        }
        res.status(health.status === "healthy" ? 200 : 503).json(health);
    });
    // Public routes
    app.use("/api", waitlist_1.default);
    app.use("/api", auth_1.authRouter);
    // Protected routes
    app.get("/api/protected", (0, jwt_rotation_service_1.jwtMiddleware)(auth_1.jwtService), (req, res) => {
        res.json({
            message: "This is a protected endpoint",
            user: req.user,
        });
    });
    // Budget endpoint
    app.get("/api/projects/:projectId/budget", (0, jwt_rotation_service_1.jwtMiddleware)(auth_1.jwtService), async (req, res) => {
        try {
            const { projectId } = req.params;
            // Mock response for now
            res.json({
                projectId,
                used: 8.5,
                limit: 10.0,
                remaining: 1.5,
                percentUsed: 85,
                status: "warning",
                breakdown: {
                    compute: { cost: "6.00", cpuHours: "166.67" },
                    storage: { cost: "1.00", gbHours: "10000" },
                    bandwidth: { cost: "1.50", egressGB: "16.67" },
                },
            });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to get budget status" });
        }
    });
    // Stripe webhook
    app.post("/api/webhooks/stripe", express_1.default.raw({ type: "application/json" }), async (_req, res) => {
        // const signature = req.headers['stripe-signature'] as string;
        try {
            console.log("Stripe webhook received");
            // In production, verify signature and process event
            // const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
            res.json({ received: true });
        }
        catch (error) {
            console.error("Stripe webhook error:", error);
            res.status(400).json({ error: "Webhook processing failed" });
        }
    });
    // Error handling
    app.use((err, _req, res, _next) => {
        console.error("Error:", err);
        res.status(err.status || 500).json({
            error: err.message || "Internal server error",
        });
    });
    // 404 handler
    app.use((_req, res) => {
        res.status(404).json({ error: "Endpoint not found" });
    });
    return app;
}
//# sourceMappingURL=server.js.map