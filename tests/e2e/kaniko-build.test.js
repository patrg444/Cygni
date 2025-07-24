"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const k8s = __importStar(require("@kubernetes/client-node"));
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
(0, vitest_1.describe)("End-to-End - Kaniko Build Cycle", () => {
    const API_URL = process.env.API_URL || "http://localhost:3000";
    const REGISTRY_URL = process.env.REGISTRY_URL || "localhost:5000";
    let k8sClient;
    (0, vitest_1.beforeAll)(async () => {
        // Initialize Kubernetes client
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        k8sClient = kc.makeApiClient(k8s.BatchV1Api);
        // Ensure local registry is running
        try {
            await execAsync("docker run -d -p 5000:5000 --name registry registry:2");
        }
        catch (error) {
            // Registry might already be running
        }
        // Wait for API to be ready
        await waitForService(API_URL + "/api/health");
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup
        try {
            await execAsync("docker stop registry && docker rm registry");
        }
        catch (error) {
            // Ignore cleanup errors
        }
    });
    (0, vitest_1.it)("should build and push a simple Docker image via Kaniko", async () => {
        // 1. Submit build request for a simple hello-world app
        const buildRequest = {
            projectId: "e2e-test-project",
            branch: "main",
            commitSha: "e2e123",
            dockerfilePath: "Dockerfile",
            buildArgs: {
                NODE_ENV: "production",
            },
            repoUrl: "https://github.com/GoogleContainerTools/kaniko.git",
            // Use a simple test Dockerfile
            metadata: {
                dockerfileContent: `
FROM alpine:latest
RUN echo "Hello from Cygni E2E test" > /hello.txt
CMD ["cat", "/hello.txt"]
        `.trim(),
            },
        };
        const createResponse = await axios_1.default.post(`${API_URL}/api/builds`, buildRequest, {
            headers: {
                "X-API-Key": process.env.API_KEY || "test-api-key",
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(202);
        const buildId = createResponse.data.id;
        // 2. Poll build status until completed or failed
        let status = "pending";
        let imageUrl = null;
        const startTime = Date.now();
        const timeout = 30000; // 30 seconds timeout
        while (["pending", "queued", "running"].includes(status) &&
            Date.now() - startTime < timeout) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const statusResponse = await axios_1.default.get(`${API_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": process.env.API_KEY || "test-api-key" },
            });
            status = statusResponse.data.status;
            imageUrl = statusResponse.data.imageUrl;
            console.log(`Build ${buildId} status: ${status}`);
        }
        // 3. Verify build completed successfully
        (0, vitest_1.expect)(status).toBe("completed");
        (0, vitest_1.expect)(imageUrl).toBeTruthy();
        (0, vitest_1.expect)(imageUrl).toContain(REGISTRY_URL);
        // 4. Verify image exists in registry
        const imageName = imageUrl.split("/").pop().split(":")[0];
        const imageTag = imageUrl.split(":").pop() || "latest";
        const registryResponse = await axios_1.default.get(`http://${REGISTRY_URL}/v2/${imageName}/tags/list`);
        (0, vitest_1.expect)(registryResponse.status).toBe(200);
        (0, vitest_1.expect)(registryResponse.data.tags).toContain(imageTag);
        // 5. Pull and run the image to verify it works
        const { stdout } = await execAsync(`docker pull ${imageUrl} && docker run --rm ${imageUrl}`);
        (0, vitest_1.expect)(stdout).toContain("Hello from Cygni E2E test");
    }, 60000); // 60 second timeout for the entire test
    (0, vitest_1.it)("should handle build failures gracefully", async () => {
        // Submit a build that will fail
        const failedBuildRequest = {
            projectId: "e2e-fail-test",
            branch: "main",
            commitSha: "fail123",
            dockerfilePath: "Dockerfile.nonexistent",
            repoUrl: "https://github.com/invalid/repo",
        };
        const createResponse = await axios_1.default.post(`${API_URL}/api/builds`, failedBuildRequest, {
            headers: {
                "X-API-Key": process.env.API_KEY || "test-api-key",
                "Content-Type": "application/json",
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(202);
        const buildId = createResponse.data.id;
        // Wait for build to fail
        let status = "pending";
        const startTime = Date.now();
        const timeout = 30000;
        while (status === "pending" && Date.now() - startTime < timeout) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const statusResponse = await axios_1.default.get(`${API_URL}/api/builds/${buildId}`, {
                headers: { "X-API-Key": process.env.API_KEY || "test-api-key" },
            });
            status = statusResponse.data.status;
        }
        (0, vitest_1.expect)(status).toBe("failed");
    });
});
async function waitForService(url, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await axios_1.default.get(url);
            return;
        }
        catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    throw new Error(`Service at ${url} did not become ready`);
}
//# sourceMappingURL=kaniko-build.test.js.map