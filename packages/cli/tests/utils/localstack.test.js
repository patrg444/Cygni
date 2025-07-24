"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const localstack_1 = require("./localstack");
const execa_1 = require("execa");
(0, vitest_1.describe)("LocalStack utilities", () => {
    let localstack;
    (0, vitest_1.beforeAll)(async () => {
        // Check if Docker is available
        try {
            await (0, execa_1.execa)("docker", ["--version"]);
        }
        catch (error) {
            console.log("Docker not available, skipping LocalStack tests");
            return;
        }
        localstack = new localstack_1.LocalStackManager({
            services: ["s3", "ssm", "ecr"],
        });
    }, 60000);
    (0, vitest_1.afterAll)(async () => {
        if (localstack) {
            await localstack.stop();
        }
    });
    vitest_1.it.skip("should start LocalStack and provide credentials", async () => {
        // Skip by default to avoid requiring Docker in CI
        const credentials = await localstack.start();
        (0, vitest_1.expect)(credentials).toMatchObject({
            accessKeyId: "test",
            secretAccessKey: "test",
            region: "us-east-1",
            endpoint: "http://localhost:4566",
        });
    }, 60000);
    vitest_1.it.skip("should create and use S3 bucket", async () => {
        await localstack.start();
        const bucketName = "test-bucket-" + Date.now();
        await localstack.createS3Bucket(bucketName);
        // Get presigned URL
        const presignedUrl = await localstack.getS3PresignedUrl(bucketName, "test.txt");
        (0, vitest_1.expect)(presignedUrl).toContain(bucketName);
        (0, vitest_1.expect)(presignedUrl).toContain("X-Amz-Signature");
    }, 60000);
    vitest_1.it.skip("should create and use SSM parameters", async () => {
        await localstack.start();
        const paramName = "/test/parameter";
        const paramValue = "test-value-" + Date.now();
        await localstack.putSSMParameter(paramName, paramValue);
        const retrievedValue = await localstack.getSSMParameter(paramName);
        (0, vitest_1.expect)(retrievedValue).toBe(paramValue);
    }, 60000);
    vitest_1.it.skip("should create ECR repository", async () => {
        await localstack.start();
        const repoName = "test-repo-" + Date.now();
        const repoUri = await localstack.createECRRepository(repoName);
        (0, vitest_1.expect)(repoUri).toContain(repoName);
        (0, vitest_1.expect)(repoUri).toContain("localhost:4566");
    }, 60000);
    (0, vitest_1.it)("should provide correct credentials without starting", () => {
        const credentials = localstack.getCredentials();
        (0, vitest_1.expect)(credentials).toEqual({
            accessKeyId: "test",
            secretAccessKey: "test",
            region: "us-east-1",
            endpoint: "http://localhost:4566",
        });
    });
});
(0, vitest_1.describe)("LocalStack integration example", () => {
    vitest_1.it.skip("example: testing S3 upload in deploy command", async () => {
        const localstack = new localstack_1.LocalStackManager();
        const credentials = await localstack.start();
        // Create deployment bucket
        await localstack.createS3Bucket("deployments");
        // Example of how to use in actual tests
        const deployTest = {
            env: {
                AWS_ACCESS_KEY_ID: credentials.accessKeyId,
                AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
                AWS_ENDPOINT_URL: credentials.endpoint,
                AWS_REGION: credentials.region,
            },
        };
        // Your deploy command would use these environment variables
        // const result = await cli.execute(['deploy'], deployTest);
        await localstack.stop();
    }, 60000);
});
//# sourceMappingURL=localstack.test.js.map