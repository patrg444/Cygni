import { vi } from "vitest";

// Mock Role enum
vi.mock("../src/types/auth", () => ({
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
vi.mock("../src/middleware/auth", () => ({
  authenticate: vi.fn(async (request: any, _reply: any) => {
    // Simple mock auth for tests
    if (request.headers["x-api-key"] === "test-api-key") {
      request.user = { id: "test-user-id", organizationId: "test-org-id" };
    } else if (
      !request.headers.authorization &&
      !request.headers["x-api-key"]
    ) {
      throw new Error("Unauthorized");
    }
  }),
  requireRole: vi.fn(() => {
    return async (request: any, _reply: any) => {
      // Pass through - roles are handled by authenticate mock
      return;
    };
  }),
}));

// Mock logger to reduce noise in tests
vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));
