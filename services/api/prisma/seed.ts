import { PrismaClient } from "@prisma/client-api";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo-org",
    },
  });

  console.log(`✅ Created organization: ${demoOrg.name}`);

  // Create demo user
  const hashedPassword = await hash("demo123!", 10);
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@cygni.io" },
    update: {},
    create: {
      email: "demo@cygni.io",
      name: "Demo User",
      password: hashedPassword,
    },
  });

  console.log(`✅ Created user: ${demoUser.email}`);

  // Add user to organization
  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: demoUser.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      organizationId: demoOrg.id,
      role: "owner",
    },
  });

  console.log(`✅ Added ${demoUser.email} as owner of ${demoOrg.name}`);

  // Create demo projects
  const projects = [
    {
      name: "Next.js App",
      slug: "nextjs-app",
      framework: "nextjs",
      repository: "https://github.com/demo/nextjs-app",
    },
    {
      name: "Express API",
      slug: "express-api",
      framework: "express",
      repository: "https://github.com/demo/express-api",
    },
    {
      name: "Python Service",
      slug: "python-service",
      framework: "fastapi",
      repository: "https://github.com/demo/python-service",
    },
  ];

  for (const projectData of projects) {
    const project = await prisma.project.upsert({
      where: {
        organizationId_slug: {
          organizationId: demoOrg.id,
          slug: projectData.slug,
        },
      },
      update: {},
      create: {
        ...projectData,
        organizationId: demoOrg.id,
      },
    });

    // Add user as project member
    await prisma.projectMember.upsert({
      where: {
        userId_projectId: {
          userId: demoUser.id,
          projectId: project.id,
        },
      },
      update: {},
      create: {
        userId: demoUser.id,
        projectId: project.id,
        role: "owner",
      },
    });

    // Create environments
    const environments = ["production", "staging", "development"];
    for (const envName of environments) {
      await prisma.environment.upsert({
        where: {
          projectId_slug: {
            projectId: project.id,
            slug: envName,
          },
        },
        update: {},
        create: {
          projectId: project.id,
          name: envName.charAt(0).toUpperCase() + envName.slice(1),
          slug: envName,
          domain:
            envName === "production"
              ? `${project.slug}.cygni.app`
              : `${project.slug}-${envName}.cygni.app`,
        },
      });
    }

    console.log(`✅ Created project: ${project.name} with environments`);
  }

  // Create sample API key
  await prisma.apiKey.create({
    data: {
      userId: demoUser.id,
      name: "Demo API Key",
      key: "cx_demo_" + Buffer.from(Date.now().toString()).toString("base64"),
    },
  });

  console.log("✅ Created demo API key");

  console.log("\n🎉 Database seeding completed!");
  console.log("\n📧 Demo credentials:");
  console.log(`   Email: demo@cygni.io`);
  console.log(`   Password: demo123!`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
