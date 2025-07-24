"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = require("path");
const openapi_resource_analyzer_1 = require("../../src/lib/openapi-resource-analyzer");
const ui_generator_1 = require("../../src/lib/ui-generator");
(0, vitest_1.describe)("UI Generation", () => {
    const testDir = (0, path_1.join)(__dirname, "../tmp/ui-gen-test");
    const outputDir = (0, path_1.join)(testDir, "output");
    (0, vitest_1.beforeAll)(() => {
        // Create test directories
        (0, fs_1.mkdirSync)(testDir, { recursive: true });
        (0, fs_1.mkdirSync)(outputDir, { recursive: true });
    });
    (0, vitest_1.afterAll)(() => {
        // Clean up
        if ((0, fs_1.existsSync)(testDir)) {
            (0, fs_1.rmSync)(testDir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.describe)("OpenAPIResourceAnalyzer", () => {
        (0, vitest_1.it)("should identify RESTful resources from OpenAPI spec", () => {
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
            const analyzer = new openapi_resource_analyzer_1.OpenAPIResourceAnalyzer(spec);
            const resources = analyzer.analyze();
            (0, vitest_1.expect)(resources).toHaveLength(3);
            // Check posts resource
            const posts = resources.find((r) => r.name === "posts");
            (0, vitest_1.expect)(posts).toBeDefined();
            (0, vitest_1.expect)(posts.hasList).toBe(true);
            (0, vitest_1.expect)(posts.hasCreate).toBe(true);
            (0, vitest_1.expect)(posts.hasRead).toBe(true);
            (0, vitest_1.expect)(posts.hasUpdate).toBe(true);
            (0, vitest_1.expect)(posts.hasDelete).toBe(true);
            (0, vitest_1.expect)(posts.operations).toHaveLength(5);
            // Check users resource (read-only)
            const users = resources.find((r) => r.name === "users");
            (0, vitest_1.expect)(users).toBeDefined();
            (0, vitest_1.expect)(users.hasList).toBe(true);
            (0, vitest_1.expect)(users.hasCreate).toBe(false);
            (0, vitest_1.expect)(users.hasRead).toBe(false);
            (0, vitest_1.expect)(users.hasUpdate).toBe(false);
            (0, vitest_1.expect)(users.hasDelete).toBe(false);
            // Check comments resource (with API prefix)
            const comments = resources.find((r) => r.name === "comments");
            (0, vitest_1.expect)(comments).toBeDefined();
            (0, vitest_1.expect)(comments.hasList).toBe(true);
            (0, vitest_1.expect)(comments.hasCreate).toBe(true);
        });
    });
    (0, vitest_1.describe)("UIGenerator", () => {
        (0, vitest_1.it)("should generate page component for a resource", async () => {
            const generator = new ui_generator_1.UIGenerator({
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
            const pagePath = (0, path_1.join)(outputDir, "app/posts/page.tsx");
            (0, vitest_1.expect)((0, fs_1.existsSync)(pagePath)).toBe(true);
            const pageContent = (0, fs_1.readFileSync)(pagePath, "utf-8");
            (0, vitest_1.expect)(pageContent).toContain("export default function PostsPage()");
            (0, vitest_1.expect)(pageContent).toContain("usePostsList()");
            (0, vitest_1.expect)(pageContent).toContain("useDeletePost()");
            (0, vitest_1.expect)(pageContent).toContain("PostsForm");
            // Check form component
            const formPath = (0, path_1.join)(outputDir, "components/posts/PostsForm.tsx");
            (0, vitest_1.expect)((0, fs_1.existsSync)(formPath)).toBe(true);
            const formContent = (0, fs_1.readFileSync)(formPath, "utf-8");
            (0, vitest_1.expect)(formContent).toContain("export function PostsForm");
            (0, vitest_1.expect)(formContent).toContain("useCreatePost()");
            (0, vitest_1.expect)(formContent).toContain("useUpdatePost()");
            // Check detail component
            const detailPath = (0, path_1.join)(outputDir, "components/posts/PostsDetail.tsx");
            (0, vitest_1.expect)((0, fs_1.existsSync)(detailPath)).toBe(true);
            const detailContent = (0, fs_1.readFileSync)(detailPath, "utf-8");
            (0, vitest_1.expect)(detailContent).toContain("export function PostsDetail");
            (0, vitest_1.expect)(detailContent).toContain("useGetPost(id)");
        });
        (0, vitest_1.it)("should generate SDK hooks for multiple resources", async () => {
            const generator = new ui_generator_1.UIGenerator({
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
            const hooksPath = (0, path_1.join)(outputDir, "../sdk/src/hooks/generated-hooks.ts");
            (0, vitest_1.expect)((0, fs_1.existsSync)(hooksPath)).toBe(true);
            const hooksContent = (0, fs_1.readFileSync)(hooksPath, "utf-8");
            // Check posts hooks
            (0, vitest_1.expect)(hooksContent).toContain("usePostsList");
            (0, vitest_1.expect)(hooksContent).toContain("useGetPost");
            (0, vitest_1.expect)(hooksContent).toContain("useCreatePost");
            (0, vitest_1.expect)(hooksContent).toContain("useUpdatePost");
            (0, vitest_1.expect)(hooksContent).toContain("useDeletePost");
            // Check users hooks (limited operations)
            (0, vitest_1.expect)(hooksContent).toContain("useUsersList");
            (0, vitest_1.expect)(hooksContent).toContain("useGetUser");
            (0, vitest_1.expect)(hooksContent).not.toContain("useCreateUser");
            (0, vitest_1.expect)(hooksContent).not.toContain("useUpdateUser");
            (0, vitest_1.expect)(hooksContent).not.toContain("useDeleteUser");
        });
    });
    (0, vitest_1.describe)("End-to-end UI generation", () => {
        (0, vitest_1.it)("should generate UI from OpenAPI spec", async () => {
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
            const specPath = (0, path_1.join)(testDir, "openapi.json");
            (0, fs_1.writeFileSync)(specPath, JSON.stringify(spec, null, 2));
            // Analyze and generate
            const analyzer = new openapi_resource_analyzer_1.OpenAPIResourceAnalyzer(spec);
            const resources = analyzer.analyze();
            const generator = new ui_generator_1.UIGenerator({
                outputDir,
                force: true,
            });
            for (const resource of resources) {
                await generator.generateResource(resource);
            }
            // Verify articles components were generated
            (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(outputDir, "app/articles/page.tsx"))).toBe(true);
            (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(outputDir, "components/articles/ArticlesForm.tsx"))).toBe(true);
            (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(outputDir, "components/articles/ArticlesDetail.tsx"))).toBe(true);
        });
    });
});
//# sourceMappingURL=ui-generation.test.js.map