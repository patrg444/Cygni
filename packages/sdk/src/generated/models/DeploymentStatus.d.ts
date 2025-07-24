export type DeploymentStatus = {
    id?: string;
    status?: DeploymentStatus.status;
    services?: Array<{
        name?: string;
        type?: string;
        status?: string;
        url?: string;
    }>;
    createdAt?: string;
    completedAt?: string;
    environment?: string;
    provider?: string;
};
export declare namespace DeploymentStatus {
    enum status {
        PENDING = "pending",
        IN_PROGRESS = "in_progress",
        COMPLETED = "completed",
        FAILED = "failed"
    }
}
//# sourceMappingURL=DeploymentStatus.d.ts.map