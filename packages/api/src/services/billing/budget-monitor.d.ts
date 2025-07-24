import { PrismaClient } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
export interface BudgetStatus {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
    willExceedAt?: Date;
    isOverLimit: boolean;
}
export interface UsageMetrics {
    cpuSeconds: number;
    memoryGBHours: number;
    storageGBHours: number;
    egressGB: number;
    requests: number;
    total: number;
    dailyRate: number;
}
export declare class BudgetMonitor {
    private prisma;
    private notificationService;
    private readonly FREE_TIER_LIMIT;
    private readonly WARNING_THRESHOLD;
    private readonly pricing;
    constructor(prisma: PrismaClient, notificationService: NotificationService);
    checkBudget(projectId: string): Promise<BudgetStatus>;
    calculateCurrentUsage(projectId: string): Promise<UsageMetrics>;
    private enforceFreeTierLimit;
    private sendBudgetAlert;
    private projectExceedTime;
    checkAllProjectBudgets(): Promise<void>;
    getBudgetStatusForUI(projectId: string): Promise<BudgetStatus & {
        breakdown: any;
    }>;
}
//# sourceMappingURL=budget-monitor.d.ts.map