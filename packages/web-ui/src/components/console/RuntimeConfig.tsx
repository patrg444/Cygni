"use client";

import { useState, useEffect } from "react";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
  DownloadIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import yaml from "js-yaml";

interface RuntimeConfigProps {
  initialConfig?: any;
  framework?: string;
}

export function RuntimeConfig({
  initialConfig,
  framework,
}: RuntimeConfigProps) {
  const [config, setConfig] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      try {
        const yamlStr = yaml.dump(initialConfig);
        setConfig(yamlStr);
        setIsValid(true);
      } catch (error) {
        console.error("Failed to serialize config:", error);
      }
    } else {
      // Default runtime.yaml template
      const defaultConfig = {
        runtime:
          framework === "django" || framework === "flask" ? "python" : "node",
        framework: framework || "express",
        endpoints: 0,
        port: getDefaultPort(framework),
        build: getDefaultBuildCommand(framework),
        start: getDefaultStartCommand(framework),
        deploy: {
          strategy: "rolling",
          healthCheck: {
            path: "/health",
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
        env: {
          NODE_ENV: "production",
        },
      };
      setConfig(yaml.dump(defaultConfig));
    }
  }, [initialConfig, framework]);

  const getDefaultPort = (fw?: string) => {
    const ports: Record<string, number> = {
      django: 8000,
      flask: 5000,
      fastapi: 8000,
      rails: 3000,
      angular: 4200,
      gatsby: 9000,
    };
    return ports[fw || ""] || 3000;
  };

  const getDefaultBuildCommand = (fw?: string) => {
    const commands: Record<string, string> = {
      nextjs: "npm run build",
      rails: "bundle exec rake assets:precompile",
      django: "python manage.py collectstatic --noinput",
      angular: "npm run build",
      react: "npm run build",
      vue: "npm run build",
    };
    return commands[fw || ""] || "npm run build";
  };

  const getDefaultStartCommand = (fw?: string) => {
    const commands: Record<string, string> = {
      express: "node index.js",
      fastify: "node index.js",
      nextjs: "npm start",
      django: "gunicorn wsgi:application",
      flask: "gunicorn app:app",
      rails: "bundle exec puma",
    };
    return commands[fw || ""] || "npm start";
  };

  const validateConfig = (value: string) => {
    const newErrors: string[] = [];

    try {
      const parsed = yaml.load(value) as any;

      if (!parsed || typeof parsed !== "object") {
        newErrors.push("Invalid YAML structure");
      } else {
        // Validate required fields
        if (!parsed.runtime) {
          newErrors.push("Missing required field: runtime");
        }
        if (!parsed.framework) {
          newErrors.push("Missing required field: framework");
        }
        if (!parsed.port || typeof parsed.port !== "number") {
          newErrors.push("Port must be a number");
        }
        if (parsed.port && (parsed.port < 1 || parsed.port > 65535)) {
          newErrors.push("Port must be between 1 and 65535");
        }

        // Validate deploy config
        if (parsed.deploy) {
          if (!parsed.deploy.strategy) {
            newErrors.push("Missing deploy.strategy");
          }
          if (parsed.deploy.healthCheck) {
            if (!parsed.deploy.healthCheck.path) {
              newErrors.push("Missing deploy.healthCheck.path");
            }
          }
        }
      }
    } catch (error: any) {
      newErrors.push(`YAML parse error: ${error.message}`);
    }

    setErrors(newErrors);
    setIsValid(newErrors.length === 0);
    return newErrors.length === 0;
  };

  const handleConfigChange = (value: string) => {
    setConfig(value);
    validateConfig(value);
  };

  const handleSave = async () => {
    if (!validateConfig(config)) return;

    setIsSaving(true);
    try {
      // In real app, this would save to backend
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Config saved:", yaml.load(config));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
    setIsSaving(false);
  };

  const handleDownload = () => {
    const blob = new Blob([config], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runtime.yaml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetToDefaults = () => {
    const defaultConfig = {
      runtime:
        framework === "django" || framework === "flask" ? "python" : "node",
      framework: framework || "express",
      endpoints: 0,
      port: getDefaultPort(framework),
      build: getDefaultBuildCommand(framework),
      start: getDefaultStartCommand(framework),
      deploy: {
        strategy: "rolling",
        healthCheck: {
          path: "/health",
          interval: 30,
          timeout: 5,
          retries: 3,
        },
      },
    };
    setConfig(yaml.dump(defaultConfig));
    validateConfig(yaml.dump(defaultConfig));
  };

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div
        className={`p-4 rounded-lg border ${
          isValid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          {isValid ? (
            <>
              <CheckCircledIcon className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800">
                Configuration is valid
              </span>
            </>
          ) : (
            <>
              <CrossCircledIcon className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-800">
                Configuration has errors
              </span>
            </>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="mt-2 space-y-1">
            {errors.map((error, index) => (
              <li
                key={index}
                className="text-sm text-red-600 flex items-start gap-2"
              >
                <span className="block w-1 h-1 bg-red-600 rounded-full mt-1.5 flex-shrink-0"></span>
                {error}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Editor */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-medium">runtime.yaml</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetToDefaults}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ReloadIcon className="w-4 h-4" />
              Reset to defaults
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <DownloadIcon className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={config}
            onChange={(e) => handleConfigChange(e.target.value)}
            className="w-full h-96 p-6 font-mono text-sm bg-gray-50 border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            spellCheck={false}
            placeholder="# runtime.yaml configuration"
          />
          <div className="absolute top-4 right-4">
            <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">
              YAML
            </span>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 rounded-lg p-6 space-y-4">
        <div className="flex items-start gap-3">
          <InfoCircledIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-3 text-sm text-blue-900">
            <p>
              The runtime.yaml file configures how CloudExpress builds and
              deploys your application.
            </p>

            <div>
              <h4 className="font-medium mb-1">Required fields:</h4>
              <ul className="space-y-1 list-disc list-inside text-blue-800">
                <li>
                  <code className="bg-blue-100 px-1 rounded">runtime</code> -
                  The runtime environment (node, python, ruby, etc.)
                </li>
                <li>
                  <code className="bg-blue-100 px-1 rounded">framework</code> -
                  The detected framework
                </li>
                <li>
                  <code className="bg-blue-100 px-1 rounded">port</code> - The
                  port your application listens on
                </li>
                <li>
                  <code className="bg-blue-100 px-1 rounded">start</code> -
                  Command to start your application
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-1">Optional fields:</h4>
              <ul className="space-y-1 list-disc list-inside text-blue-800">
                <li>
                  <code className="bg-blue-100 px-1 rounded">build</code> -
                  Command to build your application
                </li>
                <li>
                  <code className="bg-blue-100 px-1 rounded">env</code> -
                  Environment variables
                </li>
                <li>
                  <code className="bg-blue-100 px-1 rounded">deploy</code> -
                  Deployment configuration
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
