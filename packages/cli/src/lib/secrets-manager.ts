import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";
import chalk from "chalk";

/**
 * Represents a secret stored in the secrets management system.
 * @interface Secret
 */
export interface Secret {
  /** The secret key/name (e.g., DATABASE_URL, API_KEY) */
  key: string;
  /** The actual secret value (only returned when explicitly requested) */
  value?: string;
  /** A preview of the secret value (e.g., "sk-1234****") */
  preview?: string;
  /** The environment ID this secret belongs to */
  environmentId?: string;
  /** Environment details */
  environment?: {
    /** Environment ID */
    id: string;
    /** Environment name */
    name: string;
  };
  /** Unique identifier for the secret */
  id?: string;
}

/**
 * Configuration options for the SecretsManager.
 * @interface SecretsManagerConfig
 */
export interface SecretsManagerConfig {
  /** The backend to use for secrets storage */
  backend: "aws" | "test-server";
  /** AWS-specific configuration */
  awsConfig?: {
    /** AWS region (defaults to us-east-1) */
    region?: string;
    /** Custom endpoint (e.g., for LocalStack) */
    endpoint?: string;
    /** AWS credentials */
    credentials?: {
      /** AWS access key ID */
      accessKeyId: string;
      /** AWS secret access key */
      secretAccessKey: string;
    };
  };
  /** URL of the test server (when using test-server backend) */
  testServerUrl?: string;
  /** The project ID to scope secrets to */
  projectId: string;
}

/**
 * Manages secrets across different backends (AWS Secrets Manager or test server).
 * Provides a unified interface for secret operations regardless of the underlying storage.
 *
 * @example
 * ```typescript
 * const manager = new SecretsManager({
 *   backend: 'aws',
 *   awsConfig: { region: 'us-east-1' },
 *   projectId: 'proj_123'
 * });
 *
 * await manager.setSecret('API_KEY', 'sk-1234567890');
 * const secret = await manager.getSecret('API_KEY');
 * ```
 *
 * @class SecretsManager
 */
export class SecretsManager {
  private config: SecretsManagerConfig;
  private awsClient?: SecretsManagerClient;

  /**
   * Creates a new SecretsManager instance.
   * @param {SecretsManagerConfig} config - Configuration options
   */
  constructor(config: SecretsManagerConfig) {
    this.config = config;

    if (config.backend === "aws") {
      this.awsClient = new SecretsManagerClient({
        region: config.awsConfig?.region || "us-east-1",
        endpoint: config.awsConfig?.endpoint,
        credentials: config.awsConfig?.credentials,
      });
    }
  }

  /**
   * Sets or updates a secret value.
   *
   * @param {string} key - The secret key (must be uppercase with underscores)
   * @param {string} value - The secret value
   * @param {string} [environmentId] - Optional environment ID. If not provided, sets as global secret
   * @returns {Promise<void>}
   * @throws {Error} If the operation fails
   *
   * @example
   * ```typescript
   * // Set a global secret
   * await manager.setSecret('DATABASE_URL', 'postgres://localhost/db');
   *
   * // Set an environment-specific secret
   * await manager.setSecret('API_KEY', 'sk-prod-123', 'production');
   * ```
   */
  async setSecret(
    key: string,
    value: string,
    environmentId?: string,
  ): Promise<void> {
    if (this.config.backend === "aws") {
      await this.setAWSSecret(key, value, environmentId);
    } else {
      await this.setTestServerSecret(key, value, environmentId);
    }
  }

  /**
   * Retrieves a secret by key.
   *
   * @param {string} key - The secret key to retrieve
   * @param {string} [environmentId] - Optional environment ID. If not provided, gets global secret
   * @returns {Promise<Secret | null>} The secret if found, null otherwise
   * @throws {Error} If the operation fails
   *
   * @example
   * ```typescript
   * const secret = await manager.getSecret('DATABASE_URL');
   * if (secret) {
   *   console.log(secret.value);
   * }
   * ```
   */
  async getSecret(key: string, environmentId?: string): Promise<Secret | null> {
    if (this.config.backend === "aws") {
      return await this.getAWSSecret(key, environmentId);
    } else {
      return await this.getTestServerSecret(key, environmentId);
    }
  }

  /**
   * Lists all secrets for the project.
   *
   * @param {string} [environmentId] - Optional environment ID to filter by
   * @returns {Promise<Secret[]>} Array of secrets (without values, only previews)
   * @throws {Error} If the operation fails
   *
   * @example
   * ```typescript
   * // List all secrets
   * const allSecrets = await manager.listSecrets();
   *
   * // List secrets for specific environment
   * const prodSecrets = await manager.listSecrets('production');
   * ```
   */
  async listSecrets(environmentId?: string): Promise<Secret[]> {
    if (this.config.backend === "aws") {
      return await this.listAWSSecrets(environmentId);
    } else {
      return await this.listTestServerSecrets(environmentId);
    }
  }

  /**
   * Deletes a secret.
   *
   * @param {string} key - The secret key to delete
   * @param {string} [environmentId] - Optional environment ID. If not provided, deletes global secret
   * @returns {Promise<void>}
   * @throws {Error} If the secret doesn't exist or operation fails
   *
   * @example
   * ```typescript
   * await manager.deleteSecret('OLD_API_KEY');
   * ```
   */
  async deleteSecret(key: string, environmentId?: string): Promise<void> {
    if (this.config.backend === "aws") {
      await this.deleteAWSSecret(key, environmentId);
    } else {
      await this.deleteTestServerSecret(key, environmentId);
    }
  }

  /**
   * Imports multiple secrets at once.
   *
   * @param {Record<string, string>} secrets - Object mapping secret keys to values
   * @param {string} [environmentId] - Optional environment ID. If not provided, imports as global secrets
   * @returns {Promise<{results: Array<{key: string, success: boolean, error?: string}>}>} Import results
   * @throws {Error} If the operation fails
   *
   * @example
   * ```typescript
   * const results = await manager.bulkImport({
   *   DATABASE_URL: 'postgres://localhost/db',
   *   API_KEY: 'sk-1234',
   *   REDIS_URL: 'redis://localhost:6379'
   * });
   *
   * results.results.forEach(result => {
   *   if (!result.success) {
   *     console.error(`Failed to import ${result.key}: ${result.error}`);
   *   }
   * });
   * ```
   */
  async bulkImport(
    secrets: Record<string, string>,
    environmentId?: string,
  ): Promise<any> {
    if (this.config.backend === "aws") {
      return await this.bulkImportAWS(secrets, environmentId);
    } else {
      return await this.bulkImportTestServer(secrets, environmentId);
    }
  }

  // AWS Secrets Manager implementation
  /**
   * Generates the AWS Secrets Manager secret name using hierarchical naming.
   * @private
   */
  private getAWSSecretName(key: string, environmentId?: string): string {
    const prefix = `cygni/${this.config.projectId}`;
    if (environmentId) {
      return `${prefix}/${environmentId}/${key}`;
    }
    return `${prefix}/global/${key}`;
  }

  /**
   * Sets a secret in AWS Secrets Manager.
   * Creates the secret if it doesn't exist, updates if it does.
   * @private
   */
  private async setAWSSecret(
    key: string,
    value: string,
    environmentId?: string,
  ): Promise<void> {
    const secretName = this.getAWSSecretName(key, environmentId);

    try {
      // Try to update existing secret first
      await this.awsClient!.send(
        new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: JSON.stringify({ value }),
        }),
      );
    } catch (error: any) {
      if (
        error instanceof ResourceNotFoundException ||
        error.name === "ResourceNotFoundException"
      ) {
        // Create new secret if it doesn't exist
        const tags = [
          { Key: "cygni-project", Value: this.config.projectId },
          { Key: "cygni-key", Value: key },
        ];

        if (environmentId) {
          tags.push({ Key: "cygni-environment", Value: environmentId });
        }

        await this.awsClient!.send(
          new CreateSecretCommand({
            Name: secretName,
            SecretString: JSON.stringify({ value }),
            Tags: tags,
          }),
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Retrieves a secret from AWS Secrets Manager.
   * @private
   */
  private async getAWSSecret(
    key: string,
    environmentId?: string,
  ): Promise<Secret | null> {
    const secretName = this.getAWSSecretName(key, environmentId);

    try {
      const response = await this.awsClient!.send(
        new GetSecretValueCommand({
          SecretId: secretName,
        }),
      );

      if (response.SecretString) {
        const secretData = JSON.parse(response.SecretString);
        return {
          key,
          value: secretData.value,
          preview: secretData.value
            ? `${secretData.value.substring(0, 4)}****`
            : undefined,
          environmentId,
        };
      }

      return null;
    } catch (error: any) {
      if (
        error instanceof ResourceNotFoundException ||
        error.name === "ResourceNotFoundException"
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Lists all secrets from AWS Secrets Manager for this project.
   * @private
   */
  private async listAWSSecrets(environmentId?: string): Promise<Secret[]> {
    const prefix = `cygni/${this.config.projectId}`;
    const secrets: Secret[] = [];

    let nextToken: string | undefined;

    do {
      const response = await this.awsClient!.send(
        new ListSecretsCommand({
          NextToken: nextToken,
        }),
      );

      if (response.SecretList) {
        for (const secretInfo of response.SecretList) {
          if (secretInfo.Name?.startsWith(prefix)) {
            // Parse the secret name to extract key and environment
            const parts = secretInfo.Name.split("/");
            if (parts.length >= 4) {
              const env = parts[2] === "global" ? undefined : parts[2];
              const key = parts[3];

              if (!key) {
                continue;
              }

              // Skip if filtering by environment and doesn't match
              if (environmentId && env !== environmentId) {
                continue;
              }

              try {
                const secretValue = await this.awsClient!.send(
                  new GetSecretValueCommand({
                    SecretId: secretInfo.Name,
                  }),
                );

                if (secretValue.SecretString) {
                  const secretData = JSON.parse(secretValue.SecretString);
                  secrets.push({
                    key,
                    preview: secretData.value
                      ? `${secretData.value.substring(0, 4)}****`
                      : undefined,
                    environmentId: env,
                  });
                }
              } catch (error) {
                // Skip secrets we can't read
                console.warn(
                  chalk.yellow(
                    `Warning: Unable to read secret ${secretInfo.Name}`,
                  ),
                );
              }
            }
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return secrets;
  }

  /**
   * Deletes a secret from AWS Secrets Manager.
   * Uses ForceDeleteWithoutRecovery for immediate deletion.
   * @private
   */
  private async deleteAWSSecret(
    key: string,
    environmentId?: string,
  ): Promise<void> {
    const secretName = this.getAWSSecretName(key, environmentId);

    await this.awsClient!.send(
      new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true,
      }),
    );
  }

  /**
   * Bulk imports secrets to AWS Secrets Manager.
   * @private
   */
  private async bulkImportAWS(
    secrets: Record<string, string>,
    environmentId?: string,
  ): Promise<any> {
    const results = [];

    for (const [key, value] of Object.entries(secrets)) {
      try {
        await this.setAWSSecret(key, value, environmentId);
        results.push({ key, success: true });
      } catch (error: any) {
        results.push({ key, success: false, error: error.message });
      }
    }

    return { results };
  }

  // Test server implementation (backward compatibility)
  /**
   * Sets a secret in the test server.
   * @private
   */
  private async setTestServerSecret(
    key: string,
    value: string,
    environmentId?: string,
  ): Promise<void> {
    const api = await this.getTestServerApi();

    await api.post(`/projects/${this.config.projectId}/secrets`, {
      key,
      value,
      environmentId,
    });
  }

  /**
   * Retrieves a secret from the test server.
   * @private
   */
  private async getTestServerSecret(
    key: string,
    environmentId?: string,
  ): Promise<Secret | null> {
    const api = await this.getTestServerApi();

    const response = await api.get(
      `/projects/${this.config.projectId}/secrets`,
    );
    const secrets = response.data;

    const secret = secrets.find(
      (s: any) =>
        s.key === key &&
        (environmentId ? s.environmentId === environmentId : !s.environmentId),
    );

    return secret || null;
  }

  /**
   * Lists all secrets from the test server.
   * @private
   */
  private async listTestServerSecrets(
    environmentId?: string,
  ): Promise<Secret[]> {
    const api = await this.getTestServerApi();

    const params: any = {};
    if (environmentId) {
      params.environmentId = environmentId;
    }

    const response = await api.get(
      `/projects/${this.config.projectId}/secrets`,
      { params },
    );
    return response.data;
  }

  /**
   * Deletes a secret from the test server.
   * @private
   */
  private async deleteTestServerSecret(
    key: string,
    environmentId?: string,
  ): Promise<void> {
    const api = await this.getTestServerApi();

    // Find the secret ID
    const response = await api.get(
      `/projects/${this.config.projectId}/secrets`,
    );
    const secret = response.data.find(
      (s: any) =>
        s.key === key &&
        (environmentId ? s.environmentId === environmentId : !s.environmentId),
    );

    if (!secret) {
      throw new Error(`Secret '${key}' not found`);
    }

    await api.delete(`/projects/${this.config.projectId}/secrets/${secret.id}`);
  }

  /**
   * Bulk imports secrets to the test server.
   * @private
   */
  private async bulkImportTestServer(
    secrets: Record<string, string>,
    environmentId?: string,
  ): Promise<any> {
    const api = await this.getTestServerApi();

    const response = await api.post(
      `/projects/${this.config.projectId}/secrets/bulk`,
      {
        secrets,
        environmentId,
      },
    );

    return response.data;
  }

  /**
   * Gets the test server API client.
   * @private
   */
  private async getTestServerApi() {
    const { getApiClient } = await import("../lib/api-client");
    return await getApiClient();
  }
}

/**
 * Determines which secrets backend to use based on environment configuration.
 *
 * Priority order:
 * 1. LocalStack (if LOCALSTACK_ENDPOINT is set)
 * 2. AWS (if AWS credentials are available)
 * 3. Test server (default fallback)
 *
 * @returns {"aws" | "test-server"} The backend to use
 *
 * @example
 * ```typescript
 * const backend = getSecretsBackend();
 * console.log(`Using ${backend} for secrets management`);
 * ```
 */
export function getSecretsBackend(): "aws" | "test-server" {
  // Check if we're running in LocalStack environment
  if (process.env.LOCALSTACK_ENDPOINT) {
    return "aws";
  }

  // Check if AWS credentials are available
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return "aws";
  }

  // Default to test server
  return "test-server";
}

/**
 * Gets AWS SDK configuration for LocalStack or production AWS.
 *
 * @returns {object} AWS configuration object with endpoint, region, and credentials
 *
 * @example
 * ```typescript
 * const config = getLocalStackConfig();
 * const client = new SecretsManagerClient(config);
 * ```
 */
export function getLocalStackConfig() {
  if (process.env.LOCALSTACK_ENDPOINT) {
    return {
      endpoint: process.env.LOCALSTACK_ENDPOINT,
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    };
  }

  return {
    region: process.env.AWS_REGION || "us-east-1",
  };
}
