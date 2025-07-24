import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import logger from "../../lib/logger";

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
  digest: string;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  tag: string;
  algorithm: string;
  version: string;
}

export class DataEncryptionService {
  private prisma: PrismaClient;
  private masterKey: string;
  private config: EncryptionConfig = {
    algorithm: "aes-256-gcm",
    keyLength: 32,
    ivLength: 16,
    saltLength: 32,
    iterations: 100000,
    digest: "sha256",
  };
  private version = "1.0";

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.masterKey = process.env.ENCRYPTION_KEY || this.generateMasterKey();
    
    if (!process.env.ENCRYPTION_KEY) {
      logger.warn("ENCRYPTION_KEY not set, using generated key (not for production!)");
    }
  }

  // Generate a master key (for development only)
  private generateMasterKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // Derive key from master key
  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.config.iterations,
      this.config.keyLength,
      this.config.digest
    );
  }

  // Encrypt data
  encrypt(plaintext: string, context?: string): EncryptedData {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.config.saltLength);
      const iv = crypto.randomBytes(this.config.ivLength);
      
      // Derive key
      const key = this.deriveKey(salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);
      
      // Add context as additional authenticated data (AAD)
      if (context) {
        cipher.setAAD(Buffer.from(context, "utf8"));
      }
      
      // Encrypt
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      
      // Get auth tag
      const tag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        salt: salt.toString("base64"),
        tag: tag.toString("base64"),
        algorithm: this.config.algorithm,
        version: this.version,
      };
    } catch (error) {
      logger.error("Encryption failed", { error });
      throw new Error("Failed to encrypt data");
    }
  }

  // Decrypt data
  decrypt(encryptedData: EncryptedData, context?: string): string {
    try {
      // Check version compatibility
      if (encryptedData.version !== this.version) {
        logger.warn("Encryption version mismatch", {
          expected: this.version,
          actual: encryptedData.version,
        });
      }
      
      // Decode from base64
      const encrypted = Buffer.from(encryptedData.encrypted, "base64");
      const iv = Buffer.from(encryptedData.iv, "base64");
      const salt = Buffer.from(encryptedData.salt, "base64");
      const tag = Buffer.from(encryptedData.tag, "base64");
      
      // Derive key
      const key = this.deriveKey(salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(encryptedData.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      // Add context as AAD
      if (context) {
        decipher.setAAD(Buffer.from(context, "utf8"));
      }
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      
      return decrypted.toString("utf8");
    } catch (error) {
      logger.error("Decryption failed", { error });
      throw new Error("Failed to decrypt data");
    }
  }

  // Encrypt field (returns string for database storage)
  encryptField(value: string, fieldName: string, recordId?: string): string {
    if (!value) return value;
    
    const context = `${fieldName}:${recordId || "unknown"}`;
    const encrypted = this.encrypt(value, context);
    
    // Store as JSON string
    return JSON.stringify(encrypted);
  }

  // Decrypt field
  decryptField(encryptedValue: string, fieldName: string, recordId?: string): string {
    if (!encryptedValue) return encryptedValue;
    
    try {
      const context = `${fieldName}:${recordId || "unknown"}`;
      const encrypted = JSON.parse(encryptedValue) as EncryptedData;
      return this.decrypt(encrypted, context);
    } catch (error) {
      logger.error("Field decryption failed", { fieldName, error });
      throw new Error("Failed to decrypt field");
    }
  }

  // Hash data (one-way)
  hash(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(this.config.saltLength).toString("hex");
    const hash = crypto
      .pbkdf2Sync(data, actualSalt, this.config.iterations, 64, this.config.digest)
      .toString("hex");
    
    return `${actualSalt}:${hash}`;
  }

  // Verify hash
  verifyHash(data: string, hashedValue: string): boolean {
    const [salt, hash] = hashedValue.split(":");
    const testHash = crypto
      .pbkdf2Sync(data, salt, this.config.iterations, 64, this.config.digest)
      .toString("hex");
    
    return hash === testHash;
  }

  // Generate secure random token
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  // Encrypt PII data with extra protection
  encryptPII(data: any, category: string = "general"): string {
    const plaintext = JSON.stringify(data);
    const encrypted = this.encrypt(plaintext, `pii:${category}`);
    
    // Log PII encryption for compliance
    logger.info("PII data encrypted", {
      category,
      dataSize: plaintext.length,
      timestamp: new Date(),
    });
    
    return JSON.stringify(encrypted);
  }

  // Decrypt PII data
  decryptPII(encryptedData: string, category: string = "general"): any {
    try {
      const encrypted = JSON.parse(encryptedData) as EncryptedData;
      const plaintext = this.decrypt(encrypted, `pii:${category}`);
      
      // Log PII decryption for compliance
      logger.info("PII data decrypted", {
        category,
        timestamp: new Date(),
      });
      
      return JSON.parse(plaintext);
    } catch (error) {
      logger.error("PII decryption failed", { error });
      throw new Error("Failed to decrypt PII data");
    }
  }

  // Encrypt all sensitive fields in a record
  async encryptRecord<T extends Record<string, any>>(
    record: T,
    sensitiveFields: string[],
    recordType: string,
    recordId: string
  ): Promise<T> {
    const encrypted = { ...record };
    
    for (const field of sensitiveFields) {
      if (encrypted[field]) {
        encrypted[field] = this.encryptField(
          encrypted[field],
          `${recordType}.${field}`,
          recordId
        );
      }
    }
    
    return encrypted;
  }

  // Decrypt all sensitive fields in a record
  async decryptRecord<T extends Record<string, any>>(
    record: T,
    sensitiveFields: string[],
    recordType: string,
    recordId: string
  ): Promise<T> {
    const decrypted = { ...record };
    
    for (const field of sensitiveFields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = this.decryptField(
            decrypted[field],
            `${recordType}.${field}`,
            recordId
          );
        } catch (error) {
          logger.error("Failed to decrypt field", { field, recordType, recordId });
          decrypted[field] = null; // Or handle as appropriate
        }
      }
    }
    
    return decrypted;
  }

  // Rotate encryption key
  async rotateEncryptionKey(newKey: string): Promise<{
    rotated: number;
    failed: number;
    errors: string[];
  }> {
    const results = {
      rotated: 0,
      failed: 0,
      errors: [] as string[],
    };

    logger.info("Starting encryption key rotation");

    try {
      // Re-encrypt OAuth tokens
      const oauthAccounts = await this.prisma.oAuthAccount.findMany({
        where: {
          OR: [
            { accessToken: { not: null } },
            { refreshToken: { not: null } },
          ],
        },
      });

      for (const account of oauthAccounts) {
        try {
          const updates: any = {};
          
          if (account.accessToken) {
            const decrypted = this.decryptField(account.accessToken, "accessToken", account.id);
            this.masterKey = newKey; // Use new key
            updates.accessToken = this.encryptField(decrypted, "accessToken", account.id);
          }
          
          if (account.refreshToken) {
            const decrypted = this.decryptField(account.refreshToken, "refreshToken", account.id);
            updates.refreshToken = this.encryptField(decrypted, "refreshToken", account.id);
          }
          
          await this.prisma.oAuthAccount.update({
            where: { id: account.id },
            data: updates,
          });
          
          results.rotated++;
        } catch (error) {
          results.failed++;
          results.errors.push(`OAuth account ${account.id}: ${error}`);
        }
      }

      // Rotate other encrypted data as needed
      
      logger.info("Encryption key rotation completed", results);
    } catch (error) {
      logger.error("Encryption key rotation failed", { error });
      throw error;
    }

    return results;
  }

  // Get encryption metrics
  async getEncryptionMetrics(): Promise<{
    algorithm: string;
    version: string;
    encryptedFields: number;
    lastRotation?: Date;
    keyStrength: string;
  }> {
    // Count encrypted fields
    const encryptedOAuthTokens = await this.prisma.oAuthAccount.count({
      where: {
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
    });

    return {
      algorithm: this.config.algorithm,
      version: this.version,
      encryptedFields: encryptedOAuthTokens * 2, // access + refresh tokens
      keyStrength: `${this.config.keyLength * 8}-bit`,
    };
  }

  // Validate encryption setup
  validateEncryptionSetup(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check master key
    if (!process.env.ENCRYPTION_KEY) {
      issues.push("ENCRYPTION_KEY environment variable not set");
    } else if (process.env.ENCRYPTION_KEY.length < 32) {
      issues.push("ENCRYPTION_KEY is too short (minimum 32 characters)");
    }

    // Check algorithm support
    try {
      crypto.createCipheriv(this.config.algorithm, Buffer.alloc(32), Buffer.alloc(16));
    } catch (error) {
      issues.push(`Encryption algorithm ${this.config.algorithm} not supported`);
    }

    // Check key derivation
    if (this.config.iterations < 10000) {
      issues.push("Key derivation iterations too low (minimum 10000)");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// Singleton instance
let dataEncryptionService: DataEncryptionService;

export function getDataEncryptionService(prisma: PrismaClient): DataEncryptionService {
  if (!dataEncryptionService) {
    dataEncryptionService = new DataEncryptionService(prisma);
  }
  return dataEncryptionService;
}