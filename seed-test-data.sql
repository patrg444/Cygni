-- Create test organization
INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt")
VALUES ('test-org-1', 'Test Organization', 'test-org', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create test user
INSERT INTO "User" (id, email, name, password, "createdAt", "updatedAt")
VALUES ('test-user-1', 'test@example.com', 'Test User', '$argon2id$v=19$m=65536,t=3,p=4$M2pvCCQnTa8N0t15XmBdOw$vGWVJ5zgrCuR7CkGgq0hHq5bKMgDv9ZvKNhDvJLnqT0', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Add user to organization
INSERT INTO "OrganizationMember" ("userId", "organizationId", role, "createdAt", "updatedAt")
VALUES ('test-user-1', 'test-org-1', 'owner', NOW(), NOW())
ON CONFLICT ("userId", "organizationId") DO NOTHING;

-- Create test API key
INSERT INTO "ApiKey" (id, key, name, "userId", "createdAt")
VALUES ('test-api-key-1', 'test-api-key', 'Test API Key', 'test-user-1', NOW())
ON CONFLICT (id) DO NOTHING;

-- Create test project
INSERT INTO "Project" (id, name, slug, "organizationId", repository, framework, "createdAt", "updatedAt")
VALUES ('test-project-1', 'Test Project', 'test-project', 'test-org-1', 'https://github.com/test/repo', 'node', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create test environment
INSERT INTO "Environment" (id, name, slug, "projectId", "createdAt", "updatedAt")
VALUES ('test-env-1', 'production', 'production', 'test-project-1', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Budget table does not exist in API schema, skipping

-- Deployment requires a build, so we'll skip for now