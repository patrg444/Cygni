import fs from "fs/promises";
import path from "path";

export interface AuthData {
  token: string;
  email: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

/**
 * Real auth service for testing with configurable home directory
 */
export class AuthService {
  private homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
  }

  private get authFile(): string {
    return path.join(this.homeDir, ".cygni", "auth.json");
  }

  async saveAuth(auth: AuthData): Promise<void> {
    const dir = path.dirname(this.authFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.authFile, JSON.stringify(auth, null, 2), "utf-8");
    await fs.chmod(this.authFile, 0o600);
  }

  async loadAuth(): Promise<AuthData | null> {
    try {
      const data = await fs.readFile(this.authFile, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async clearAuth(): Promise<void> {
    try {
      await fs.unlink(this.authFile);
    } catch {
      // File doesn't exist, that's ok
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.authFile);
      return true;
    } catch {
      return false;
    }
  }

  async getPermissions(): Promise<number | null> {
    try {
      const stats = await fs.stat(this.authFile);
      return stats.mode & parseInt("777", 8);
    } catch {
      return null;
    }
  }
}
