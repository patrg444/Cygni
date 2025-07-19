import { CronJob } from 'cron';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

interface JWKSKey {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  n: string;
  e: string;
  createdAt: Date;
  expiresAt: Date;
}

export class JWTRotationService {
  private prisma: PrismaClient;
  private keyHistory: Map<string, { privateKey: string; publicKey: string; expiresAt: Date }> = new Map();
  private readonly KEY_ROTATION_HOURS = 24;
  private readonly KEY_RETENTION_DAYS = 3;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeKeys();
  }

  // Initialize with existing keys or generate new ones
  private async initializeKeys() {
    // Load existing keys from database
    const existingKeys = await this.prisma.jwtKey.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    for (const key of existingKeys) {
      this.keyHistory.set(key.kid, {
        privateKey: key.privateKey,
        publicKey: key.publicKey,
        expiresAt: key.expiresAt,
      });
    }

    // Generate new key if none exist or all expired
    if (this.keyHistory.size === 0) {
      await this.rotateKeys();
    }
  }

  // Rotate JWT signing keys
  async rotateKeys() {
    console.log('Rotating JWT signing keys...');

    // Generate new RSA key pair
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const kid = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.KEY_ROTATION_HOURS + this.KEY_RETENTION_DAYS * 24);

    // Store in database
    await this.prisma.jwtKey.create({
      data: {
        kid,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        algorithm: 'RS256',
        expiresAt,
      },
    });

    // Add to history
    this.keyHistory.set(kid, {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      expiresAt,
    });

    // Clean up old keys
    await this.cleanupExpiredKeys();

    console.log(`New JWT key generated with kid: ${kid}`);
  }

  // Get current signing key
  getCurrentKey(): { kid: string; privateKey: string } {
    // Get the most recent non-expired key
    const now = new Date();
    const validKeys = Array.from(this.keyHistory.entries())
      .filter(([_, key]) => key.expiresAt > now)
      .sort((a, b) => b[1].expiresAt.getTime() - a[1].expiresAt.getTime());

    if (validKeys.length === 0) {
      throw new Error('No valid JWT signing keys available');
    }

    return {
      kid: validKeys[0][0],
      privateKey: validKeys[0][1].privateKey,
    };
  }

  // Sign a JWT token
  signToken(payload: any, options?: jwt.SignOptions): string {
    const { kid, privateKey } = this.getCurrentKey();

    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: kid,
      expiresIn: '24h',
      ...options,
    });
  }

  // Verify a JWT token
  async verifyToken(token: string): Promise<any> {
    // Decode header to get kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const kid = decoded.header.kid;
    if (!kid) {
      throw new Error('Token missing kid header');
    }

    // Get public key for verification
    const key = this.keyHistory.get(kid);
    if (!key) {
      // Try to load from database (in case of restart)
      const dbKey = await this.prisma.jwtKey.findUnique({
        where: { kid },
      });

      if (!dbKey || dbKey.expiresAt < new Date()) {
        throw new Error('Token signed with unknown or expired key');
      }

      // Cache it
      this.keyHistory.set(kid, {
        privateKey: dbKey.privateKey,
        publicKey: dbKey.publicKey,
        expiresAt: dbKey.expiresAt,
      });
    }

    // Verify token
    return jwt.verify(token, key?.publicKey || '', {
      algorithms: ['RS256'],
    });
  }

  // Get JWKS for public key distribution
  async getJWKS(): Promise<{ keys: JWKSKey[] }> {
    const keys: JWKSKey[] = [];
    const now = new Date();

    // Get all non-expired keys
    const validKeys = await this.prisma.jwtKey.findMany({
      where: {
        expiresAt: {
          gt: now,
        },
      },
    });

    for (const key of validKeys) {
      // Convert PEM to JWK format
      const publicKey = crypto.createPublicKey(key.publicKey);
      const jwk = publicKey.export({ format: 'jwk' });

      keys.push({
        kid: key.kid,
        kty: 'RSA',
        use: 'sig',
        alg: key.algorithm,
        n: jwk.n as string,
        e: jwk.e as string,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      });
    }

    return { keys };
  }

  // Clean up expired keys
  private async cleanupExpiredKeys() {
    const now = new Date();
    
    // Remove from memory
    for (const [kid, key] of this.keyHistory.entries()) {
      if (key.expiresAt < now) {
        this.keyHistory.delete(kid);
      }
    }

    // Remove from database
    await this.prisma.jwtKey.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
  }

  // Initialize rotation cron job
  startRotationJob() {
    // Run every 24 hours
    const job = new CronJob(
      '0 0 * * *', // Midnight every day
      async () => {
        try {
          await this.rotateKeys();
        } catch (error) {
          console.error('JWT key rotation failed:', error);
          // Send alert to ops team
        }
      },
      null,
      true,
      'UTC'
    );

    console.log('JWT rotation job scheduled');
    return job;
  }
}

// Express middleware for JWT validation
export function jwtMiddleware(jwtService: JWTRotationService) {
  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const payload = await jwtService.verifyToken(token);
      req.user = payload;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}