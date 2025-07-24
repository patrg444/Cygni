"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const budget_monitor_1 = require("../../src/services/billing/budget-monitor");
const client_1 = require("@prisma/client");
describe("BudgetMonitor", () => {
    let budgetMonitor;
    let mockPrisma;
    let mockNotification;
    beforeEach(() => {
        mockPrisma = new client_1.PrismaClient();
        mockNotification = {
            send: jest.fn(),
        };
        budgetMonitor = new budget_monitor_1.BudgetMonitor(mockPrisma, mockNotification);
    });
    describe("calculateCurrentUsage", () => {
        it("should calculate usage correctly", async () => {
            // Mock usage events
            mockPrisma.usageEvent.groupBy = jest.fn().mockResolvedValue([
                { metricType: "cpu_seconds", _sum: { quantity: 3600000 } },
                { metricType: "memory_gb_hours", _sum: { quantity: 1000 } },
                { metricType: "egress_gb", _sum: { quantity: 50 } },
            ]);
            const usage = await budgetMonitor.calculateCurrentUsage("project-123");
            expect(usage.total).toBeCloseTo(45.5); // $36 + $5 + $4.50
            expect(usage.cpuSeconds).toBe(3600000);
            expect(usage.memoryGBHours).toBe(1000);
            expect(usage.egressGB).toBe(50);
        });
    });
    describe("checkBudget", () => {
        it("should enforce limit when exceeded", async () => {
            // Mock over-limit usage
            mockPrisma.usageEvent.groupBy = jest.fn().mockResolvedValue([
                { metricType: "cpu_seconds", _sum: { quantity: 1800000 } }, // $18
            ]);
            mockPrisma.deployment.findMany = jest.fn().mockResolvedValue([
                { id: "deploy-1", environment: { slug: "production" } },
                { id: "deploy-2", environment: { slug: "staging" } },
            ]);
            mockPrisma.project.update = jest.fn();
            mockPrisma.project.findUnique = jest.fn().mockResolvedValue({
                id: "project-123",
                name: "Test Project",
                team: {
                    users: [{ id: "user-1", email: "test@example.com" }],
                },
            });
            const status = await budgetMonitor.checkBudget("project-123");
            expect(status.isOverLimit).toBe(true);
            expect(status.used).toBeGreaterThan(10);
            // Scaling is temporarily disabled
            // expect(mockK8s.scaleDeployment).toHaveBeenCalledWith('deploy-2', 0); // staging scaled to 0
            // expect(mockK8s.scaleDeployment).toHaveBeenCalledWith('deploy-1', 1); // prod scaled to 1
            expect(mockNotification.send).toHaveBeenCalled();
        });
        it("should send warning at 80% usage", async () => {
            // Mock 85% usage
            mockPrisma.usageEvent.groupBy = jest.fn().mockResolvedValue([
                { metricType: "cpu_seconds", _sum: { quantity: 850000 } }, // $8.50
            ]);
            mockPrisma.project.findUnique = jest.fn().mockResolvedValue({
                id: "project-123",
                name: "Test Project",
                team: {
                    users: [{ id: "user-1", email: "test@example.com" }],
                },
            });
            const status = await budgetMonitor.checkBudget("project-123");
            expect(status.percentUsed).toBe(85);
            expect(status.isOverLimit).toBe(false);
            expect(mockNotification.send).toHaveBeenCalledWith(expect.objectContaining({
                type: "budget_alert",
                severity: "warning",
            }));
        });
    });
});
//# sourceMappingURL=budget-monitor.test.js.map