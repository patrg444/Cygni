"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
class StripeService {
    constructor(prisma) {
        // Product and Price IDs (created in Stripe Dashboard)
        this.PRICE_IDS = {
            compute: process.env.STRIPE_PRICE_COMPUTE || "price_compute", // $0.05/vCPU-hour
            storage: process.env.STRIPE_PRICE_STORAGE || "price_storage", // $0.10/GB-month
            bandwidth: process.env.STRIPE_PRICE_BANDWIDTH || "price_bandwidth", // $0.09/GB
            requests: process.env.STRIPE_PRICE_REQUESTS || "price_requests", // $0.20/million
        };
        this.stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
            apiVersion: "2023-08-16",
        });
        this.prisma = prisma;
    }
    // Create a Stripe customer for a team
    async createCustomer(teamId, email, name) {
        const customer = await this.stripe.customers.create({
            email,
            name,
            metadata: {
                teamId,
            },
        });
        // Save Stripe customer ID
        await this.prisma.team.update({
            where: { id: teamId },
            data: {
                stripeCustomerId: customer.id,
                billingEmail: email,
            },
        });
        return customer;
    }
    // Create a subscription with usage-based pricing
    async createSubscription(teamId) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
        });
        if (!team?.stripeCustomerId) {
            throw new Error("Team must have a Stripe customer");
        }
        // Create subscription with usage-based items
        const subscription = await this.stripe.subscriptions.create({
            customer: team.stripeCustomerId,
            items: [
                { price: this.PRICE_IDS.compute },
                { price: this.PRICE_IDS.storage },
                { price: this.PRICE_IDS.bandwidth },
                { price: this.PRICE_IDS.requests },
            ],
            payment_behavior: "default_incomplete",
            payment_settings: {
                save_default_payment_method: "on_subscription",
            },
            trial_period_days: 14, // 14-day free trial
            metadata: {
                teamId,
            },
        });
        // Save subscription ID
        await this.prisma.team.update({
            where: { id: teamId },
            data: {
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
            },
        });
        return subscription;
    }
    // Report usage to Stripe
    async reportUsage(records) {
        const recordsByTeam = this.groupByTeam(records);
        for (const [teamId, teamRecords] of Object.entries(recordsByTeam)) {
            const team = await this.prisma.team.findUnique({
                where: { id: teamId },
                include: { projects: true },
            });
            if (!team?.stripeSubscriptionId)
                continue;
            // Get subscription items
            const subscription = await this.stripe.subscriptions.retrieve(team.stripeSubscriptionId);
            // Report usage for each metric type
            for (const item of subscription.items.data) {
                const priceId = item.price.id;
                const metricType = this.getMetricTypeFromPriceId(priceId);
                if (!metricType)
                    continue;
                const usage = teamRecords
                    .filter((r) => this.mapToStripeMetric(r.metricType) === metricType)
                    .reduce((sum, r) => sum + r.quantity, 0);
                if (usage > 0) {
                    await this.stripe.subscriptionItems.createUsageRecord(item.id, {
                        quantity: Math.ceil(usage),
                        timestamp: Math.floor(Date.now() / 1000),
                        action: "increment",
                    });
                }
            }
        }
    }
    // Handle payment failures
    async handlePaymentFailure(subscriptionId) {
        const team = await this.prisma.team.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
            include: { projects: true },
        });
        if (!team)
            return;
        // Update team status
        await this.prisma.team.update({
            where: { id: team.id },
            data: {
                subscriptionStatus: "payment_failed",
                paymentFailedAt: new Date(),
            },
        });
        // Scale down all services after grace period
        const gracePeriodHours = 24;
        setTimeout(async () => {
            // Check if payment is still failed
            const updatedTeam = await this.prisma.team.findUnique({
                where: { id: team.id },
            });
            if (updatedTeam?.subscriptionStatus === "payment_failed") {
                // Scale down all projects
                for (const project of team.projects) {
                    await this.suspendProject(project.id);
                }
            }
        }, gracePeriodHours * 60 * 60 * 1000);
    }
    // Webhook handler
    async handleWebhook(signature, payload) {
        let event;
        try {
            event = this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
        }
        catch (err) {
            throw new Error(`Webhook signature verification failed`);
        }
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
                await this.handleSubscriptionUpdate(event.data.object);
                break;
            case "customer.subscription.deleted":
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case "invoice.payment_failed":
                await this.handlePaymentFailure(event.data.object.subscription);
                break;
            case "invoice.payment_succeeded":
                await this.handlePaymentSuccess(event.data.object);
                break;
        }
    }
    async handleSubscriptionUpdate(subscription) {
        const teamId = subscription.metadata.teamId;
        if (!teamId)
            return;
        await this.prisma.team.update({
            where: { id: teamId },
            data: {
                subscriptionStatus: subscription.status,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
        });
    }
    async handleSubscriptionDeleted(subscription) {
        const teamId = subscription.metadata.teamId;
        if (!teamId)
            return;
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            include: { projects: true },
        });
        if (!team)
            return;
        // Suspend all projects
        for (const project of team.projects) {
            await this.suspendProject(project.id);
        }
        // Update team status
        await this.prisma.team.update({
            where: { id: teamId },
            data: {
                subscriptionStatus: "canceled",
            },
        });
    }
    async handlePaymentSuccess(invoice) {
        if (!invoice.subscription)
            return;
        const team = await this.prisma.team.findFirst({
            where: { stripeSubscriptionId: invoice.subscription },
        });
        if (!team)
            return;
        // Update team status
        await this.prisma.team.update({
            where: { id: team.id },
            data: {
                subscriptionStatus: "active",
                paymentFailedAt: null,
            },
        });
        // Store invoice
        await this.prisma.invoice.create({
            data: {
                teamId: team.id,
                stripeInvoiceId: invoice.id,
                amount: invoice.amount_paid / 100, // Convert from cents
                currency: invoice.currency,
                status: invoice.status || "paid",
                periodStart: new Date(invoice.period_start * 1000),
                periodEnd: new Date(invoice.period_end * 1000),
                paidAt: invoice.status === "paid" ? new Date() : null,
            },
        });
    }
    async suspendProject(projectId) {
        // Scale all deployments to zero
        const deployments = await this.prisma.deployment.findMany({
            where: {
                projectId,
                status: "active",
            },
        });
        for (const deployment of deployments) {
            // Call Kubernetes to scale to zero
            // This would integrate with your K8s service
            console.log(`Suspending deployment ${deployment.id}`);
        }
        // Update project status
        await this.prisma.project.update({
            where: { id: projectId },
            data: {
                status: "suspended",
                suspendedAt: new Date(),
            },
        });
    }
    groupByTeam(records) {
        const grouped = {};
        for (const record of records) {
            // Get team ID from project
            // This is simplified - you'd need to look up the team from project
            const teamId = "team-id"; // Placeholder
            if (!grouped[teamId]) {
                grouped[teamId] = [];
            }
            grouped[teamId].push(record);
        }
        return grouped;
    }
    getMetricTypeFromPriceId(priceId) {
        for (const [metric, id] of Object.entries(this.PRICE_IDS)) {
            if (id === priceId)
                return metric;
        }
        return null;
    }
    mapToStripeMetric(metricType) {
        const mapping = {
            cpu_seconds: "compute",
            memory_gb_hours: "compute",
            storage_gb_hours: "storage",
            egress_gb: "bandwidth",
            requests: "requests",
        };
        return mapping[metricType] || metricType;
    }
    // Self-serve payment update
    async createPortalSession(teamId) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
        });
        if (!team?.stripeCustomerId) {
            throw new Error("No Stripe customer found");
        }
        const session = await this.stripe.billingPortal.sessions.create({
            customer: team.stripeCustomerId,
            return_url: `${process.env.APP_URL}/settings/billing`,
        });
        return session.url;
    }
}
exports.StripeService = StripeService;
//# sourceMappingURL=stripe.service.js.map