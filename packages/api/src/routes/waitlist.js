"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const email_service_1 = require("../services/email/email.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const waitlistSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    source: zod_1.z.string().optional(),
    referrer: zod_1.z.string().optional(),
});
// POST /api/waitlist - Add email to waitlist
router.post("/waitlist", async (req, res) => {
    try {
        const { email, source = "landing", referrer, } = waitlistSchema.parse(req.body);
        // Check if already on waitlist
        const existing = await prisma.waitlist.findUnique({
            where: { email },
        });
        if (existing) {
            return res.json({
                success: true,
                message: "Already on waitlist",
                position: existing.position,
            });
        }
        // Get current position
        const count = await prisma.waitlist.count();
        const position = count + 1;
        // Add to waitlist
        await prisma.waitlist.create({
            data: {
                email,
                source,
                referrer,
                position,
                metadata: {
                    ip: req.ip,
                    userAgent: req.headers["user-agent"],
                    timestamp: new Date().toISOString(),
                },
            },
        });
        // Send welcome email
        await (0, email_service_1.sendEmail)({
            to: email,
            subject: "Welcome to CloudExpress Early Access!",
            html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0070f3;">Welcome to CloudExpress! </h1>
          
          <p>Thanks for joining our early access list! You're #${position} in line.</p>
          
          <p>We're building the developer cloud that bridges the gap between Vercel's simplicity and AWS's power. Here's what you can expect:</p>
          
          <ul>
            <li>5-second deploys with zero-downtime rollouts</li>
            <li>Preview environments for every PR</li>
            <li>Integrated Postgres, Redis, and S3-compatible storage</li>
            <li>Bring Your Own Cloud (BYOC) support</li>
            <li>Transparent, usage-based pricing</li>
          </ul>
          
          <p>We'll reach out soon with your early access invite. In the meantime:</p>
          
          <p>
            <a href="https://github.com/cygni" style="color: #0070f3;"> Star us on GitHub</a><br>
            <a href="https://twitter.com/cygni" style="color: #0070f3;"> Follow us on Twitter</a>
          </p>
          
          <p>Have questions? Just reply to this email!</p>
          
          <p>Best,<br>The CloudExpress Team</p>
        </div>
      `,
        });
        // Log for analytics
        console.log(`New waitlist signup: ${email} (position: ${position}, source: ${source})`);
        res.json({
            success: true,
            position,
            message: `You're #${position} on the waitlist!`,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                error: "Invalid email address",
            });
        }
        console.error("Waitlist error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to join waitlist",
        });
    }
});
// GET /api/waitlist/stats - Get waitlist statistics (internal)
router.get("/waitlist/stats", async (req, res) => {
    // Simple auth check (replace with proper auth)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const total = await prisma.waitlist.count();
    const today = await prisma.waitlist.count({
        where: {
            createdAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
        },
    });
    const bySources = await prisma.waitlist.groupBy({
        by: ["source"],
        _count: true,
    });
    const recentSignups = await prisma.waitlist.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            email: true,
            position: true,
            source: true,
            createdAt: true,
        },
    });
    res.json({
        total,
        today,
        bySources,
        recentSignups,
        averagePerDay: total / 7, // Assuming 7 days since launch
    });
});
exports.default = router;
//# sourceMappingURL=waitlist.js.map