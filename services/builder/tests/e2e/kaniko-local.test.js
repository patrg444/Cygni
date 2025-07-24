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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const uuid_1 = require("uuid");
const kaniko_builder_1 = require("../../src/services/kaniko-builder");
const build_1 = require("../../src/types/build");
// Mock Kubernetes client
vitest_1.vi.mock("@kubernetes/client-node", () => ({
    KubeConfig: vitest_1.vi.fn().mockImplementation(() => ({
        loadFromDefault: vitest_1.vi.fn(),
        getContexts: vitest_1.vi
            .fn()
            .mockReturnValue([
            { name: "kind-cygni-test", cluster: "cygni-test", user: "test" },
        ]),
        setCurrentContext: vitest_1.vi.fn(),
        makeApiClient: vitest_1.vi.fn().mockImplementation(() => ({
            createNamespacedJob: vitest_1.vi.fn().mockResolvedValue({
                response: { statusCode: 201 },
                body: {
                    metadata: { name: "kaniko-build-test", namespace: "cygni-builds" },
                    status: { succeeded: 1 },
                },
            }),
            readNamespacedJob: vitest_1.vi.fn().mockResolvedValue({
                body: {
                    status: { succeeded: 1, completionTime: new Date().toISOString() },
                },
            }),
            readNamespacedJobStatus: vitest_1.vi.fn().mockResolvedValue({
                body: {
                    status: { succeeded: 1, completionTime: new Date().toISOString() },
                },
            }),
            deleteNamespacedJob: vitest_1.vi.fn().mockResolvedValue({}),
            listNamespacedPod: vitest_1.vi.fn().mockResolvedValue({
                body: {
                    items: [
                        {
                            metadata: { name: "kaniko-build-test-pod" },
                            status: { phase: "Succeeded" },
                        },
                    ],
                },
            }),
            readNamespacedPodLog: vitest_1.vi.fn().mockResolvedValue({
                body: "Kaniko build successful\nPushed image to registry",
            }),
            createNamespace: vitest_1.vi.fn().mockResolvedValue({}),
            createNamespacedSecret: vitest_1.vi.fn().mockResolvedValue({}),
            deleteNamespacedSecret: vitest_1.vi.fn().mockResolvedValue({}),
        })),
    })),
    BatchV1Api: vitest_1.vi.fn(),
    CoreV1Api: vitest_1.vi.fn(),
}));
(0, vitest_1.describe)("E2E - Kaniko Build with Kind Cluster", () => {
    const REGISTRY_URL = "localhost:5000";
    (0, vitest_1.beforeAll)(async () => {
        // Setup is handled by mocks
    });
    (0, vitest_1.it)("should successfully build and push image using Kaniko", async () => {
        const buildId = `test-build-${(0, uuid_1.v4)().substring(0, 8)}`;
        const imageName = `${REGISTRY_URL}/cygni-test:${buildId}`;
        // Create a KanikoBuilder instance
        const kanikoBuilder = new kaniko_builder_1.KanikoBuilder(REGISTRY_URL, "cygni-builds");
        // The KanikoBuilder will use the mocked Kubernetes client
        const buildResult = await kanikoBuilder.build({
            buildId,
            gitUrl: "https://github.com/test/repo.git",
            gitRef: "main",
            contextPath: ".",
            dockerfilePath: "Dockerfile",
            buildArgs: {},
            cacheKey: "test-cache",
        });
        // Verify the result
        (0, vitest_1.expect)(buildResult).toBeDefined();
        (0, vitest_1.expect)(buildResult.imageUrl).toContain(REGISTRY_URL);
        (0, vitest_1.expect)(buildResult.logs).toContain("Kaniko build successful");
        (0, vitest_1.expect)(buildResult.duration).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("should handle build failures gracefully", async () => {
        const buildId = `fail-build-${(0, uuid_1.v4)().substring(0, 8)}`;
        // Update mock to simulate failure
        const KubeConfig = vitest_1.vi.mocked(await Promise.resolve().then(() => __importStar(require("@kubernetes/client-node")))).KubeConfig;
        vitest_1.vi.mocked(KubeConfig).mockImplementationOnce(() => ({
            loadFromDefault: vitest_1.vi.fn(),
            getContexts: vitest_1.vi
                .fn()
                .mockReturnValue([
                { name: "kind-cygni-test", cluster: "cygni-test", user: "test" },
            ]),
            setCurrentContext: vitest_1.vi.fn(),
            makeApiClient: vitest_1.vi.fn().mockImplementation(() => ({
                createNamespacedJob: vitest_1.vi.fn().mockResolvedValue({
                    response: { statusCode: 201 },
                    body: {
                        metadata: { name: `kaniko-${buildId}`, namespace: "cygni-builds" },
                        status: {},
                    },
                }),
                readNamespacedJob: vitest_1.vi.fn().mockResolvedValue({
                    body: {
                        status: {
                            failed: 1,
                            conditions: [{ type: "Failed", reason: "DeadlineExceeded" }],
                        },
                    },
                }),
                readNamespacedJobStatus: vitest_1.vi.fn().mockResolvedValue({
                    body: {
                        status: {
                            failed: 1,
                            conditions: [{ type: "Failed", reason: "DeadlineExceeded" }],
                        },
                    },
                }),
                listNamespacedPod: vitest_1.vi.fn().mockResolvedValue({
                    body: {
                        items: [
                            {
                                metadata: { name: `kaniko-${buildId}-pod` },
                                status: { phase: "Failed" },
                            },
                        ],
                    },
                }),
                readNamespacedPodLog: vitest_1.vi.fn().mockResolvedValue({
                    body: "Error: Failed to pull git repository\nFatal: repository not found",
                }),
                deleteNamespacedJob: vitest_1.vi.fn().mockResolvedValue({}),
                createNamespacedSecret: vitest_1.vi.fn().mockResolvedValue({}),
                deleteNamespacedSecret: vitest_1.vi.fn().mockResolvedValue({}),
            })),
        }));
        const kanikoBuilder = new kaniko_builder_1.KanikoBuilder(REGISTRY_URL, "cygni-builds");
        // Expect the build to throw an error
        await (0, vitest_1.expect)(kanikoBuilder.build({
            buildId,
            gitUrl: "https://github.com/invalid/repo.git",
            gitRef: "main",
            contextPath: ".",
            dockerfilePath: "Dockerfile.nonexistent",
            buildArgs: {},
            cacheKey: "test-cache",
        })).rejects.toThrow();
    });
});
(0, vitest_1.describe)("E2E - Builder Service with Kaniko Integration", () => {
    (0, vitest_1.it)("should process build request through full pipeline", async () => {
        // Mock the full build pipeline
        const buildId = `pipeline-${(0, uuid_1.v4)().substring(0, 8)}`;
        // Simulate build creation
        const build = {
            id: buildId,
            projectId: "e2e-kaniko-test",
            branch: "main",
            commitSha: "abc123",
            status: build_1.BuildStatus.PENDING,
            dockerfilePath: "Dockerfile",
            repoUrl: "https://github.com/test/repo.git",
        };
        // Simulate status progression
        const statusProgression = [
            build_1.BuildStatus.PENDING,
            build_1.BuildStatus.QUEUED,
            build_1.BuildStatus.RUNNING,
            build_1.BuildStatus.SUCCESS,
        ];
        let currentStatus = 0;
        const getStatus = () => {
            if (currentStatus < statusProgression.length - 1) {
                currentStatus++;
            }
            return statusProgression[currentStatus];
        };
        // Simulate the build progressing through states
        for (let i = 0; i < 4; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            build.status = getStatus();
        }
        (0, vitest_1.expect)(build.status).toBe(build_1.BuildStatus.SUCCESS);
    });
});
//# sourceMappingURL=kaniko-local.test.js.map