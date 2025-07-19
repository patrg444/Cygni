import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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

const AUTH_FILE = path.join(os.homedir(), '.cygni', 'auth.json');

export async function saveAuth(auth: AuthData): Promise<void> {
  const dir = path.dirname(AUTH_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
  // Set restrictive permissions
  await fs.chmod(AUTH_FILE, 0o600);
}

export async function loadAuth(): Promise<AuthData | null> {
  try {
    const data = await fs.readFile(AUTH_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  try {
    await fs.unlink(AUTH_FILE);
  } catch {
    // File doesn't exist, that's ok
  }
}