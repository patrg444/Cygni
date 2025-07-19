import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
// import path from 'path';
import { createHash } from 'crypto';
import chalk from 'chalk';
import { detectFramework } from '../utils/framework-detector';

const execAsync = promisify(exec);

export interface BuildConfig {
  name: string;
  framework?: string;
  services?: {
    web?: {
      build?: {
        command?: string;
        dockerfile?: string;
      };
      start?: {
        command: string;
        port: number;
      };
    };
  };
}

export interface BuildResult {
  commitSha: string;
  branch: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, string>;
  hasDockerfile: boolean;
  detectedFramework?: string;
}

export async function buildProject(config: BuildConfig): Promise<BuildResult> {
  // Get git info
  const { commitSha, branch } = await getGitInfo();
  
  // Check for Dockerfile
  const dockerfilePath = await findDockerfile();
  const hasDockerfile = !!dockerfilePath;

  let buildArgs: Record<string, string> = {};
  let detectedFramework = config.framework;

  if (!hasDockerfile) {
    // Auto-detect framework if not specified
    if (!detectedFramework) {
      detectedFramework = await detectFramework();
      console.log(chalk.blue(`Detected framework: ${detectedFramework}`));
    }

    // Generate buildpack args based on framework
    buildArgs = getBuildpackArgs(detectedFramework);
  }

  // Run any pre-build commands
  if (config.services?.web?.build?.command) {
    console.log(chalk.gray('Running build command...'));
    await execAsync(config.services.web.build.command);
  }

  return {
    commitSha,
    branch,
    dockerfilePath,
    buildArgs,
    hasDockerfile,
    detectedFramework,
  };
}

async function getGitInfo(): Promise<{ commitSha: string; branch: string }> {
  try {
    const { stdout: commitSha } = await execAsync('git rev-parse HEAD');
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
    
    return {
      commitSha: commitSha.trim(),
      branch: branch.trim(),
    };
  } catch (error) {
    // If not a git repo, generate a pseudo commit SHA
    const timestamp = Date.now().toString();
    const hash = createHash('sha1').update(timestamp).digest('hex');
    
    return {
      commitSha: hash,
      branch: 'main',
    };
  }
}

async function findDockerfile(): Promise<string | null> {
  const dockerfiles = ['Dockerfile', 'dockerfile'];
  
  for (const filename of dockerfiles) {
    try {
      await fs.access(filename);
      return filename;
    } catch {
      // File doesn't exist
    }
  }
  
  return null;
}

function getBuildpackArgs(framework?: string): Record<string, string> {
  const baseArgs = {
    NODE_ENV: 'production',
  };

  switch (framework) {
    case 'nextjs':
      return {
        ...baseArgs,
        NEXT_TELEMETRY_DISABLED: '1',
      };
    case 'react':
      return {
        ...baseArgs,
        GENERATE_SOURCEMAP: 'false',
      };
    case 'django':
      return {
        ...baseArgs,
        DJANGO_SETTINGS_MODULE: 'settings.production',
      };
    default:
      return baseArgs;
  }
}