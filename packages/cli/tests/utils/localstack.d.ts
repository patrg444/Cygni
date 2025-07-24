export interface LocalStackConfig {
    services?: string[];
    port?: number;
    debug?: boolean;
}
export interface LocalStackCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint: string;
}
export declare class LocalStackManager {
    private process?;
    private port;
    private services;
    private isRunning;
    constructor(config?: LocalStackConfig);
    /**
     * Start LocalStack Docker container
     */
    start(): Promise<LocalStackCredentials>;
    /**
     * Stop LocalStack
     */
    stop(): Promise<void>;
    /**
     * Get AWS credentials for LocalStack
     */
    getCredentials(): LocalStackCredentials;
    /**
     * Create S3 bucket
     */
    createS3Bucket(bucketName: string): Promise<void>;
    /**
     * Create ECR repository
     */
    createECRRepository(repositoryName: string): Promise<string>;
    /**
     * Put SSM parameter
     */
    putSSMParameter(name: string, value: string, type?: string): Promise<void>;
    /**
     * Get SSM parameter
     */
    getSSMParameter(name: string): Promise<string>;
    /**
     * Get pre-signed S3 URL for upload
     */
    getS3PresignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
    /**
     * Wait for LocalStack to be ready
     */
    private waitForReady;
    /**
     * Check if LocalStack is already running
     */
    private checkIfRunning;
}
/**
 * Convenience function to start LocalStack
 */
export declare function startLocalStack(config?: LocalStackConfig): Promise<{
    manager: LocalStackManager;
    credentials: LocalStackCredentials;
}>;
//# sourceMappingURL=localstack.d.ts.map