import { OpenAPIV3 } from "openapi-types";

/**
 * Represents a single API operation for a resource.
 * @interface ResourceOperation
 */
export interface ResourceOperation {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** API path for this operation */
  path: string;
  /** Unique operation identifier */
  operationId?: string;
  /** Brief description of the operation */
  summary?: string;
  /** Path and query parameters */
  parameters?: any[];
  /** Request body schema */
  requestBody?: any;
  /** Response definitions */
  responses?: any;
}

/**
 * Represents a RESTful API resource with its CRUD operations.
 * @interface ApiResource
 */
export interface ApiResource {
  /** Resource name (e.g., 'users', 'posts') */
  name: string;
  /** Base API path for this resource */
  basePath: string;
  /** All operations available for this resource */
  operations: ResourceOperation[];
  /** Whether resource supports create (POST) */
  hasCreate: boolean;
  /** Whether resource supports read single item (GET /{id}) */
  hasRead: boolean;
  /** Whether resource supports update (PUT/PATCH) */
  hasUpdate: boolean;
  /** Whether resource supports delete (DELETE) */
  hasDelete: boolean;
  /** Whether resource supports listing (GET /) */
  hasList: boolean;
  /** Schema extracted from request/response bodies */
  schema?: any;
}

/**
 * Analyzes OpenAPI specifications to identify RESTful resources and their operations.
 * Extracts CRUD patterns and generates structured resource definitions.
 *
 * @example
 * ```typescript
 * const analyzer = new OpenAPIResourceAnalyzer(openapiSpec);
 * const resources = analyzer.analyze();
 *
 * resources.forEach(resource => {
 *   console.log(`${resource.name}: ${resource.operations.length} operations`);
 *   if (resource.hasCreate && resource.hasRead && resource.hasUpdate && resource.hasDelete) {
 *     console.log('Full CRUD support');
 *   }
 * });
 * ```
 *
 * @class OpenAPIResourceAnalyzer
 */
export class OpenAPIResourceAnalyzer {
  private spec: OpenAPIV3.Document;
  private resources: Map<string, ApiResource> = new Map();

  /**
   * Creates a new OpenAPIResourceAnalyzer instance.
   * @param {OpenAPIV3.Document} spec - The OpenAPI specification to analyze
   */
  constructor(spec: OpenAPIV3.Document) {
    this.spec = spec;
  }

  /**
   * Analyzes the OpenAPI spec to extract RESTful resources.
   * Identifies CRUD operations and groups them by resource.
   *
   * @returns {ApiResource[]} Array of discovered resources sorted by name
   */
  analyze(): ApiResource[] {
    // Iterate through all paths
    Object.entries(this.spec.paths || {}).forEach(([path, pathItem]) => {
      if (!pathItem || typeof pathItem === "string") return;

      // Extract resource name from path
      const resourceInfo = this.extractResourceFromPath(path);
      if (!resourceInfo) return;

      const { resourceName, isCollection, isItem } = resourceInfo;

      // Get or create resource
      if (!this.resources.has(resourceName)) {
        this.resources.set(resourceName, {
          name: resourceName,
          basePath: `/${resourceName}`,
          operations: [],
          hasCreate: false,
          hasRead: false,
          hasUpdate: false,
          hasDelete: false,
          hasList: false,
        });
      }

      const resource = this.resources.get(resourceName)!;

      // Process each HTTP method
      Object.entries(pathItem).forEach(([method, operation]) => {
        if (!operation || typeof operation !== "object") return;

        // Skip non-operation properties
        const httpMethods = [
          "get",
          "put",
          "post",
          "delete",
          "options",
          "head",
          "patch",
          "trace",
        ];
        if (!httpMethods.includes(method.toLowerCase())) return;

        const op: ResourceOperation = {
          method: method.toUpperCase(),
          path,
          operationId: (operation as any).operationId,
          summary: (operation as any).summary,
          parameters: (operation as any).parameters as any[],
          requestBody: (operation as any).requestBody,
          responses: (operation as any).responses,
        };

        resource.operations.push(op);

        // Determine CRUD capabilities
        if (method === "get" && isCollection) {
          resource.hasList = true;
        } else if (method === "get" && isItem) {
          resource.hasRead = true;
        } else if (method === "post" && isCollection) {
          resource.hasCreate = true;
          // Try to extract schema from request body
          this.extractSchema(resource, (operation as any).requestBody);
        } else if ((method === "put" || method === "patch") && isItem) {
          resource.hasUpdate = true;
          // Try to extract schema from request body
          this.extractSchema(resource, (operation as any).requestBody);
        } else if (method === "delete" && isItem) {
          resource.hasDelete = true;
        }
      });
    });

    // Convert to array and sort by name
    return Array.from(this.resources.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Extracts resource information from an API path.
   * Handles common patterns like /api/v1/users/{id}.
   *
   * @private
   * @param {string} path - The API path to analyze
   * @returns {object | null} Resource info or null if not a resource path
   */
  private extractResourceFromPath(path: string): {
    resourceName: string;
    isCollection: boolean;
    isItem: boolean;
  } | null {
    // Remove leading slash and split
    const segments = path.substring(1).split("/");

    // Skip if no segments
    if (segments.length === 0) return null;

    // Common patterns:
    // /posts - collection
    // /posts/{id} - item
    // /api/v1/posts - collection with prefix
    // /api/v1/posts/{id} - item with prefix

    // Find the resource name (skip common prefixes)
    let resourceIndex = 0;
    const prefixes = ["api", "v1", "v2", "v3"];

    while (
      resourceIndex < segments.length &&
      segments[resourceIndex] &&
      prefixes.includes(segments[resourceIndex]!.toLowerCase())
    ) {
      resourceIndex++;
    }

    if (resourceIndex >= segments.length) return null;

    const resourceName = segments[resourceIndex] || "";
    const nextSegment = segments[resourceIndex + 1];

    // Check if it's a parameter (e.g., {id}, :id, {postId})
    const isItem = nextSegment
      ? nextSegment.startsWith("{") || nextSegment.startsWith(":")
      : false;

    return {
      resourceName: resourceName || "unknown",
      isCollection: !isItem,
      isItem: !!isItem,
    };
  }

  /**
   * Extracts schema information from request body definitions.
   * Used to understand the data model for each resource.
   *
   * @private
   * @param {ApiResource} resource - The resource to update
   * @param {any} requestBody - The request body definition from OpenAPI
   */
  private extractSchema(resource: ApiResource, requestBody: any): void {
    if (!requestBody || !resource.schema) {
      try {
        // Try to extract schema from request body
        const content = requestBody?.content?.["application/json"];
        if (content?.schema) {
          resource.schema = this.resolveSchema(content.schema);
        }
      } catch (error) {
        // Ignore schema extraction errors
      }
    }
  }

  /**
   * Resolves schema references ($ref) to their actual definitions.
   * Follows JSON References to locate schema definitions within the spec.
   *
   * @private
   * @param {any} schema - Schema object that may contain $ref
   * @returns {any} Resolved schema definition
   */
  private resolveSchema(schema: any): any {
    // Handle $ref
    if (schema.$ref) {
      const refPath = schema.$ref.split("/").slice(1);
      let resolved: any = this.spec;

      for (const segment of refPath) {
        resolved = resolved?.[segment];
      }

      return resolved || schema;
    }

    return schema;
  }
}
