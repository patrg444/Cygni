interface Notification {
    userId: string;
    type: string;
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    data?: any;
}
interface OpsAlert {
    severity: "error" | "warning" | "info";
    title: string;
    message: string;
    data?: any;
}
export declare class NotificationService {
    private prisma;
    constructor();
    send(notification: Notification): Promise<void>;
    sendOpsAlert(alert: OpsAlert): Promise<void>;
    private sendEmail;
}
export {};
//# sourceMappingURL=notification.service.d.ts.map