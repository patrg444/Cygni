import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

export interface CygniConfig {
  name: string;
  projectId?: string;
  framework?: string;
  services?: {
    [key: string]: any;
  };
  deploy?: {
    strategy?: string;
    healthCheck?: {
      path?: string;
      interval?: number;
      timeout?: number;
      retries?: number;
    };
  };
  [key: string]: any;
}

/**
 * Real config service for testing with configurable directory
 */
export class ConfigService {
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  /**
   * Load config from various file formats
   */
  async loadConfig(): Promise<CygniConfig> {
    const configFiles = ["cygni.yml", "cygni.yaml", "cygni.json"];

    for (const filename of configFiles) {
      const filepath = path.join(this.configDir, filename);

      try {
        const content = await fs.readFile(filepath, "utf-8");

        if (filename.endsWith(".json")) {
          return JSON.parse(content);
        } else {
          const parsed = yaml.load(content) as CygniConfig;
          if (!parsed || typeof parsed !== "object") {
            continue; // Try next file
          }
          return parsed;
        }
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          if (process.env.DEBUG) {
            console.error(`Failed to load ${filename}:`, error.message);
          }
        }
        continue; // Try next file
      }
    }

    throw new Error(
      'No cygni configuration file found. Run "cygni init" to create one.',
    );
  }

  /**
   * Save config as YAML
   */
  async saveConfig(config: CygniConfig): Promise<void> {
    const filepath = path.join(this.configDir, "cygni.yml");
    const content = yaml.dump(config, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    await fs.writeFile(filepath, content, "utf-8");
  }

  /**
   * Update existing config
   */
  async updateConfig(updates: Partial<CygniConfig>): Promise<void> {
    const existing = await this.loadConfig();
    const updated = this.deepMerge(existing, updates);
    await this.saveConfig(updated);
  }

  /**
   * Check if config exists
   */
  async exists(): Promise<boolean> {
    try {
      await this.loadConfig();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get config file path
   */
  async getConfigPath(): Promise<string | null> {
    const configFiles = ["cygni.yml", "cygni.yaml", "cygni.json"];

    for (const filename of configFiles) {
      const filepath = path.join(this.configDir, filename);
      try {
        await fs.access(filepath);
        return filepath;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Create project config with framework defaults
   */
  createProjectConfig(name: string, framework?: string): CygniConfig {
    const config: CygniConfig = {
      name,
      framework,
    };

    if (framework) {
      const defaults = this.getFrameworkDefaults(framework);
      if (Object.keys(defaults).length > 0) {
        config.services = {
          web: defaults,
        };
      } else {
        config.services = { web: {} };
      }
    }

    // Add deployment config
    config.deploy = {
      strategy: "rolling",
      healthCheck: {
        path: "/health",
        interval: 30,
        timeout: 5,
        retries: 3,
      },
    };

    return config;
  }

  /**
   * Get framework-specific defaults
   */
  private getFrameworkDefaults(framework: string): any {
    const defaults: Record<string, any> = {
      nextjs: {
        build: { command: "npm run build" },
        start: { command: "npm start", port: 3000 },
      },
      next: {
        build: { command: "npm run build" },
        start: { command: "npm start", port: 3000 },
      },
      react: {
        build: { command: "npm run build" },
        start: { command: "npx serve -s build", port: 3000 },
      },
      vue: {
        build: { command: "npm run build" },
        start: { command: "npm run preview", port: 4173 },
      },
      express: {
        start: { command: "node index.js", port: 3000 },
      },
      fastify: {
        start: { command: "node server.js", port: 3000 },
      },
      django: {
        start: {
          command: "python manage.py runserver 0.0.0.0:8000",
          port: 8000,
        },
      },
      flask: {
        start: { command: "flask run --host=0.0.0.0", port: 5000 },
      },
      rails: {
        start: { command: "rails server -b 0.0.0.0", port: 3000 },
      },
      node: {
        start: { command: "npm start", port: 3000 },
      },
      python: {
        start: { command: "python app.py", port: 8000 },
      },
    };

    return defaults[framework.toLowerCase()] || {};
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Delete config file
   */
  async deleteConfig(): Promise<void> {
    const configPath = await this.getConfigPath();
    if (configPath) {
      await fs.unlink(configPath);
    }
  }
}
