"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
/**
 * Real config service for testing with configurable directory
 */
class ConfigService {
    constructor(configDir) {
        this.configDir = configDir;
    }
    /**
     * Load config from various file formats
     */
    async loadConfig() {
        const configFiles = ["cygni.yml", "cygni.yaml", "cygni.json"];
        for (const filename of configFiles) {
            const filepath = path_1.default.join(this.configDir, filename);
            try {
                const content = await promises_1.default.readFile(filepath, "utf-8");
                if (filename.endsWith(".json")) {
                    return JSON.parse(content);
                }
                else {
                    const parsed = js_yaml_1.default.load(content);
                    if (!parsed || typeof parsed !== "object") {
                        continue; // Try next file
                    }
                    return parsed;
                }
            }
            catch (error) {
                if (error.code !== "ENOENT") {
                    if (process.env.DEBUG) {
                        console.error(`Failed to load ${filename}:`, error.message);
                    }
                }
                continue; // Try next file
            }
        }
        throw new Error('No cygni configuration file found. Run "cygni init" to create one.');
    }
    /**
     * Save config as YAML
     */
    async saveConfig(config) {
        const filepath = path_1.default.join(this.configDir, "cygni.yml");
        const content = js_yaml_1.default.dump(config, {
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
        });
        await promises_1.default.writeFile(filepath, content, "utf-8");
    }
    /**
     * Update existing config
     */
    async updateConfig(updates) {
        const existing = await this.loadConfig();
        const updated = this.deepMerge(existing, updates);
        await this.saveConfig(updated);
    }
    /**
     * Check if config exists
     */
    async exists() {
        try {
            await this.loadConfig();
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get config file path
     */
    async getConfigPath() {
        const configFiles = ["cygni.yml", "cygni.yaml", "cygni.json"];
        for (const filename of configFiles) {
            const filepath = path_1.default.join(this.configDir, filename);
            try {
                await promises_1.default.access(filepath);
                return filepath;
            }
            catch {
                continue;
            }
        }
        return null;
    }
    /**
     * Create project config with framework defaults
     */
    createProjectConfig(name, framework) {
        const config = {
            name,
            framework,
        };
        if (framework) {
            const defaults = this.getFrameworkDefaults(framework);
            if (Object.keys(defaults).length > 0) {
                config.services = {
                    web: defaults,
                };
            }
            else {
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
    getFrameworkDefaults(framework) {
        const defaults = {
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
    deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                result[key] = this.deepMerge(target[key], source[key]);
            }
            else {
                result[key] = source[key];
            }
        }
        return result;
    }
    /**
     * Delete config file
     */
    async deleteConfig() {
        const configPath = await this.getConfigPath();
        if (configPath) {
            await promises_1.default.unlink(configPath);
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=config-service.js.map