import { CronJob } from "cron";
import * as jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
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
export declare class JWTRotationService {
    private prisma;
    private keyHistory;
    private readonly KEY_ROTATION_HOURS;
    private readonly KEY_RETENTION_DAYS;
    constructor(prisma: PrismaClient);
    private initializeKeys;
    rotateKeys(): Promise<void>;
    getCurrentKey(): {
        kid: string;
        privateKey: string;
    };
    signToken(payload: any, options?: jwt.SignOptions): string;
    verifyToken(token: string): Promise<any>;
    getJWKS(): Promise<{
        keys: JWKSKey[];
    }>;
    private cleanupExpiredKeys;
    startRotationJob(): CronJob;
}
export declare function jwtMiddleware(jwtService: JWTRotationService): (req: any, res: any, next: any) => Promise<any>;
export {};
//# sourceMappingURL=jwt-rotation.service.d.ts.map