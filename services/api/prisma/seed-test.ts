import { PrismaClient } from "@prisma/client-api";
import { nanoid } from "nanoid";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

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
