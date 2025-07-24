import { join, dirname } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { ApiResource } from "./openapi-resource-analyzer";
import * as Handlebars from "handlebars";

/**
 * Options for UI generation.
 * @interface UIGeneratorOptions
 */
export interface UIGeneratorOptions {
  /** Output directory for generated UI components */
  outputDir: string;
  /** Overwrite existing files without prompting */
  force?: boolean;
}

/**
 * Generates React UI components from OpenAPI resource definitions.
 * Creates CRUD pages, forms, and detail views with TypeScript and Tailwind CSS.
 *
 * @example
 * ```typescript
 * const generator = new UIGenerator({
 *   outputDir: './src/app',
 *   force: true
 * });
 *
 * for (const resource of resources) {
 *   await generator.generateResource(resource);
 * }
 * ```
 *
 * @class UIGenerator
 */
export class UIGenerator {
  private outputDir: string;
  private force: boolean;

  /**
   * Creates a new UIGenerator instance.
   * @param {UIGeneratorOptions} options - Generator configuration
   */
  constructor(options: UIGeneratorOptions) {
    this.outputDir = options.outputDir;
    this.force = options.force || false;
    this.registerHelpers();
  }

  /**
   * Registers Handlebars helpers for template rendering.
   * Provides string transformation utilities for naming conventions.
   *
   * @private
   */
  private registerHelpers() {
    // Register Handlebars helpers
    Handlebars.registerHelper("capitalize", (str: string) => {
      if (!str) return "";
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    Handlebars.registerHelper("camelCase", (str: string) => {
      if (!str) return "";
      return str.replace(/-([a-z])/g, (g) => (g[1] ? g[1].toUpperCase() : ""));
    });

    Handlebars.registerHelper("pascalCase", (str: string) => {
      if (!str) return "";
      const camel = str.replace(/-([a-z])/g, (g) =>
        g[1] ? g[1].toUpperCase() : "",
      );
      return camel.charAt(0).toUpperCase() + camel.slice(1);
    });

    Handlebars.registerHelper("pluralize", (str: string) => {
      // Simple pluralization
      if (!str) return "";
      if (str.endsWith("y")) {
        return str.slice(0, -1) + "ies";
      }
      if (str.endsWith("s")) {
        return str + "es";
      }
      return str + "s";
    });

    Handlebars.registerHelper("singularize", (str: string) => {
      // Simple singularization
      if (!str) return "";
      if (str.endsWith("ies")) {
        return str.slice(0, -3) + "y";
      }
      if (str.endsWith("es")) {
        return str.slice(0, -2);
      }
      if (str.endsWith("s")) {
        return str.slice(0, -1);
      }
      return str;
    });
  }

  /**
   * Generates all UI components for a resource.
   * Creates page, form, and detail components based on available operations.
   *
   * @param {ApiResource} resource - The resource to generate UI for
   * @returns {Promise<void>}
   */
  async generateResource(resource: ApiResource): Promise<void> {
    // Generate page component
    await this.generatePageComponent(resource);

    // Generate form component if create/update operations exist
    if (resource.hasCreate || resource.hasUpdate) {
      await this.generateFormComponent(resource);
    }

    // Generate detail component if read operation exists
    if (resource.hasRead) {
      await this.generateDetailComponent(resource);
    }
  }

  /**
   * Generates the main page component for a resource.
   * Includes listing, create button, and actions for edit/delete.
   *
   * @private
   * @param {ApiResource} resource - The resource to generate page for
   * @returns {Promise<void>}
   */
  private async generatePageComponent(resource: ApiResource): Promise<void> {
    const template = `'use client';

import { useState } from 'react';
import { {{pascalCase name}}Form } from '@/components/{{name}}/{{pascalCase name}}Form';
import { use{{pascalCase name}}List, useDelete{{pascalCase (singularize name)}} } from '@cygni/sdk';

export default function {{pascalCase name}}Page() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { data, isLoading, error, refetch } = use{{pascalCase name}}List();
  const deleteMutation = useDelete{{pascalCase (singularize name)}}();

  const handleEdit = (id: string) => {
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteMutation.mutateAsync(id);
        refetch();
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
    refetch();
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">{{capitalize name}}</h1>
          <p className="text-gray-600">Manage your {{name}}</p>
        </div>
        {{#if hasCreate}}
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Create New
        </button>
        {{/if}}
      </div>

      {showForm && (
        <{{pascalCase name}}Form
          id={editingId}
          onClose={handleFormClose}
        />
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.map((item: any) => (
              <tr key={item.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.name || item.title || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(item.createdAt || item.created_at || Date.now()).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  {{#if hasUpdate}}
                  <button
                    onClick={() => handleEdit(item.id)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                  {{/if}}
                  {{#if hasDelete}}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                  {{/if}}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!data || data.length === 0) && (
          <div className="p-6 text-center text-gray-500">
            No {{name}} found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}`;

    const compiled = Handlebars.compile(template);
    const content = compiled(resource);

    const filePath = join(this.outputDir, "app", resource.name, "page.tsx");
    await this.writeFile(filePath, content);
  }

  /**
   * Generates a form component for creating and editing resources.
   * Includes validation and API integration via React Query hooks.
   *
   * @private
   * @param {ApiResource} resource - The resource to generate form for
   * @returns {Promise<void>}
   */
  private async generateFormComponent(resource: ApiResource): Promise<void> {
    const template = `'use client';

import { useState, useEffect } from 'react';
import { useCreate{{pascalCase (singularize name)}}, useUpdate{{pascalCase (singularize name)}}, useGet{{pascalCase (singularize name)}} } from '@cygni/sdk';

interface {{pascalCase name}}FormProps {
  id?: string | null;
  onClose: () => void;
}

export function {{pascalCase name}}Form({ id, onClose }: {{pascalCase name}}FormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const { data: existingData } = useGet{{pascalCase (singularize name)}}(id || '', {
    enabled: !!id,
  });

  const createMutation = useCreate{{pascalCase (singularize name)}}();
  const updateMutation = useUpdate{{pascalCase (singularize name)}}();

  useEffect(() => {
    if (existingData) {
      setFormData({
        name: existingData.name || '',
        description: existingData.description || '',
      });
    }
  }, [existingData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (id) {
        await updateMutation.mutateAsync({ id, data: formData });
      } else {
        await createMutation.mutateAsync(formData);
      }
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">
          {id ? 'Edit' : 'Create'} {{singularize (capitalize name)}}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}`;

    const compiled = Handlebars.compile(template);
    const content = compiled(resource);

    const filePath = join(
      this.outputDir,
      "components",
      resource.name,
      `${this.toPascalCase(resource.name)}Form.tsx`,
    );
    await this.writeFile(filePath, content);
  }

  /**
   * Generates a detail view component for displaying a single resource.
   * Shows all resource fields in a read-only format.
   *
   * @private
   * @param {ApiResource} resource - The resource to generate detail view for
   * @returns {Promise<void>}
   */
  private async generateDetailComponent(resource: ApiResource): Promise<void> {
    const template = `'use client';

import { useGet{{pascalCase (singularize name)}} } from '@cygni/sdk';

interface {{pascalCase name}}DetailProps {
  id: string;
}

export function {{pascalCase name}}Detail({ id }: {{pascalCase name}}DetailProps) {
  const { data, isLoading, error } = useGet{{pascalCase (singularize name)}}(id);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;
  if (!data) return <div>Not found</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">{{singularize (capitalize name)}} Details</h3>
      
      <dl className="space-y-3">
        <div>
          <dt className="text-sm font-medium text-gray-500">ID</dt>
          <dd className="text-sm text-gray-900">{data.id}</dd>
        </div>
        
        <div>
          <dt className="text-sm font-medium text-gray-500">Name</dt>
          <dd className="text-sm text-gray-900">{data.name || 'N/A'}</dd>
        </div>
        
        <div>
          <dt className="text-sm font-medium text-gray-500">Description</dt>
          <dd className="text-sm text-gray-900">{data.description || 'N/A'}</dd>
        </div>
        
        <div>
          <dt className="text-sm font-medium text-gray-500">Created</dt>
          <dd className="text-sm text-gray-900">
            {new Date(data.createdAt || data.created_at || Date.now()).toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>
  );
}`;

    const compiled = Handlebars.compile(template);
    const content = compiled(resource);

    const filePath = join(
      this.outputDir,
      "components",
      resource.name,
      `${this.toPascalCase(resource.name)}Detail.tsx`,
    );
    await this.writeFile(filePath, content);
  }

  async generateSDKHooks(resources: ApiResource[]): Promise<void> {
    const hooksContent = resources
      .map((resource) => this.generateResourceHooks(resource))
      .join("\n\n");

    const template = `// Auto-generated SDK hooks for discovered resources
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import axios from 'axios';

// Get API base URL from environment or default
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

{{content}}

// Re-export all hooks
export {
{{#each resources}}
  // {{pascalCase name}} hooks
  use{{pascalCase name}}List,
  useGet{{pascalCase (singularize name)}},
  {{#if hasCreate}}useCreate{{pascalCase (singularize name)}},{{/if}}
  {{#if hasUpdate}}useUpdate{{pascalCase (singularize name)}},{{/if}}
  {{#if hasDelete}}useDelete{{pascalCase (singularize name)}},{{/if}}
{{/each}}
};`;

    const compiled = Handlebars.compile(template);
    const fullContent = compiled({ resources, content: hooksContent });

    const filePath = join(
      this.outputDir,
      "..",
      "sdk",
      "src",
      "hooks",
      "generated-hooks.ts",
    );
    await this.writeFile(filePath, fullContent);
  }

  private generateResourceHooks(resource: ApiResource): string {
    const hooks: string[] = [];

    // List hook
    if (resource.hasList) {
      hooks.push(`
// ${resource.name} List Hook
export function use${this.toPascalCase(resource.name)}List(
  options?: UseQueryOptions<any[], Error>
) {
  return useQuery({
    queryKey: ['${resource.name}'],
    queryFn: async () => {
      const { data } = await api.get('/${resource.name}');
      return data;
    },
    ...options,
  });
}`);
    }

    // Get single item hook
    if (resource.hasRead) {
      const singular = this.singularize(resource.name);
      hooks.push(`
// Get ${singular} Hook
export function useGet${this.toPascalCase(singular)}(
  id: string,
  options?: UseQueryOptions<any, Error>
) {
  return useQuery({
    queryKey: ['${resource.name}', id],
    queryFn: async () => {
      const { data } = await api.get(\`/${resource.name}/\${id}\`);
      return data;
    },
    enabled: !!id,
    ...options,
  });
}`);
    }

    // Create hook
    if (resource.hasCreate) {
      const singular = this.singularize(resource.name);
      hooks.push(`
// Create ${singular} Hook
export function useCreate${this.toPascalCase(singular)}(
  options?: UseMutationOptions<any, Error, any>
) {
  return useMutation({
    mutationFn: async (data: any) => {
      const { data: result } = await api.post('/${resource.name}', data);
      return result;
    },
    ...options,
  });
}`);
    }

    // Update hook
    if (resource.hasUpdate) {
      const singular = this.singularize(resource.name);
      hooks.push(`
// Update ${singular} Hook
export function useUpdate${this.toPascalCase(singular)}(
  options?: UseMutationOptions<any, Error, { id: string; data: any }>
) {
  return useMutation({
    mutationFn: async ({ id, data }) => {
      const { data: result } = await api.put(\`/${resource.name}/\${id}\`, data);
      return result;
    },
    ...options,
  });
}`);
    }

    // Delete hook
    if (resource.hasDelete) {
      const singular = this.singularize(resource.name);
      hooks.push(`
// Delete ${singular} Hook
export function useDelete${this.toPascalCase(singular)}(
  options?: UseMutationOptions<void, Error, string>
) {
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(\`/${resource.name}/\${id}\`);
    },
    ...options,
  });
}`);
    }

    return hooks.join("\n");
  }

  /**
   * Writes generated content to a file.
   * Creates directories as needed and handles overwrite protection.
   *
   * @private
   * @param {string} filePath - Path where to write the file
   * @param {string} content - File content to write
   * @returns {Promise<void>}
   * @throws {Error} If file exists and force option is not set
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    // Create directory if it doesn't exist
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Check if file exists and force flag
    if (existsSync(filePath) && !this.force) {
      throw new Error(
        `File already exists: ${filePath}. Use --force to overwrite.`,
      );
    }

    // Write file
    writeFileSync(filePath, content, "utf-8");
  }

  private toPascalCase(str: string): string {
    if (!str) return "";
    const camel = str.replace(/-([a-z])/g, (g) =>
      g[1] ? g[1].toUpperCase() : "",
    );
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }

  private singularize(str: string): string {
    if (!str) return "";
    if (str.endsWith("ies")) {
      return str.slice(0, -3) + "y";
    }
    if (str.endsWith("es")) {
      return str.slice(0, -2);
    }
    if (str.endsWith("s")) {
      return str.slice(0, -1);
    }
    return str;
  }
}
