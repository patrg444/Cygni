import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
interface UsageRecord {
    projectId: string;
    metricType: "compute" | "storage" | "bandwidth" | "requests";
    quantity: number;
    timestamp: Date;
}
export declare class StripeService {
    private stripe;
    private prisma;
    private readonly PRICE_IDS;
    constructor(prisma: PrismaClient);
    createCustomer(teamId: string, email: string, name: string): Promise<Stripe.Response<Stripe.Customer>>;
    createSubscription(teamId: string): Promise<Stripe.Response<Stripe.Subscription>>;
    reportUsage(records: UsageRecord[]): Promise<void>;
    handlePaymentFailure(subscriptionId: string): Promise<void>;
    handleWebhook(signature: string, payload: string): Promise<void>;
    private handleSubscriptionUpdate;
    private handleSubscriptionDeleted;
    private handlePaymentSuccess;
    private suspendProject;
    private groupByTeam;
    private getMetricTypeFromPriceId;
    private mapToStripeMetric;
    createPortalSession(teamId: string): Promise<string>;
}
export {};
//# sourceMappingURL=stripe.service.d.ts.map