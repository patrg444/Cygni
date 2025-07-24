import { vi } from "vitest";

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.ECR_REPOSITORY_URI = "test.dkr.ecr.us-east-1.amazonaws.com/test";
process.env.K8S_NAMESPACE = "test-builds";
process.env.API_SERVICE_URL = "http://api:3000";
process.env.INTERNAL_SECRET = "test-secret";
process.env.BUILD_CONCURRENCY = "5";
