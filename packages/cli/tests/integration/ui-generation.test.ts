import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { OpenAPIResourceAnalyzer } from "../../src/lib/openapi-resource-analyzer";
import { UIGenerator } from "../../src/lib/ui-generator";

describe("UI Generation", () => {
  const testDir = join(__dirname, "../tmp/ui-gen-test");
  const outputDir = join(testDir, "output");

  beforeAll(() => {
    // Create test directories
    mkdirSync(testDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("OpenAPIResourceAnalyzer", () => {
    it("should identify RESTful resources from OpenAPI spec", () => {
      const spec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/posts": {
            get: {
              operationId: "listPosts",
              summary: "List all posts",
              responses: { "200": { description: "Success" } },
            },
            post: {
              operationId: "createPost",
              summary: "Create a new post",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: { "201": { description: "Created" } },
            },
          },
          "/posts/{id}": {
            get: {
              operationId: "getPost",
              summary: "Get a post by ID",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
            put: {
              operationId: "updatePost",
              summary: "Update a post",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
            delete: {
              operationId: "deletePost",
              summary: "Delete a post",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: { "204": { description: "No content" } },
            },
          },
          "/users": {
            get: {
              operationId: "listUsers",
              summary: "List all users",
              responses: { "200": { description: "Success" } },
            },
          },
          "/api/v1/comments": {
            get: {
              operationId: "listComments",
              summary: "List comments",
              responses: { "200": { description: "Success" } },
            },
            post: {
              operationId: "createComment",
              summary: "Create comment",
              responses: { "201": { description: "Created" } },
            },
          },
        },
      };

      const analyzer = new OpenAPIResourceAnalyzer(spec as any);
      const resources = analyzer.analyze();

      expect(resources).toHaveLength(3);

      // Check posts resource
      const posts = resources.find((r) => r.name === "posts");
      expect(posts).toBeDefined();
      expect(posts!.hasList).toBe(true);
      expect(posts!.hasCreate).toBe(true);
      expect(posts!.hasRead).toBe(true);
      expect(posts!.hasUpdate).toBe(true);
      expect(posts!.hasDelete).toBe(true);
      expect(posts!.operations).toHaveLength(5);

      // Check users resource (read-only)
      const users = resources.find((r) => r.name === "users");
      expect(users).toBeDefined();
      expect(users!.hasList).toBe(true);
      expect(users!.hasCreate).toBe(false);
      expect(users!.hasRead).toBe(false);
      expect(users!.hasUpdate).toBe(false);
      expect(users!.hasDelete).toBe(false);

      // Check comments resource (with API prefix)
      const comments = resources.find((r) => r.name === "comments");
      expect(comments).toBeDefined();
      expect(comments!.hasList).toBe(true);
      expect(comments!.hasCreate).toBe(true);
    });
  });

  describe("UIGenerator", () => {
    it("should generate page component for a resource", async () => {
      const generator = new UIGenerator({
        outputDir,
        force: true,
      });

      const resource = {
        name: "posts",
        basePath: "/posts",
        operations: [],
        hasCreate: true,
        hasRead: true,
        hasUpdate: true,
        hasDelete: true,
        hasList: true,
      };

      await generator.generateResource(resource);

      // Check page component
      const pagePath = join(outputDir, "app/posts/page.tsx");
      expect(existsSync(pagePath)).toBe(true);

      const pageContent = readFileSync(pagePath, "utf-8");
      expect(pageContent).toContain("export default function PostsPage()");
      expect(pageContent).toContain("usePostsList()");
      expect(pageContent).toContain("useDeletePost()");
      expect(pageContent).toContain("PostsForm");

      // Check form component
      const formPath = join(outputDir, "components/posts/PostsForm.tsx");
      expect(existsSync(formPath)).toBe(true);

      const formContent = readFileSync(formPath, "utf-8");
      expect(formContent).toContain("export function PostsForm");
      expect(formContent).toContain("useCreatePost()");
      expect(formContent).toContain("useUpdatePost()");

      // Check detail component
      const detailPath = join(outputDir, "components/posts/PostsDetail.tsx");
      expect(existsSync(detailPath)).toBe(true);

      const detailContent = readFileSync(detailPath, "utf-8");
      expect(detailContent).toContain("export function PostsDetail");
      expect(detailContent).toContain("useGetPost(id)");
    });

    it("should generate SDK hooks for multiple resources", async () => {
      const generator = new UIGenerator({
        outputDir,
        force: true,
      });

      const resources = [
        {
          name: "posts",
          basePath: "/posts",
          operations: [],
          hasCreate: true,
          hasRead: true,
          hasUpdate: true,
          hasDelete: true,
          hasList: true,
        },
        {
          name: "users",
          basePath: "/users",
          operations: [],
          hasCreate: false,
          hasRead: true,
          hasUpdate: false,
          hasDelete: false,
          hasList: true,
        },
      ];

      await generator.generateSDKHooks(resources);

      const hooksPath = join(outputDir, "../sdk/src/hooks/generated-hooks.ts");
      expect(existsSync(hooksPath)).toBe(true);

      const hooksContent = readFileSync(hooksPath, "utf-8");

      // Check posts hooks
      expect(hooksContent).toContain("usePostsList");
      expect(hooksContent).toContain("useGetPost");
      expect(hooksContent).toContain("useCreatePost");
      expect(hooksContent).toContain("useUpdatePost");
      expect(hooksContent).toContain("useDeletePost");

      // Check users hooks (limited operations)
      expect(hooksContent).toContain("useUsersList");
      expect(hooksContent).toContain("useGetUser");
      expect(hooksContent).not.toContain("useCreateUser");
      expect(hooksContent).not.toContain("useUpdateUser");
      expect(hooksContent).not.toContain("useDeleteUser");
    });
  });

  describe("End-to-end UI generation", () => {
    it("should generate UI from OpenAPI spec", async () => {
      // Create a sample OpenAPI spec
      const spec = {
        openapi: "3.0.0",
        info: { title: "Blog API", version: "1.0.0" },
        paths: {
          "/articles": {
            get: {
              operationId: "listArticles",
              responses: { "200": { description: "Success" } },
            },
            post: {
              operationId: "createArticle",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                        author: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: { "201": { description: "Created" } },
            },
          },
          "/articles/{id}": {
            get: {
              operationId: "getArticle",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
            patch: {
              operationId: "updateArticle",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      // Save OpenAPI spec
      const specPath = join(testDir, "openapi.json");
      writeFileSync(specPath, JSON.stringify(spec, null, 2));

      // Analyze and generate
      const analyzer = new OpenAPIResourceAnalyzer(spec as any);
      const resources = analyzer.analyze();

      const generator = new UIGenerator({
        outputDir,
        force: true,
      });

      for (const resource of resources) {
        await generator.generateResource(resource);
      }

      // Verify articles components were generated
      expect(existsSync(join(outputDir, "app/articles/page.tsx"))).toBe(true);
      expect(
        existsSync(join(outputDir, "components/articles/ArticlesForm.tsx")),
      ).toBe(true);
      expect(
        existsSync(join(outputDir, "components/articles/ArticlesDetail.tsx")),
      ).toBe(true);
    });
  });
});
