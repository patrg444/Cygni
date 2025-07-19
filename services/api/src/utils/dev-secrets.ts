import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

const DEV_SECRETS_PATH = path.join(process.cwd(), ".cygni", "dev.env");

export interface DevSecrets {
  JWT_SECRET: string;
  generatedAt: string;
}

/**
 * Generate secure development secrets
 */
export async function generateDevSecrets(): Promise<DevSecrets> {
  const jwtSecret = crypto.randomBytes(32).toString("hex");

  const secrets: DevSecrets = {
    JWT_SECRET: jwtSecret,
    generatedAt: new Date().toISOString(),
  };

  // Ensure .cygni directory exists
  const cygniDir = path.dirname(DEV_SECRETS_PATH);
  await fs.mkdir(cygniDir, { recursive: true });

  // Write secrets to file
  const content = `# Auto-generated development secrets - DO NOT COMMIT
# Generated at: ${secrets.generatedAt}

JWT_SECRET=${secrets.JWT_SECRET}
`;

  await fs.writeFile(DEV_SECRETS_PATH, content, { mode: 0o600 });

  return secrets;
}

/**
 * Load or generate development secrets
 */
export async function loadOrGenerateDevSecrets(): Promise<DevSecrets> {
  try {
    const content = await fs.readFile(DEV_SECRETS_PATH, "utf-8");
    const jwtMatch = content.match(/JWT_SECRET=(.+)/);

    if (jwtMatch) {
      return {
        JWT_SECRET: jwtMatch[1] || "",
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    // File doesn't exist or is invalid
  }

  // Generate new secrets
  console.log(" Generating new development secrets...");
  return generateDevSecrets();
}

/**
 * Initialize development environment
 */
export async function initializeDevelopmentEnv(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Check if JWT_SECRET is already set
  if (process.env.JWT_SECRET) {
    return;
  }

  try {
    const secrets = await loadOrGenerateDevSecrets();

    // Set environment variables
    process.env.JWT_SECRET = secrets.JWT_SECRET;

    console.log(" Development secrets initialized");
    console.log(" Secrets saved to .cygni/dev.env");
  } catch (error) {
    console.error(" Failed to initialize development secrets:", error);
    throw error;
  }
}
