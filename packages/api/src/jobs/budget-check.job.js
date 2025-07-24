"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeBudgetCheckJob = initializeBudgetCheckJob;
const cron_1 = require("cron");
const client_1 = require("@prisma/client");
const budget_monitor_1 = require("../services/billing/budget-monitor");
// import { KubernetesService } from '../services/kubernetes/kubernetes.service';
const notification_service_1 = require("../services/notification/notification.service");
const prisma = new client_1.PrismaClient();
function initializeBudgetCheckJob() {
    // const k8sService = new KubernetesService();
    const notificationService = new notification_service_1.NotificationService();
    const budgetMonitor = new budget_monitor_1.BudgetMonitor(prisma, notificationService);
    // Run every hour
    const job = new cron_1.CronJob("0 * * * *", // Every hour at minute 0
    async () => {
        console.log("Starting hourly budget check...");
        try {
            await budgetMonitor.checkAllProjectBudgets();
            console.log("Budget check completed successfully");
        }
        catch (error) {
            console.error("Budget check failed:", error);
            // Send alert to ops team
            await notificationService.sendOpsAlert({
                severity: "error",
                title: "Budget Check Job Failed",
                message: `The hourly budget check job failed with error: ${error instanceof Error ? error.message : String(error)}`,
                data: { error: error instanceof Error ? error.stack : String(error) },
            });
        }
    }, null, true, // Start immediately
    "America/New_York");
    // Also run a more frequent check for projects approaching limit
    const frequentCheckJob = new cron_1.CronJob("*/15 * * * *", // Every 15 minutes
    async () => {
        try {
            // Only check projects that are above 90% usage
            const projects = await prisma.project.findMany({
                where: {
                    status: { not: "budget_exceeded" },
                },
                include: {
                    _count: {
                        select: { deployments: true },
                    },
                },
            });
            for (const project of projects) {
                // Skip projects with no deployments
                if (project._count.deployments === 0)
                    continue;
                const status = await budgetMonitor.checkBudget(project.id);
                // Log high usage
                if (status.percentUsed > 90) {
                    console.log(`Project ${project.id} is at ${status.percentUsed.toFixed(1)}% of budget`);
                }
            }
        }
        catch (error) {
            console.error("Frequent budget check failed:", error);
        }
    }, null, true, "America/New_York");
    console.log("Budget check jobs initialized");
    return { job, frequentCheckJob };
}
//# sourceMappingURL=budget-check.job.js.map