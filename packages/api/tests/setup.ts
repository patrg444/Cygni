// import { PrismaClient } from '@prisma/client';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5433/cygni_test';

// Mock Prisma for unit tests
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    team: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    waitlist: {
      create: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    usageEvent: {
      groupBy: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    deployment: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    // Add more models as needed
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Global test utilities
(global as any).testHelpers = {
  generateTestEmail: () => `test-${Date.now()}@example.com`,
  generateTestToken: () => 'test-jwt-token',
};