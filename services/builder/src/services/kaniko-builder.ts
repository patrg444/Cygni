import * as k8s from "@kubernetes/client-node";
import { logger } from "../lib/logger";
import { BuildStatus } from "../types/build";
import { ECRClient, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr";
import { Readable } from "stream";

interface KanikoBuildOptions {
  buildId: string;
  gitUrl: string;
  gitRef: string;
  contextPath: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, string>;
  cacheKey?: string;
}

interface BuildResult {
  imageUrl: string;
  imageSha: string;
  logs: string;
  duration: number;
}

export class KanikoBuilder {
  private k8sApi: k8s.BatchV1Api;
  private k8sCore: k8s.CoreV1Api;
  private kc: k8s.KubeConfig;
  private ecrClient: ECRClient;
  private namespace: string;
  private ecrRegistry: string;

  constructor(ecrRepositoryUri: string, namespace: string) {
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
    this.ecrRegistry = ecrRepositoryUri;
    this.namespace = namespace;
  }

  async build(options: KanikoBuildOptions): Promise<BuildResult> {
    const startTime = Date.now();
    const imageName = `${this.ecrRegistry}:${options.gitRef.substring(0, 7)}`;

    // Create ECR auth secret
    await this.createECRAuthSecret(options.buildId);

    // Create Kaniko job
    await this.createKanikoJob({
      buildId: options.buildId,
      imageName,
      repoUrl: options.gitUrl,
      commitSha: options.gitRef,
      dockerfilePath: options.dockerfilePath,
      buildArgs: options.buildArgs,
      cacheKey: options.cacheKey,
    });

    // Wait for job completion
    let status = BuildStatus.PENDING;
    let logs = "";
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes
    const pollInterval = 5000; // 5 seconds
    const startPoll = Date.now();

    while (Date.now() - startPoll < maxWaitTime) {
      status = await this.getBuildStatus(options.buildId);

      if (status === BuildStatus.SUCCESS || status === BuildStatus.FAILED) {
        logs = await this.getBuildLogs(options.buildId);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    if (status !== BuildStatus.SUCCESS) {
      throw new Error(`Build failed with status: ${status}\n${logs}`);
    }

    const duration = Date.now() - startTime;

    return {
      imageUrl: imageName,
      imageSha: options.gitRef,
      logs,
      duration,
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
                  `--context=git://${options.repoUrl}#${options.commitSha}`,
                  `--dockerfile=${options.dockerfilePath || "Dockerfile"}`,
                  `--destination=${options.imageName}`,
                  "--cache=true",
                  `--cache-repo=${this.ecrRegistry}-cache`,
                  "--push-retry=3",
                  "--snapshotMode=redo",
                  ...buildArgsFlags.split(" ").filter(Boolean),
                ],
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

  async streamLogs(buildId: string): Promise<NodeJS.ReadableStream> {
    const stream = new Readable({
      read() {},
    });

    this.streamBuildLogs(buildId, (log) => {
      stream.push(log);
    })
      .then(() => {
        stream.push(null); // End the stream
      })
      .catch((error) => {
        stream.destroy(error);
      });

    return stream;
  }

  async cancelBuild(buildId: string): Promise<void> {
    try {
      await this.k8sApi.deleteNamespacedJob(
        buildId,
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        "Background",
      );
    } catch (error) {
      logger.error("Failed to cancel build", { buildId, error });
      throw error;
    }
  }

  private async streamBuildLogs(
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
