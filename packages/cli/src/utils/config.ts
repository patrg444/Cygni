import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml } from 'js-yaml';

export interface CygniConfig {
  name: string;
  projectId?: string;
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
      env?: Record<string, string>;
    };
  };
  environments?: Record<string, {
    domain?: string;
    env?: Record<string, string>;
  }>;
}

const CONFIG_FILES = ['cygni.yml', 'cygni.yaml', 'cygni.json'];

export async function loadConfig(dir: string = '.'): Promise<CygniConfig> {
  for (const filename of CONFIG_FILES) {
    const filepath = path.join(dir, filename);
    
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      
      if (filename.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        return parseYaml(content) as CygniConfig;
      }
    } catch (error) {
      // File doesn't exist or parse error, continue
    }
  }

  throw new Error('No cygni configuration file found. Run "cygni init" to create one.');
}

export async function saveConfig(config: CygniConfig, dir: string = '.'): Promise<void> {
  const filepath = path.join(dir, 'cygni.yml');
  const yamlContent = `# Cygni Configuration
name: ${config.name}
${config.projectId ? `projectId: ${config.projectId}` : ''}
${config.framework ? `framework: ${config.framework}` : ''}

services:
  web:
    ${config.services?.web?.build?.command ? `build:
      command: ${config.services.web.build.command}` : ''}
    ${config.services?.web?.start ? `start:
      command: ${config.services.web.start.command}
      port: ${config.services.web.start.port}` : ''}
`;

  await fs.writeFile(filepath, yamlContent, 'utf-8');
}

export async function updateConfig(updates: Partial<CygniConfig>, dir: string = '.'): Promise<void> {
  const config = await loadConfig(dir);
  const updated = { ...config, ...updates };
  await saveConfig(updated, dir);
}