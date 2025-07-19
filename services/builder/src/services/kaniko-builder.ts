import * as k8s from "@kubernetes/client-node";
import { nanoid } from "nanoid";
import { logger } from "../utils/logger";
import { Build, BuildStatus } from "../types/build";
import { ECRClient, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr";

interface KanikoBuildOptions {
  repoUrl: string;
  commitSha: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, string>;
  cacheKey?: string;
  projectId: string;
}

export class KanikoBuilder {
  private k8sApi: k8s.BatchV1Api;
  private k8sCore: k8s.CoreV1Api;
  private kc: k8s.KubeConfig;
  private ecrClient: ECRClient;
  private namespace = "cygni-builds";
  private ecrRegistry: string;

  constructor() {
    this.kc = new k8s.KubeConfig();
    if (process.env.NODE_ENV === "production") {
      this.kc.loadFromCluster();
    } else {
      this.kc.loadFromDefault();
    }

    this.k8sApi = this.kc.makeApiClient(k8s.BatchV1Api);
    this.k8sCore = this.kc.makeApiClient(k8s.CoreV1Api);
    this.ecrClient = new ECRClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    this.ecrRegistry = process.env.ECR_REGISTRY || "";
  }

  async build(options: KanikoBuildOptions): Promise<Build> {
    const buildId = `build-${nanoid(12)}`;
    const imageName = `${this.ecrRegistry}/${options.projectId}:${options.commitSha}`;

    // Create ECR auth secret
    await this.createECRAuthSecret(buildId);

    // Create Kaniko job
    await this.createKanikoJob({
      buildId,
      imageName,
      ...options,
    });

    return {
      id: buildId,
      projectId: options.projectId,
      commitSha: options.commitSha,
      branch: "", // Extract from repo in real implementation
      status: BuildStatus.PENDING,
      imageUrl: imageName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async createECRAuthSecret(buildId: string): Promise<void> {
    const authData = await this.getECRAuth();

    const secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: `ecr-auth-${buildId}`,
        namespace: this.namespace,
      },
      type: "kubernetes.io/dockerconfigjson",
      data: {
        ".dockerconfigjson": Buffer.from(
          JSON.stringify({
            auths: {
              [this.ecrRegistry]: {
                auth: authData,
              },
            },
          }),
        ).toString("base64"),
      },
    };

    await this.k8sCore.createNamespacedSecret(this.namespace, secret);
  }

  private async getECRAuth(): Promise<string> {
    const command = new GetAuthorizationTokenCommand({});
    const response = await this.ecrClient.send(command);

    if (!response.authorizationData?.[0]?.authorizationToken) {
      throw new Error("Failed to get ECR authorization token");
    }

    return response.authorizationData[0].authorizationToken;
  }

  private async createKanikoJob(options: {
    buildId: string;
    imageName: string;
    repoUrl: string;
    commitSha: string;
    dockerfilePath?: string;
    buildArgs?: Record<string, string>;
    cacheKey?: string;
  }): Promise<k8s.V1Job> {
    const buildArgsFlags = Object.entries(options.buildArgs || {})
      .map(([key, value]) => `--build-arg=${key}=${value}`)
      .join(" ");

    const job: k8s.V1Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: options.buildId,
        namespace: this.namespace,
        labels: {
          "cygni.io/build-id": options.buildId,
          "cygni.io/type": "build",
        },
      },
      spec: {
        ttlSecondsAfterFinished: 3600, // Clean up after 1 hour
        backoffLimit: 1,
        template: {
          metadata: {
            labels: {
              "cygni.io/build-id": options.buildId,
            },
          },
          spec: {
            restartPolicy: "Never",
            containers: [
              {
                name: "kaniko",
                image: "gcr.io/kaniko-project/executor:latest",
                args: [
                  `--context=${options.repoUrl}#${options.commitSha}`,
                  `--dockerfile=${options.dockerfilePath || "Dockerfile"}`,
                  `--destination=${options.imageName}`,
                  "--cache=true",
                  `--cache-repo=${this.ecrRegistry}/cache`,
                  "--push-retry=3",
                  "--snapshotMode=redo",
                  buildArgsFlags,
                ].filter(Boolean),
                volumeMounts: [
                  {
                    name: "docker-config",
                    mountPath: "/kaniko/.docker",
                  },
                ],
                resources: {
                  requests: {
                    cpu: "500m",
                    memory: "1Gi",
                  },
                  limits: {
                    cpu: "2",
                    memory: "4Gi",
                  },
                },
              },
            ],
            volumes: [
              {
                name: "docker-config",
                secret: {
                  secretName: `ecr-auth-${options.buildId}`,
                  items: [
                    {
                      key: ".dockerconfigjson",
                      path: "config.json",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const response = await this.k8sApi.createNamespacedJob(this.namespace, job);
    return response.body;
  }

  async getBuildStatus(buildId: string): Promise<BuildStatus> {
    try {
      const response = await this.k8sApi.readNamespacedJobStatus(
        buildId,
        this.namespace,
      );
      const job = response.body;

      if (job.status?.succeeded) {
        return BuildStatus.SUCCESS;
      } else if (job.status?.failed) {
        return BuildStatus.FAILED;
      } else if (job.status?.active) {
        return BuildStatus.RUNNING;
      }

      return BuildStatus.PENDING;
    } catch (error) {
      logger.error("Failed to get build status", { buildId, error });
      return BuildStatus.FAILED;
    }
  }

  async getBuildLogs(buildId: string): Promise<string> {
    try {
      const pods = await this.k8sCore.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `cygni.io/build-id=${buildId}`,
      );

      if (pods.body.items.length === 0) {
        return "Build not started yet...";
      }

      const pod = pods.body.items[0];
      if (!pod || !pod.metadata?.name) {
        return "Pod metadata not available";
      }
      const logsResponse = await this.k8sCore.readNamespacedPodLog(
        pod.metadata.name,
        this.namespace,
      );

      return logsResponse.body;
    } catch (error) {
      logger.error("Failed to get build logs", { buildId, error });
      return "Failed to retrieve logs";
    }
  }

  async streamBuildLogs(
    buildId: string,
    onLog: (log: string) => void,
  ): Promise<void> {
    const stream = new k8s.Log(this.kc);

    const pods = await this.k8sCore.listNamespacedPod(
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `cygni.io/build-id=${buildId}`,
    );

    if (pods.body.items.length === 0) {
      throw new Error("Build pod not found");
    }

    const pod = pods.body.items[0];
    if (!pod || !pod.metadata?.name) {
      throw new Error("Pod metadata not available");
    }
    const logStream = await stream.log(
      this.namespace,
      pod.metadata.name,
      "kaniko",
      process.stdout,
      { follow: true, tailLines: 100 },
    );

    logStream.on("data", (chunk: Buffer) => {
      onLog(chunk.toString());
    });

    return new Promise((resolve, reject) => {
      logStream.on("end", resolve);
      logStream.on("error", reject);
    });
  }
}
