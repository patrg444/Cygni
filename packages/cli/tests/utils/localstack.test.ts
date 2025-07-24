import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { LocalStackManager } from "./localstack";
import { execa } from "execa";

describe("LocalStack utilities", () => {
  let localstack: LocalStackManager;

  beforeAll(async () => {
    // Check if Docker is available
    try {
      await execa("docker", ["--version"]);
    } catch (error) {
      console.log("Docker not available, skipping LocalStack tests");
      return;
    }

    localstack = new LocalStackManager({
      services: ["s3", "ssm", "ecr"],
    });
  }, 60000);

  afterAll(async () => {
    if (localstack) {
      await localstack.stop();
    }
  });

  it.skip("should start LocalStack and provide credentials", async () => {
    // Skip by default to avoid requiring Docker in CI
    const credentials = await localstack.start();

    expect(credentials).toMatchObject({
      accessKeyId: "test",
      secretAccessKey: "test",
      region: "us-east-1",
      endpoint: "http://localhost:4566",
    });
  }, 60000);

  it.skip("should create and use S3 bucket", async () => {
    await localstack.start();

    const bucketName = "test-bucket-" + Date.now();
    await localstack.createS3Bucket(bucketName);

    // Get presigned URL
    const presignedUrl = await localstack.getS3PresignedUrl(
      bucketName,
      "test.txt",
    );
    expect(presignedUrl).toContain(bucketName);
    expect(presignedUrl).toContain("X-Amz-Signature");
  }, 60000);

  it.skip("should create and use SSM parameters", async () => {
    await localstack.start();

    const paramName = "/test/parameter";
    const paramValue = "test-value-" + Date.now();

    await localstack.putSSMParameter(paramName, paramValue);
    const retrievedValue = await localstack.getSSMParameter(paramName);

    expect(retrievedValue).toBe(paramValue);
  }, 60000);

  it.skip("should create ECR repository", async () => {
    await localstack.start();

    const repoName = "test-repo-" + Date.now();
    const repoUri = await localstack.createECRRepository(repoName);

    expect(repoUri).toContain(repoName);
    expect(repoUri).toContain("localhost:4566");
  }, 60000);

  it("should provide correct credentials without starting", () => {
    const credentials = localstack.getCredentials();

    expect(credentials).toEqual({
      accessKeyId: "test",
      secretAccessKey: "test",
      region: "us-east-1",
      endpoint: "http://localhost:4566",
    });
  });
});

describe("LocalStack integration example", () => {
  it.skip("example: testing S3 upload in deploy command", async () => {
    const localstack = new LocalStackManager();
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
