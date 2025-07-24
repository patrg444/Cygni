"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
/**
 * Real auth service for testing with configurable home directory
 */
class AuthService {
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    get authFile() {
        return path_1.default.join(this.homeDir, ".cygni", "auth.json");
    }
    async saveAuth(auth) {
        const dir = path_1.default.dirname(this.authFile);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(this.authFile, JSON.stringify(auth, null, 2), "utf-8");
        await promises_1.default.chmod(this.authFile, 0o600);
    }
    async loadAuth() {
        try {
            const data = await promises_1.default.readFile(this.authFile, "utf-8");
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    }
    async clearAuth() {
        try {
            await promises_1.default.unlink(this.authFile);
        }
        catch {
            // File doesn't exist, that's ok
        }
    }
    async exists() {
        try {
            await promises_1.default.access(this.authFile);
            return true;
        }
        catch {
            return false;
        }
    }
    async getPermissions() {
        try {
            const stats = await promises_1.default.stat(this.authFile);
            return stats.mode & parseInt("777", 8);
        }
        catch {
            return null;
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth-service.js.map