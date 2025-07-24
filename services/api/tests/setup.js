"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock Role enum
vitest_1.vi.mock("../src/types/auth", () => ({
    Role: {
        owner: "owner",
        admin: "admin",
        developer: "developer",
        viewer: "viewer",
    },
}));
// Mock environment variables
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret";
process.env.PORT = "3000";
// Mock the auth middleware for tests
vitest_1.vi.mock("../src/middleware/auth", () => ({
    authenticate: vitest_1.vi.fn(async (request, _reply) => {
        // Simple mock auth for tests
        if (request.headers["x-api-key"] === "test-api-key") {
            request.user = { id: "test-user-id", organizationId: "test-org-id" };
        }
        else if (!request.headers.authorization &&
            !request.headers["x-api-key"]) {
            throw new Error("Unauthorized");
        }
    }),
    requireRole: vitest_1.vi.fn(() => {
        return async (request, _reply) => {
            // Pass through - roles are handled by authenticate mock
            return;
        };
    }),
}));
// Mock logger to reduce noise in tests
vitest_1.vi.mock("../src/lib/logger", () => ({
    logger: {
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
        child: vitest_1.vi.fn(() => ({
            info: vitest_1.vi.fn(),
            error: vitest_1.vi.fn(),
            warn: vitest_1.vi.fn(),
            debug: vitest_1.vi.fn(),
        })),
    },
}));
//# sourceMappingURL=setup.js.map