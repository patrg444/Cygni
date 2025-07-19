import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import semver from "semver";
import { readFileSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  updateCommand: string;
}

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  try {
    // Get current version
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const currentVersion = packageJson.version;

    // Check npm registry for latest version
    const { stdout } = await execAsync("npm view @cygni/cli version", {
      timeout: 5000, // 5 second timeout
    });
    const latestVersion = stdout.trim();

    // Compare versions
    const updateAvailable = semver.gt(latestVersion, currentVersion);

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      updateCommand: "npm install -g @cygni/cli@latest",
    };
  } catch (error) {
    // Silently fail - don't interrupt user's workflow
    return null;
  }
}

export async function displayUpdateNotification() {
  const updateInfo = await checkForUpdate();

  if (!updateInfo || !updateInfo.updateAvailable) {
    return;
  }

  const { currentVersion, latestVersion, updateCommand } = updateInfo;

  console.log(
    chalk.yellow(
      "\n┌─────────────────────────────────────────────────────────┐",
    ),
  );
  console.log(
    chalk.yellow("│") +
      chalk.bold("  Update available! ") +
      chalk.gray(`${currentVersion} → ${latestVersion}`) +
      "                 " +
      chalk.yellow("│"),
  );
  console.log(
    chalk.yellow("│") +
      "                                                         " +
      chalk.yellow("│"),
  );
  console.log(
    chalk.yellow("│") +
      "  Run " +
      chalk.cyan(updateCommand) +
      " to update  " +
      chalk.yellow("│"),
  );
  console.log(
    chalk.yellow(
      "└─────────────────────────────────────────────────────────┘\n",
    ),
  );
}

// Auto-update functionality for CI/CD environments
export async function autoUpdate(): Promise<boolean> {
  if (!process.env.CYGNI_AUTO_UPDATE || process.env.CI) {
    return false;
  }

  const updateInfo = await checkForUpdate();
  if (!updateInfo || !updateInfo.updateAvailable) {
    return false;
  }

  console.log(
    chalk.blue(
      `Updating Cygni CLI from ${updateInfo.currentVersion} to ${updateInfo.latestVersion}...`,
    ),
  );

  try {
    await execAsync(updateInfo.updateCommand);
    console.log(
      chalk.green("✓ Update successful! Please restart your command."),
    );
    return true;
  } catch (error) {
    console.error(chalk.red("Failed to auto-update:"), error);
    return false;
  }
}

// Check for updates once per day
let lastCheckTime: number | null = null;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export async function periodicUpdateCheck() {
  const now = Date.now();

  // Read last check time from config
  try {
    const configPath = join(process.env.HOME || "", ".cygni", "update-check");
    const lastCheck = readFileSync(configPath, "utf-8");
    lastCheckTime = parseInt(lastCheck, 10);
  } catch {
    // First time check
  }

  if (lastCheckTime && now - lastCheckTime < CHECK_INTERVAL) {
    return;
  }

  // Update last check time
  try {
    const { mkdirSync, writeFileSync } = await import("fs");
    const configDir = join(process.env.HOME || "", ".cygni");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "update-check"), now.toString());
  } catch {
    // Ignore errors
  }

  // Display notification in background
  setImmediate(() => {
    displayUpdateNotification().catch(() => {});
  });
}

// Version compatibility check
export async function checkVersionCompatibility(
  apiVersion: string,
): Promise<void> {
  const packageJsonPath = join(__dirname, "../../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const cliVersion = packageJson.version;

  // Extract major versions
  const cliMajor = semver.major(cliVersion);
  const apiMajor = semver.major(apiVersion);

  if (cliMajor !== apiMajor) {
    console.log(
      chalk.yellow(
        `\n⚠️  Version mismatch detected:\n` +
          `   CLI version: ${cliVersion}\n` +
          `   API version: ${apiVersion}\n\n` +
          `   This may cause compatibility issues. Please update your CLI:\n` +
          `   ${chalk.cyan("npm install -g @cygni/cli@latest")}\n`,
      ),
    );
  }
}
