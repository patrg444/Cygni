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
export declare class ConfigService {
    private configDir;
    constructor(configDir: string);
    /**
     * Load config from various file formats
     */
    loadConfig(): Promise<CygniConfig>;
    /**
     * Save config as YAML
     */
    saveConfig(config: CygniConfig): Promise<void>;
    /**
     * Update existing config
     */
    updateConfig(updates: Partial<CygniConfig>): Promise<void>;
    /**
     * Check if config exists
     */
    exists(): Promise<boolean>;
    /**
     * Get config file path
     */
    getConfigPath(): Promise<string | null>;
    /**
     * Create project config with framework defaults
     */
    createProjectConfig(name: string, framework?: string): CygniConfig;
    /**
     * Get framework-specific defaults
     */
    private getFrameworkDefaults;
    /**
     * Deep merge objects
     */
    private deepMerge;
    /**
     * Delete config file
     */
    deleteConfig(): Promise<void>;
}
//# sourceMappingURL=config-service.d.ts.map