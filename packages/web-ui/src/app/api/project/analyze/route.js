"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
// Mock data for development
// In production, this would call the CLI analyze command or backend service
async function GET() {
    const mockData = {
        framework: "express",
        endpoints: [
            {
                method: "GET",
                path: "/api/users",
                file: "src/routes/users.js",
                line: 15,
                middleware: ["authenticate", "authorize"],
                authentication: true,
                description: "Get all users",
            },
            {
                method: "GET",
                path: "/api/users/:id",
                file: "src/routes/users.js",
                line: 25,
                middleware: ["authenticate"],
                authentication: true,
                description: "Get user by ID",
            },
            {
                method: "POST",
                path: "/api/users",
                file: "src/routes/users.js",
                line: 35,
                middleware: ["authenticate", "authorize", "validate"],
                authentication: true,
                description: "Create new user",
            },
            {
                method: "PUT",
                path: "/api/users/:id",
                file: "src/routes/users.js",
                line: 45,
                middleware: ["authenticate", "authorize"],
                authentication: true,
                description: "Update user",
            },
            {
                method: "DELETE",
                path: "/api/users/:id",
                file: "src/routes/users.js",
                line: 55,
                middleware: ["authenticate", "authorize"],
                authentication: true,
                description: "Delete user",
            },
            {
                method: "POST",
                path: "/api/auth/login",
                file: "src/routes/auth.js",
                line: 10,
                middleware: ["validate"],
                authentication: false,
                description: "User login",
            },
            {
                method: "POST",
                path: "/api/auth/logout",
                file: "src/routes/auth.js",
                line: 30,
                middleware: ["authenticate"],
                authentication: true,
                description: "User logout",
            },
            {
                method: "GET",
                path: "/api/products",
                file: "src/routes/products.js",
                line: 12,
                middleware: [],
                authentication: false,
                description: "Get all products",
            },
            {
                method: "GET",
                path: "/api/products/:id",
                file: "src/routes/products.js",
                line: 22,
                middleware: [],
                authentication: false,
                description: "Get product by ID",
            },
            {
                method: "GET",
                path: "/health",
                file: "src/index.js",
                line: 45,
                middleware: [],
                authentication: false,
                description: "Health check endpoint",
            },
        ],
        authentication: {
            type: "jwt",
            strategy: "bearer",
        },
        middleware: ["cors", "helmet", "morgan", "express-json"],
        websockets: {
            enabled: true,
            path: "/ws",
        },
        graphql: {
            enabled: false,
        },
        runtimeConfig: {
            runtime: "node",
            framework: "express",
            endpoints: 10,
            port: 3000,
            build: "npm run build",
            start: "node index.js",
            deploy: {
                strategy: "rolling",
                healthCheck: {
                    path: "/health",
                    interval: 30,
                    timeout: 5,
                    retries: 3,
                },
            },
        },
        detectedFiles: {
            config: ["package.json", ".env.example", "tsconfig.json"],
            source: [
                "src/index.js",
                "src/routes/users.js",
                "src/routes/auth.js",
                "src/routes/products.js",
            ],
        },
    };
    return server_1.NextResponse.json(mockData);
}
//# sourceMappingURL=route.js.map