"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const server_1 = require("./server");
const auth_1 = require("./routes/auth");
const budget_check_job_1 = require("./jobs/budget-check.job");
// Load environment variables
dotenv_1.default.config();
const PORT = process.env.PORT || 3000;
const prisma = new client_1.PrismaClient();
// Start server
async function startServer() {
    try {
        // Initialize database connection
        await prisma.$connect();
        console.log(" Database connected");
        // Create Express app
        const app = (0, server_1.createServer)();
        // Initialize background jobs
        (0, budget_check_job_1.initializeBudgetCheckJob)();
        console.log(" Background jobs initialized");
        // Start JWT rotation
        auth_1.jwtService.startRotationJob();
        console.log(" JWT rotation job started");
        // Start Express server
        app.listen(PORT, () => {
            console.log(` CloudExpress API running on http://localhost:${PORT}`);
            console.log(` Health check: http://localhost:${PORT}/api/health`);
            console.log(` Waitlist signup: POST http://localhost:${PORT}/api/waitlist`);
            console.log(` JWKS: http://localhost:${PORT}/api/auth/.well-known/jwks.json`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on("SIGINT", async () => {
    console.log("\nShutting down gracefully...");
    await prisma.$disconnect();
    process.exit(0);
});
// Start the server
startServer();
//# sourceMappingURL=index.js.map