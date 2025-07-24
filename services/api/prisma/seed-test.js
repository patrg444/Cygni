"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_api_1 = require("@prisma/client-api");
const argon2 = __importStar(require("argon2"));
const prisma = new client_api_1.PrismaClient();
async function seedTestData() {
    console.log("🌱 Seeding test database...");
    // Create test organization
    const testOrg = await prisma.organization.create({
        data: {
            id: "test-org-1",
            name: "Test Organization",
            slug: "test-org",
        },
    });
    // Create test user
    const testUser = await prisma.user.create({
        data: {
            id: "test-user-1",
            email: "test@example.com",
            name: "Test User",
            password: await argon2.hash("testpassword123"),
        },
    });
    // Add user to organization
    await prisma.organizationMember.create({
        data: {
            userId: testUser.id,
            organizationId: testOrg.id,
            role: "owner",
        },
    });
    // Create test API key
    const testApiKey = await prisma.apiKey.create({
        data: {
            id: "test-api-key-1",
            key: "test-api-key",
            name: "Test API Key",
            userId: testUser.id,
            organizationId: testOrg.id,
            scopes: ["read", "write"],
            active: true,
        },
    });
    // Create test project
    const testProject = await prisma.project.create({
        data: {
            id: "test-project-1",
            name: "Test Project",
            slug: "test-project",
            organizationId: testOrg.id,
            repository: "https://github.com/test/repo",
            framework: "node",
            settings: {
                buildCommand: "npm run build",
                outputDirectory: "dist",
                installCommand: "npm install",
            },
        },
    });
    // Create test environment
    await prisma.environment.create({
        data: {
            id: "test-env-1",
            name: "production",
            projectId: testProject.id,
            variables: {
                NODE_ENV: "production",
                API_URL: "https://api.example.com",
            },
        },
    });
    // Create test budget
    await prisma.budget.create({
        data: {
            id: "test-budget-1",
            organizationId: testOrg.id,
            monthlyLimit: 100.0,
            alertThreshold: 80.0,
            currency: "USD",
        },
    });
    console.log("✅ Test data seeded successfully!");
    console.log(`
  Test Credentials:
  - Email: test@example.com
  - Password: testpassword123
  - API Key: test-api-key
  - Organization ID: ${testOrg.id}
  - Project ID: ${testProject.id}
  `);
}
seedTestData()
    .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-test.js.map