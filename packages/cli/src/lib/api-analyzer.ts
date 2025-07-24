/**
 * API Endpoint Auto-Detection and Analysis
 * Core feature of CloudExpress - automatically discovers and documents API endpoints
 */

import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

/**
 * Represents a single API endpoint discovered in the codebase.
 * @interface ApiEndpoint
 */
export interface ApiEndpoint {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** The URL path pattern (e.g., /users/:id) */
  path: string;
  /** Name of the handler function */
  handler?: string;
  /** List of middleware applied to this endpoint */
  middleware?: string[];
  /** Endpoint parameters */
  parameters?: {
    /** Path parameters (e.g., :id in /users/:id) */
    path?: string[];
    /** Query parameters expected by the endpoint */
    query?: string[];
    /** Request body schema */
    body?: any;
  };
  /** Whether this endpoint requires authentication */
  authentication?: boolean;
  /** Description extracted from comments or documentation */
  description?: string;
  /** Source file containing this endpoint */
  file: string;
  /** Line number where the endpoint is defined */
  line: number;
}

/**
 * Complete analysis result for API endpoints in a project.
 * @interface ApiAnalysisResult
 */
export interface ApiAnalysisResult {
  /** The detected framework (express, fastify, django, etc.) */
  framework: string;
  /** List of all discovered API endpoints */
  endpoints: ApiEndpoint[];
  /** Base URL or API prefix if detected */
  baseUrl?: string;
  /** Global middleware applied to all endpoints */
  middleware?: string[];
  /** Authentication configuration */
  authentication?: {
    /** Type of authentication (jwt, oauth, basic, etc.) */
    type: string;
    /** Specific strategy or provider */
    strategy?: string;
  };
  /** WebSocket configuration if detected */
  websockets?: {
    /** Whether WebSockets are enabled */
    enabled: boolean;
    /** WebSocket endpoint path */
    path?: string;
  };
  /** GraphQL configuration if detected */
  graphql?: {
    /** Whether GraphQL is enabled */
    enabled: boolean;
    /** GraphQL endpoint path */
    path?: string;
  };
}

/**
 * Analyzes a project to automatically discover and document API endpoints.
 * Supports multiple frameworks including Express, FastAPI, Django, Rails, and more.
 *
 * @example
 * ```typescript
 * const analyzer = new ApiAnalyzer('/path/to/project');
 * const result = await analyzer.analyze();
 *
 * console.log(`Found ${result.endpoints.length} endpoints`);
 * result.endpoints.forEach(endpoint => {
 *   console.log(`${endpoint.method} ${endpoint.path}`);
 * });
 * ```
 *
 * @class ApiAnalyzer
 */
export class ApiAnalyzer {
  private projectDir: string;

  /**
   * Creates a new ApiAnalyzer instance.
   * @param {string} projectDir - The project directory to analyze (defaults to current working directory)
   */
  constructor(projectDir: string = process.cwd()) {
    this.projectDir = projectDir;
  }

  /**
   * Analyzes the project and detects all API endpoints.
   * Automatically detects the framework and uses appropriate parsing strategies.
   *
   * @returns {Promise<ApiAnalysisResult>} Complete analysis of the API
   * @throws {Error} If the project structure cannot be analyzed
   */
  async analyze(): Promise<ApiAnalysisResult> {
    // Detect framework
    const framework = await this.detectFramework();

    // Analyze based on framework
    switch (framework) {
      case "express":
      case "fastify":
        return this.analyzeNodeFramework(framework);
      case "django":
      case "flask":
        return this.analyzePythonFramework(framework);
      case "rails":
        return this.analyzeRailsFramework();
      case "nextjs":
        return this.analyzeNextJsApi();
      default:
        return this.genericAnalysis();
    }
  }

  /**
   * Detects the framework being used in the project.
   * Checks package.json for Node.js frameworks and requirements.txt for Python frameworks.
   *
   * @private
   * @returns {Promise<string>} The detected framework name
   */
  private async detectFramework(): Promise<string> {
    // Check package.json
    const packageJsonPath = path.join(this.projectDir, "package.json");
    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.express) return "express";
      if (deps.fastify) return "fastify";
      if (deps.next) return "nextjs";
      if (deps["@nestjs/core"]) return "nestjs";
    } catch (error) {
      // Package.json not found or not valid JSON
    }

    // Check for Python frameworks
    const requirementsPath = path.join(this.projectDir, "requirements.txt");
    try {
      const content = await fs.readFile(requirementsPath, "utf-8");
      if (content.includes("django")) return "django";
      if (content.includes("flask")) return "flask";
      if (content.includes("fastapi")) return "fastapi";
    } catch {
      // File doesn't exist, continue checking
    }

    // Check for Rails
    const gemfilePath = path.join(this.projectDir, "Gemfile");
    try {
      const content = await fs.readFile(gemfilePath, "utf-8");
      if (content.includes("rails")) return "rails";
    } catch {
      // File doesn't exist, continue checking
    }

    return "unknown";
  }

  /**
   * Analyzes Node.js framework applications (Express/Fastify).
   * Scans all JavaScript/TypeScript files for endpoint definitions.
   *
   * @private
   * @param {string} framework - The Node.js framework being analyzed
   * @returns {Promise<ApiAnalysisResult>} Analysis results with endpoints and metadata
   */
  private async analyzeNodeFramework(
    framework: string,
  ): Promise<ApiAnalysisResult> {
    const endpoints: ApiEndpoint[] = [];
    const result: ApiAnalysisResult = {
      framework,
      endpoints,
    };

    // Find all JS/TS files
    const files = await glob("**/*.{js,ts}", {
      cwd: this.projectDir,
      ignore: ["node_modules/**", "dist/**", "build/**"],
    });

    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );
      const fileEndpoints = await this.parseNodeFile(content, file, framework);
      endpoints.push(...fileEndpoints);
    }

    // Detect middleware and authentication
    result.middleware = await this.detectNodeMiddleware(files);
    result.authentication = await this.detectNodeAuth(files);
    result.websockets = await this.detectWebSockets(files);
    result.graphql = await this.detectGraphQL(files);

    return result;
  }

  /**
   * Parses a Node.js file to extract API endpoint definitions.
   * Uses Babel AST parsing to find route definitions.
   *
   * @private
   * @param {string} content - File content to parse
   * @param {string} filename - Name of the file being parsed
   * @param {string} framework - The framework being used
   * @returns {Promise<ApiEndpoint[]>} List of endpoints found in the file
   */
  private async parseNodeFile(
    content: string,
    filename: string,
    framework: string,
  ): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    const extractMiddleware = this.extractMiddleware.bind(this);

    try {
      const ast = parser.parse(content, {
        sourceType: "module",
        plugins: ["typescript", "decorators-legacy"],
      });

      traverse(ast, {
        CallExpression(path: any) {
          const node = path.node;

          // Express pattern: app.get('/path', handler)
          if (
            framework === "express" &&
            t.isMemberExpression(node.callee) &&
            t.isIdentifier(node.callee.property)
          ) {
            const method = node.callee.property.name;
            const httpMethods = [
              "get",
              "post",
              "put",
              "delete",
              "patch",
              "all",
              "use",
            ];

            if (httpMethods.includes(method) && node.arguments.length >= 2) {
              const pathArg = node.arguments[0];
              if (t.isStringLiteral(pathArg)) {
                endpoints.push({
                  method:
                    method === "all"
                      ? "ALL"
                      : method === "use"
                        ? "USE"
                        : method.toUpperCase(),
                  path: pathArg.value,
                  file: filename,
                  line: node.loc?.start.line || 0,
                  middleware: extractMiddleware(node.arguments.slice(1, -1)),
                });
              }
            }
          }

          // Router pattern: router.get('/path', handler)
          if (
            t.isMemberExpression(node.callee) &&
            t.isIdentifier(node.callee.object) &&
            t.isIdentifier(node.callee.property) &&
            node.callee.object.name.includes("router")
          ) {
            const method = node.callee.property.name;
            const httpMethods = ["get", "post", "put", "delete", "patch"];

            if (httpMethods.includes(method) && node.arguments.length >= 2) {
              const pathArg = node.arguments[0];
              if (t.isStringLiteral(pathArg)) {
                endpoints.push({
                  method: method.toUpperCase(),
                  path: pathArg.value,
                  file: filename,
                  line: node.loc?.start.line || 0,
                  middleware: extractMiddleware(node.arguments.slice(1, -1)),
                });
              }
            }
          }
        },
      });
    } catch (error) {
      console.error(`Error parsing ${filename}:`, error);
    }

    return endpoints;
  }

  /**
   * Extracts middleware function names from route definition arguments.
   *
   * @private
   * @param {any[]} args - AST nodes representing function arguments
   * @returns {string[]} List of middleware function names
   */
  private extractMiddleware(args: any[]): string[] {
    const middleware: string[] = [];

    for (const arg of args) {
      if (t.isIdentifier(arg)) {
        middleware.push(arg.name);
      } else if (t.isMemberExpression(arg) && t.isIdentifier(arg.property)) {
        middleware.push(arg.property.name);
      }
    }

    return middleware;
  }

  /**
   * Detects global middleware used in Node.js applications.
   * Looks for common middleware patterns like app.use() calls.
   *
   * @private
   * @param {string[]} files - List of files to scan
   * @returns {Promise<string[]>} List of detected middleware names
   */
  private async detectNodeMiddleware(files: string[]): Promise<string[]> {
    const middleware: Set<string> = new Set();

    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );

      // Common middleware patterns
      if (content.includes("app.use(cors")) middleware.add("cors");
      if (content.includes("app.use(helmet")) middleware.add("helmet");
      if (content.includes("app.use(compression"))
        middleware.add("compression");
      if (content.includes("app.use(express.json"))
        middleware.add("json-parser");
      if (content.includes("app.use(bodyParser")) middleware.add("body-parser");
      if (content.includes("app.use(cookieParser"))
        middleware.add("cookie-parser");
      if (content.includes("app.use(session")) middleware.add("session");
    }

    return Array.from(middleware);
  }

  /**
   * Detect authentication in Node.js apps
   */
  private async detectNodeAuth(
    files: string[],
  ): Promise<{ type: string; strategy?: string } | undefined> {
    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );

      // Passport.js
      if (content.includes("passport.use")) {
        if (content.includes("JwtStrategy"))
          return { type: "jwt", strategy: "passport" };
        if (content.includes("LocalStrategy"))
          return { type: "local", strategy: "passport" };
        if (content.includes("GoogleStrategy"))
          return { type: "oauth", strategy: "google" };
        return { type: "passport" };
      }

      // JWT
      if (content.includes("jsonwebtoken") || content.includes("jwt.sign")) {
        return { type: "jwt" };
      }

      // Basic auth
      if (content.includes("basic-auth")) {
        return { type: "basic" };
      }
    }

    return undefined;
  }

  /**
   * Detects WebSocket usage in the project.
   * Looks for Socket.IO, native WebSocket, or other WebSocket libraries.
   *
   * @private
   * @param {string[]} files - List of files to scan
   * @returns {Promise<{enabled: boolean; path?: string} | undefined>} WebSocket configuration if found
   */
  private async detectWebSockets(
    files: string[],
  ): Promise<{ enabled: boolean; path?: string } | undefined> {
    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );

      // Socket.IO
      if (content.includes("socket.io") || content.includes("new Server(")) {
        const pathMatch = content.match(/path:\s*['"](\/[^'"]*)['"]/);
        return { enabled: true, path: pathMatch ? pathMatch[1] : "/socket.io" };
      }

      // Raw WebSocket
      if (
        content.includes("new WebSocket.Server") ||
        content.includes("WebSocketServer")
      ) {
        const pathMatch = content.match(/path:\s*['"](\/[^'"]*)['"]/);
        return { enabled: true, path: pathMatch ? pathMatch[1] : "/ws" };
      }
    }

    return undefined;
  }

  /**
   * Detects GraphQL usage in the project.
   * Looks for Apollo Server, GraphQL Yoga, or other GraphQL implementations.
   *
   * @private
   * @param {string[]} files - List of files to scan
   * @returns {Promise<{enabled: boolean; path?: string} | undefined>} GraphQL configuration if found
   */
  private async detectGraphQL(
    files: string[],
  ): Promise<{ enabled: boolean; path?: string } | undefined> {
    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );

      // Apollo Server
      if (
        content.includes("apollo-server") ||
        content.includes("ApolloServer")
      ) {
        const pathMatch = content.match(/path:\s*['"](\/[^'"]*)['"]/);
        return { enabled: true, path: pathMatch ? pathMatch[1] : "/graphql" };
      }

      // GraphQL Yoga, etc.
      if (content.includes("graphql") && content.includes("typeDefs")) {
        return { enabled: true, path: "/graphql" };
      }
    }

    return undefined;
  }

  /**
   * Analyzes Next.js API routes.
   * Supports both App Router (app/api) and Pages Router (pages/api) patterns.
   *
   * @private
   * @returns {Promise<ApiAnalysisResult>} Analysis results for Next.js API routes
   */
  private async analyzeNextJsApi(): Promise<ApiAnalysisResult> {
    const endpoints: ApiEndpoint[] = [];
    const result: ApiAnalysisResult = {
      framework: "nextjs",
      endpoints,
    };

    // Next.js App Router (app/api)
    const appApiFiles = await glob("app/**/route.{js,ts}", {
      cwd: this.projectDir,
    });

    for (const file of appApiFiles) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );
      const pathSegments = file.split("/").slice(1, -1); // Remove 'app' and 'route.ts'
      const apiPath = "/" + pathSegments.join("/");

      // Detect exported methods
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
      for (const method of methods) {
        if (
          content.includes(`export async function ${method}`) ||
          content.includes(`export function ${method}`) ||
          content.includes(`export const ${method}`)
        ) {
          endpoints.push({
            method,
            path: apiPath,
            file,
            line: 0,
          });
        }
      }
    }

    // Next.js Pages Router (pages/api)
    const pagesApiFiles = await glob("pages/api/**/*.{js,ts}", {
      cwd: this.projectDir,
    });

    for (const file of pagesApiFiles) {
      const pathSegments = file
        .replace(/\.(js|ts)$/, "")
        .split("/")
        .slice(2); // Remove 'pages/api'
      const apiPath = "/api/" + pathSegments.join("/");

      endpoints.push({
        method: "ALL",
        path: apiPath,
        file,
        line: 0,
      });
    }

    return result;
  }

  /**
   * Analyzes Python framework applications (Django/Flask).
   * Parses Python files to extract route definitions.
   *
   * @private
   * @param {string} framework - The Python framework being analyzed
   * @returns {Promise<ApiAnalysisResult>} Analysis results with endpoints
   */
  private async analyzePythonFramework(
    framework: string,
  ): Promise<ApiAnalysisResult> {
    const endpoints: ApiEndpoint[] = [];
    const result: ApiAnalysisResult = {
      framework,
      endpoints,
    };

    if (framework === "flask") {
      const pyFiles = await glob("**/*.py", {
        cwd: this.projectDir,
        ignore: ["venv/**", "__pycache__/**"],
      });

      for (const file of pyFiles) {
        const content = await fs.readFile(
          path.join(this.projectDir, file),
          "utf-8",
        );
        const fileEndpoints = this.parseFlaskFile(content, file);
        endpoints.push(...fileEndpoints);
      }
    } else if (framework === "django") {
      // Parse Django URLs
      const urlsFiles = await glob("**/urls.py", {
        cwd: this.projectDir,
        ignore: ["venv/**", "__pycache__/**"],
      });

      for (const file of urlsFiles) {
        const content = await fs.readFile(
          path.join(this.projectDir, file),
          "utf-8",
        );
        const fileEndpoints = this.parseDjangoUrls(content, file);
        endpoints.push(...fileEndpoints);
      }
    }

    return result;
  }

  /**
   * Parses Flask route definitions from Python files.
   * Looks for @app.route decorators and extracts HTTP methods and paths.
   *
   * @private
   * @param {string} content - Python file content
   * @param {string} filename - Name of the file being parsed
   * @returns {ApiEndpoint[]} List of Flask endpoints found
   */
  private parseFlaskFile(content: string, filename: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const lines = content.split("\n");

    const routeRegex =
      /@app\.route\(['"]([^'"]+)['"](?:,\s*methods=\[([^\]]+)\])?\)/;

    lines.forEach((line, index) => {
      const match = line.match(routeRegex);
      if (match) {
        const path = match[1];
        const methodsStr = match[2];
        const methods = methodsStr
          ? methodsStr.split(",").map((m) => m.trim().replace(/['"]/g, ""))
          : ["GET"];

        methods.forEach((method) => {
          endpoints.push({
            method,
            path: path || "/",
            file: filename,
            line: index + 1,
          });
        });
      }
    });

    return endpoints;
  }

  /**
   * Parses Django URL patterns from urls.py files.
   * Extracts path patterns and view mappings.
   *
   * @private
   * @param {string} content - Django urls.py file content
   * @param {string} filename - Name of the file being parsed
   * @returns {ApiEndpoint[]} List of Django endpoints found
   */
  private parseDjangoUrls(content: string, filename: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const lines = content.split("\n");

    const pathRegex = /path\(['"]([^'"]+)['"]/;
    const rePathRegex = /re_path\(r['"]\^([^$]+)\$/;

    lines.forEach((line, index) => {
      let match = line.match(pathRegex);
      if (!match) {
        match = line.match(rePathRegex);
      }

      if (match && match[1]) {
        let path = match[1];
        // Ensure path starts with /
        if (!path.startsWith("/")) {
          path = "/" + path;
        }
        // Remove trailing slash unless it's the root path
        if (path !== "/" && path.endsWith("/")) {
          path = path.slice(0, -1);
        }
        endpoints.push({
          method: "ALL",
          path: path,
          file: filename,
          line: index + 1,
        });
      }
    });

    return endpoints;
  }

  /**
   * Analyzes Ruby on Rails applications.
   * Parses routes.rb and controller files to extract API endpoints.
   *
   * @private
   * @returns {Promise<ApiAnalysisResult>} Analysis results for Rails application
   */
  private async analyzeRailsFramework(): Promise<ApiAnalysisResult> {
    const endpoints: ApiEndpoint[] = [];
    const result: ApiAnalysisResult = {
      framework: "rails",
      endpoints,
    };

    try {
      const routesFile = path.join(this.projectDir, "config", "routes.rb");
      const content = await fs.readFile(routesFile, "utf-8");
      const lines = content.split("\n");

      const resourceRegex = /resources?\s+:(\w+)/;
      const routeRegex = /(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/;

      lines.forEach((line, index) => {
        // Resources create multiple endpoints
        const resourceMatch = line.match(resourceRegex);
        if (resourceMatch) {
          const resource = resourceMatch[1];
          const resourceEndpoints = [
            { method: "GET", path: `/${resource}` },
            { method: "GET", path: `/${resource}/:id` },
            { method: "POST", path: `/${resource}` },
            { method: "PUT", path: `/${resource}/:id` },
            { method: "PATCH", path: `/${resource}/:id` },
            { method: "DELETE", path: `/${resource}/:id` },
          ];

          resourceEndpoints.forEach((ep) => {
            endpoints.push({
              ...ep,
              file: "config/routes.rb",
              line: index + 1,
            });
          });
        }

        // Individual routes
        const routeMatch = line.match(routeRegex);
        if (routeMatch && routeMatch[1] && routeMatch[2]) {
          endpoints.push({
            method: routeMatch[1].toUpperCase(),
            path: routeMatch[2],
            file: "config/routes.rb",
            line: index + 1,
          });
        }
      });
    } catch (error) {
      console.error("Error parsing Rails routes:", error);
    }

    return result;
  }

  /**
   * Performs generic analysis for unknown or unsupported frameworks.
   * Attempts to find common API patterns in various file types.
   *
   * @private
   * @returns {Promise<ApiAnalysisResult>} Basic analysis results
   */
  private async genericAnalysis(): Promise<ApiAnalysisResult> {
    const endpoints: ApiEndpoint[] = [];

    // Look for common patterns
    const files = await glob("**/*.{js,ts,py,rb,java,go}", {
      cwd: this.projectDir,
      ignore: ["node_modules/**", "vendor/**", "venv/**"],
    });

    for (const file of files) {
      const content = await fs.readFile(
        path.join(this.projectDir, file),
        "utf-8",
      );
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Look for HTTP method patterns
        const patterns = [
          /(@Get|@Post|@Put|@Delete|@Patch)\(['"]([^'"]+)['"]\)/, // Decorators
          /(GET|POST|PUT|DELETE|PATCH)\s+['"]([^'"]+)['"]/, // String patterns
          /\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/, // Method calls
        ];

        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match && match[1] && match[2]) {
            endpoints.push({
              method: match[1].toUpperCase().replace("@", ""),
              path: match[2],
              file,
              line: index + 1,
            });
            break;
          }
        }
      });
    }

    return {
      framework: "unknown",
      endpoints,
    };
  }

  /**
   * Generate OpenAPI/Swagger specification from analysis
   */
  /**
   * Generates an OpenAPI 3.0 specification from the analysis results.
   * Creates a complete API documentation including paths, methods, and parameters.
   *
   * @param {ApiAnalysisResult} analysis - The analysis results to convert
   * @returns {Promise<any>} OpenAPI 3.0 specification object
   *
   * @example
   * ```typescript
   * const analysis = await analyzer.analyze();
   * const spec = await analyzer.generateOpenApiSpec(analysis);
   *
   * // Write to file
   * fs.writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
   * ```
   */
  async generateOpenApiSpec(analysis: ApiAnalysisResult): Promise<any> {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "Auto-generated API Documentation",
        version: "1.0.0",
        description: `Automatically detected ${analysis.endpoints.length} endpoints in ${analysis.framework} application`,
      },
      servers: [
        {
          url: analysis.baseUrl || "http://localhost:3000",
          description: "Development server",
        },
      ],
      paths: {} as any,
      components: {
        securitySchemes: {} as any,
      },
    };

    // Add security schemes
    if (analysis.authentication) {
      if (analysis.authentication.type === "jwt") {
        spec.components.securitySchemes.bearerAuth = {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        };
      } else if (analysis.authentication.type === "basic") {
        spec.components.securitySchemes.basicAuth = {
          type: "http",
          scheme: "basic",
        };
      }
    }

    // Group endpoints by path
    const pathGroups = new Map<string, ApiEndpoint[]>();
    for (const endpoint of analysis.endpoints) {
      const existing = pathGroups.get(endpoint.path) || [];
      existing.push(endpoint);
      pathGroups.set(endpoint.path, existing);
    }

    // Build paths
    for (const [path, endpoints] of pathGroups) {
      spec.paths[path] = {};

      for (const endpoint of endpoints) {
        const method = endpoint.method.toLowerCase();
        if (method === "all") continue;

        spec.paths[path][method] = {
          summary: `${endpoint.method} ${path}`,
          description:
            endpoint.description ||
            `Auto-detected from ${endpoint.file}:${endpoint.line}`,
          responses: {
            "200": {
              description: "Successful response",
            },
          },
        };

        // Add authentication if detected
        if (endpoint.authentication || analysis.authentication) {
          spec.paths[path][method].security = [{ bearerAuth: [] }];
        }

        // Add parameters
        if (endpoint.parameters) {
          spec.paths[path][method].parameters = [];

          // Path parameters
          const pathParams = path.match(/:(\w+)/g);
          if (pathParams) {
            pathParams.forEach((param) => {
              spec.paths[path][method].parameters.push({
                name: param.substring(1),
                in: "path",
                required: true,
                schema: { type: "string" },
              });
            });
          }
        }
      }
    }

    return spec;
  }

  /**
   * Generate CloudExpress deployment configuration
   */
  generateCloudExpressConfig(analysis: ApiAnalysisResult): any {
    const config: any = {
      name: path.basename(this.projectDir),
      framework: analysis.framework,
      services: {
        api: {
          endpoints: analysis.endpoints.map((ep) => ({
            method: ep.method,
            path: ep.path,
            authentication: ep.authentication,
            middleware: ep.middleware,
          })),
          middleware: analysis.middleware,
          authentication: analysis.authentication,
        },
      },
    };

    // Add WebSocket config if detected
    if (analysis.websockets?.enabled) {
      config.services.websocket = {
        enabled: true,
        path: analysis.websockets.path || "/ws",
      };
    }

    // Add GraphQL config if detected
    if (analysis.graphql?.enabled) {
      config.services.graphql = {
        enabled: true,
        path: analysis.graphql.path || "/graphql",
      };
    }

    return config;
  }
}
