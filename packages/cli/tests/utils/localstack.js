"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStackManager = void 0;
exports.startLocalStack = startLocalStack;
const execa_1 = require("execa");
const wait_on_1 = __importDefault(require("wait-on"));
const axios_1 = __importDefault(require("axios"));
class LocalStackManager {
    constructor(config = {}) {
        this.isRunning = false;
        this.port = config.port || 4566;
        this.services = config.services || [
            "s3",
            "ecr",
            "ssm",
            "ecs",
            "cloudformation",
        ];
    }
    /**
     * Start LocalStack Docker container
     */
    async start() {
        if (this.isRunning) {
            return this.getCredentials();
        }
        console.log("Starting LocalStack...");
        try {
            // Check if Docker is running
            await (0, execa_1.execa)("docker", ["info"]);
        }
        catch (error) {
            throw new Error("Docker is not running. Please start Docker first.");
        }
        // Check if LocalStack is already running
        const isAlreadyRunning = await this.checkIfRunning();
        if (isAlreadyRunning) {
            console.log("LocalStack is already running");
            this.isRunning = true;
            return this.getCredentials();
        }
        // Start LocalStack
        const env = {
            SERVICES: this.services.join(","),
            DEFAULT_REGION: "us-east-1",
            DATA_DIR: "/tmp/localstack/data",
            DOCKER_HOST: "unix:///var/run/docker.sock",
            HOST_TMP_FOLDER: "/tmp/localstack",
        };
        this.process = (0, execa_1.execa)("docker", [
            "run",
            "--rm",
            "-p",
            `${this.port}:4566`,
            "-p",
            "4571:4571",
            "-e",
            `SERVICES=${env.SERVICES}`,
            "-e",
            `DEFAULT_REGION=${env.DEFAULT_REGION}`,
            "-e",
            "DOCKER_HOST=unix:///var/run/docker.sock",
            "-v",
            "/var/run/docker.sock:/var/run/docker.sock",
            "-v",
            "/tmp/localstack:/tmp/localstack",
            "--name",
            "localstack-test",
            "localstack/localstack:latest",
        ], {
            detached: false,
            cleanup: true,
        });
        // Handle process output
        if (this.process.stdout) {
            this.process.stdout.on("data", (data) => {
                if (process.env.DEBUG_LOCALSTACK) {
                    console.log(`LocalStack: ${data}`);
                }
            });
        }
        if (this.process.stderr) {
            this.process.stderr.on("data", (data) => {
                if (process.env.DEBUG_LOCALSTACK) {
                    console.error(`LocalStack Error: ${data}`);
                }
            });
        }
        // Wait for LocalStack to be ready
        await this.waitForReady();
        this.isRunning = true;
        return this.getCredentials();
    }
    /**
     * Stop LocalStack
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        console.log("Stopping LocalStack...");
        try {
            // Try to stop the container gracefully
            await (0, execa_1.execa)("docker", ["stop", "localstack-test"]);
        }
        catch (error) {
            // Container might not exist, try to kill the process
            if (this.process && !this.process.killed) {
                this.process.kill("SIGTERM");
            }
        }
        // Clean up any remaining containers
        try {
            await (0, execa_1.execa)("docker", ["rm", "-f", "localstack-test"]);
        }
        catch {
            // Ignore errors if container doesn't exist
        }
        this.isRunning = false;
        this.process = undefined;
    }
    /**
     * Get AWS credentials for LocalStack
     */
    getCredentials() {
        return {
            accessKeyId: "test",
            secretAccessKey: "test",
            region: "us-east-1",
            endpoint: `http://localhost:${this.port}`,
        };
    }
    /**
     * Create S3 bucket
     */
    async createS3Bucket(bucketName) {
        const { endpoint, region } = this.getCredentials();
        try {
            await (0, execa_1.execa)("aws", [
                "s3api",
                "create-bucket",
                "--bucket",
                bucketName,
                "--endpoint-url",
                endpoint,
                "--region",
                region,
            ], {
                env: {
                    AWS_ACCESS_KEY_ID: "test",
                    AWS_SECRET_ACCESS_KEY: "test",
                },
            });
            console.log(`Created S3 bucket: ${bucketName}`);
        }
        catch (error) {
            if (!error.stderr?.includes("BucketAlreadyExists")) {
                throw error;
            }
        }
    }
    /**
     * Create ECR repository
     */
    async createECRRepository(repositoryName) {
        const { endpoint, region } = this.getCredentials();
        try {
            const result = await (0, execa_1.execa)("aws", [
                "ecr",
                "create-repository",
                "--repository-name",
                repositoryName,
                "--endpoint-url",
                endpoint,
                "--region",
                region,
                "--output",
                "json",
            ], {
                env: {
                    AWS_ACCESS_KEY_ID: "test",
                    AWS_SECRET_ACCESS_KEY: "test",
                },
            });
            const response = JSON.parse(result.stdout);
            console.log(`Created ECR repository: ${repositoryName}`);
            return response.repository.repositoryUri;
        }
        catch (error) {
            if (error.stderr?.includes("RepositoryAlreadyExistsException")) {
                // Get existing repository URI
                const result = await (0, execa_1.execa)("aws", [
                    "ecr",
                    "describe-repositories",
                    "--repository-names",
                    repositoryName,
                    "--endpoint-url",
                    endpoint,
                    "--region",
                    region,
                    "--output",
                    "json",
                ], {
                    env: {
                        AWS_ACCESS_KEY_ID: "test",
                        AWS_SECRET_ACCESS_KEY: "test",
                    },
                });
                const response = JSON.parse(result.stdout);
                return response.repositories[0].repositoryUri;
            }
            throw error;
        }
    }
    /**
     * Put SSM parameter
     */
    async putSSMParameter(name, value, type = "String") {
        const { endpoint, region } = this.getCredentials();
        await (0, execa_1.execa)("aws", [
            "ssm",
            "put-parameter",
            "--name",
            name,
            "--value",
            value,
            "--type",
            type,
            "--endpoint-url",
            endpoint,
            "--region",
            region,
            "--overwrite",
        ], {
            env: {
                AWS_ACCESS_KEY_ID: "test",
                AWS_SECRET_ACCESS_KEY: "test",
            },
        });
        console.log(`Created SSM parameter: ${name}`);
    }
    /**
     * Get SSM parameter
     */
    async getSSMParameter(name) {
        const { endpoint, region } = this.getCredentials();
        const result = await (0, execa_1.execa)("aws", [
            "ssm",
            "get-parameter",
            "--name",
            name,
            "--endpoint-url",
            endpoint,
            "--region",
            region,
            "--output",
            "json",
        ], {
            env: {
                AWS_ACCESS_KEY_ID: "test",
                AWS_SECRET_ACCESS_KEY: "test",
            },
        });
        const response = JSON.parse(result.stdout);
        return response.Parameter.Value;
    }
    /**
     * Get pre-signed S3 URL for upload
     */
    async getS3PresignedUrl(bucket, key, expiresIn = 3600) {
        const { endpoint, region } = this.getCredentials();
        const result = await (0, execa_1.execa)("aws", [
            "s3",
            "presign",
            `s3://${bucket}/${key}`,
            "--endpoint-url",
            endpoint,
            "--region",
            region,
            "--expires-in",
            expiresIn.toString(),
        ], {
            env: {
                AWS_ACCESS_KEY_ID: "test",
                AWS_SECRET_ACCESS_KEY: "test",
            },
        });
        return result.stdout.trim();
    }
    /**
     * Wait for LocalStack to be ready
     */
    async waitForReady() {
        await (0, wait_on_1.default)({
            resources: [`tcp:localhost:${this.port}`],
            timeout: 30000,
            interval: 1000,
        });
        // Additional health check
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await axios_1.default.get(`http://localhost:${this.port}/_localstack/health`);
                if (response.data.services) {
                    console.log("LocalStack is ready!");
                    return;
                }
            }
            catch (error) {
                // Not ready yet
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error("LocalStack failed to start within timeout");
    }
    /**
     * Check if LocalStack is already running
     */
    async checkIfRunning() {
        try {
            const response = await axios_1.default.get(`http://localhost:${this.port}/_localstack/health`, {
                timeout: 1000,
            });
            return response.status === 200;
        }
        catch {
            return false;
        }
    }
}
exports.LocalStackManager = LocalStackManager;
/**
 * Convenience function to start LocalStack
 */
async function startLocalStack(config) {
    const manager = new LocalStackManager(config);
    const credentials = await manager.start();
    return { manager, credentials };
}
//# sourceMappingURL=localstack.js.map