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
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log(" Starting database seed...");
    // Clean existing data
    await prisma.usageEvent.deleteMany();
    await prisma.deployment.deleteMany();
    await prisma.environment.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.team.deleteMany();
    // Create test team
    const team = await prisma.team.create({
        data: {
            name: "Demo Team",
            billingEmail: "billing@demo.com",
        },
    });
    console.log(" Created team:", team.name);
    // Create test users
    const hashedPassword = await bcrypt.hash("demo1234", 10);
    const adminUser = await prisma.user.create({
        data: {
            email: "admin@cygni.dev",
            password: hashedPassword,
            name: "Admin User",
            role: "admin",
            teamId: team.id,
        },
    });
    const devUser = await prisma.user.create({
        data: {
            email: "dev@cygni.dev",
            password: hashedPassword,
            name: "Developer User",
            role: "member",
            teamId: team.id,
        },
    });
    console.log(" Created users:", adminUser.email, devUser.email);
    // Create test project
    const project = await prisma.project.create({
        data: {
            name: "Demo App",
            slug: "demo-app",
            teamId: team.id,
            status: "active",
        },
    });
    console.log(" Created project:", project.name);
    // Create environments
    const prodEnv = await prisma.environment.create({
        data: {
            name: "Production",
            slug: "production",
            projectId: project.id,
        },
    });
    const stagingEnv = await prisma.environment.create({
        data: {
            name: "Staging",
            slug: "staging",
            projectId: project.id,
        },
    });
    console.log(" Created environments:", prodEnv.name, stagingEnv.name);
    // Create sample deployment
    const deployment = await prisma.deployment.create({
        data: {
            projectId: project.id,
            environmentId: prodEnv.id,
            status: "active",
            metadata: {
                version: "1.0.0",
                commit: "abc123",
                createdBy: adminUser.id,
            },
        },
    });
    console.log(" Created deployment:", deployment.id);
    // Add some waitlist entries
    const waitlistEntries = await Promise.all([
        prisma.waitlist.create({
            data: {
                email: "startup@example.com",
                metadata: { company: "Awesome Startup" },
                position: 1,
            },
        }),
        prisma.waitlist.create({
            data: {
                email: "developer@example.com",
                metadata: { company: "Solo Dev" },
                position: 2,
            },
        }),
    ]);
    console.log(" Created waitlist entries:", waitlistEntries.length);
    console.log("\n Seed completed successfully!");
    console.log("\n Test credentials:");
    console.log("   Email: admin@cygni.dev");
    console.log("   Password: demo1234");
}
main()
    .catch((e) => {
    console.error(" Seed failed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map