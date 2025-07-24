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
exports.JWTRotationService = void 0;
exports.jwtMiddleware = jwtMiddleware;
const cron_1 = require("cron");
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
class JWTRotationService {
    constructor(prisma) {
        this.keyHistory = new Map();
        this.KEY_ROTATION_HOURS = 24;
        this.KEY_RETENTION_DAYS = 3;
        this.prisma = prisma;
        this.initializeKeys();
    }
    // Initialize with existing keys or generate new ones
    async initializeKeys() {
        // Load existing keys from database
        const existingKeys = await this.prisma.jwtKey.findMany({
            where: {
                expiresAt: {
                    gt: new Date(),
                },
            },
            orderBy: {
                createdAt: "desc",
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
        console.log("Rotating JWT signing keys...");
        // Generate new RSA key pair
        const keyPair = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: "spki",
                format: "pem",
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem",
            },
        });
        const kid = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() +
            this.KEY_ROTATION_HOURS +
            this.KEY_RETENTION_DAYS * 24);
        // Store in database
        await this.prisma.jwtKey.create({
            data: {
                kid,
                privateKey: keyPair.privateKey,
                publicKey: keyPair.publicKey,
                algorithm: "RS256",
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
    getCurrentKey() {
        // Get the most recent non-expired key
        const now = new Date();
        const validKeys = Array.from(this.keyHistory.entries())
            .filter(([_, key]) => key.expiresAt > now)
            .sort((a, b) => b[1].expiresAt.getTime() - a[1].expiresAt.getTime());
        if (validKeys.length === 0) {
            throw new Error("No valid JWT signing keys available");
        }
        return {
            kid: validKeys[0][0],
            privateKey: validKeys[0][1].privateKey,
        };
    }
    // Sign a JWT token
    signToken(payload, options) {
        const { kid, privateKey } = this.getCurrentKey();
        return jwt.sign(payload, privateKey, {
            algorithm: "RS256",
            keyid: kid,
            expiresIn: "24h",
            ...options,
        });
    }
    // Verify a JWT token
    async verifyToken(token) {
        // Decode header to get kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded === "string") {
            throw new Error("Invalid token format");
        }
        const kid = decoded.header.kid;
        if (!kid) {
            throw new Error("Token missing kid header");
        }
        // Get public key for verification
        const key = this.keyHistory.get(kid);
        if (!key) {
            // Try to load from database (in case of restart)
            const dbKey = await this.prisma.jwtKey.findUnique({
                where: { kid },
            });
            if (!dbKey || dbKey.expiresAt < new Date()) {
                throw new Error("Token signed with unknown or expired key");
            }
            // Cache it
            this.keyHistory.set(kid, {
                privateKey: dbKey.privateKey,
                publicKey: dbKey.publicKey,
                expiresAt: dbKey.expiresAt,
            });
        }
        // Verify token
        return jwt.verify(token, key?.publicKey || "", {
            algorithms: ["RS256"],
        });
    }
    // Get JWKS for public key distribution
    async getJWKS() {
        const keys = [];
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
            const jwk = publicKey.export({ format: "jwk" });
            keys.push({
                kid: key.kid,
                kty: "RSA",
                use: "sig",
                alg: key.algorithm,
                n: jwk.n,
                e: jwk.e,
                createdAt: key.createdAt,
                expiresAt: key.expiresAt,
            });
        }
        return { keys };
    }
    // Clean up expired keys
    async cleanupExpiredKeys() {
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
        const job = new cron_1.CronJob("0 0 * * *", // Midnight every day
        async () => {
            try {
                await this.rotateKeys();
            }
            catch (error) {
                console.error("JWT key rotation failed:", error);
                // Send alert to ops team
            }
        }, null, true, "UTC");
        console.log("JWT rotation job scheduled");
        return job;
    }
}
exports.JWTRotationService = JWTRotationService;
// Express middleware for JWT validation
function jwtMiddleware(jwtService) {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: "No authorization header" });
        }
        const token = authHeader.replace("Bearer ", "");
        try {
            const payload = await jwtService.verifyToken(token);
            req.user = payload;
            next();
        }
        catch (error) {
            return res.status(401).json({ error: "Invalid token" });
        }
    };
}
//# sourceMappingURL=jwt-rotation.service.js.map