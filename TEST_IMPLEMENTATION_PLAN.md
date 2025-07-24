# Test Implementation Plan for Cygni

## Overview

This plan outlines the implementation of missing tests for critical user pathways in the Cygni project. The implementation follows a priority-based approach, starting with authentication as the foundation.

## Implementation Order & Rationale

### Phase 1: Authentication Foundation (Week 1)

**Priority: Critical**
**Rationale**: Authentication is the entry point for all user interactions. Establishing solid auth test patterns will benefit all subsequent testing.

1. **CLI Login Command Tests** ✓
   - Email/password authentication
   - API token authentication
   - Error handling
   - Auth data persistence
   - Benefits: Establishes mocking patterns for API calls and file system operations

2. **API Auth Endpoints**
   - `/auth/me` endpoint
   - `/auth/refresh` endpoint
   - Benefits: Completes auth coverage, validates token lifecycle

### Phase 2: Core CLI Commands (Week 2)

**Priority: High**
**Rationale**: CLI is the primary interface. These commands depend on authentication from Phase 1.

3. **CLI Init Command Tests**
   - Project initialization flow
   - Framework detection integration
   - Configuration file creation
   - Benefits: Tests user onboarding experience

4. **CLI Secrets Command Tests**
   - CRUD operations for secrets
   - Encryption/decryption
   - Benefits: Critical for security, establishes patterns for resource management

5. **CLI Status & Logs Commands**
   - Real-time status updates
   - Log streaming
   - Benefits: Completes CLI coverage for monitoring features

### Phase 3: Web UI Foundation (Week 3)

**Priority: Medium**
**Rationale**: UI tests require different tooling setup but are critical for user experience.

6. **Web UI Test Infrastructure**
   - React Testing Library setup
   - Mock service worker for API mocking
   - Component test utilities
   - Benefits: Enables all subsequent UI testing

7. **Core UI Components**
   - LogViewer component
   - DeploymentView component
   - MonitoringDashboard component
   - Benefits: Tests most complex user interactions

### Phase 4: Integration & E2E (Week 4)

**Priority: Medium**
**Rationale**: Validates complete user journeys across all components.

8. **User Journey E2E Tests**
   - Sign up → Deploy → Monitor flow
   - Project creation → Configuration → Deployment
   - Benefits: Catches integration issues between components

## Test Pattern Standards

### CLI Test Pattern

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, mockAxios, mockFileSystem } from "../test-utils";

describe("CLI Command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileSystem.setup();
  });

  afterEach(() => {
    mockFileSystem.cleanup();
  });

  it("should handle success case", async () => {
    // Arrange
    mockAxios.mockResolvedValueOnce({ data: mockResponse });

    // Act
    const result = await command.execute(options);

    // Assert
    expect(result).toMatchObject(expectedResult);
  });

  it("should handle error case", async () => {
    // Test error scenarios
  });
});
```

### API Test Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp, createTestUser } from "../test-utils";

describe("API Endpoint", () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await createTestUser();
    authToken = user.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return expected response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/endpoint",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(expected);
  });
});
```

### UI Test Pattern

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MockedProvider } from "../test-utils";

describe("UI Component", () => {
  it("should render and handle user interaction", async () => {
    render(
      <MockedProvider>
        <Component />
      </MockedProvider>
    );

    expect(screen.getByText("Expected Text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Updated Text")).toBeInTheDocument();
    });
  });
});
```

## Test Coverage Goals

### Immediate (End of Phase 1)

- CLI Authentication: 100%
- API Auth Endpoints: 100%

### Short-term (End of Phase 2)

- CLI Commands: 80%
- API Endpoints: 80%

### Long-term (End of Phase 4)

- Overall Coverage: 80%
- Critical Paths: 100%
- UI Components: 70%

## Success Metrics

1. **Coverage Increase**: From current 25% to 80%
2. **Test Execution Time**: All tests under 5 minutes
3. **Flakiness**: Less than 1% flaky tests
4. **Developer Confidence**: Measured through PR velocity

## Implementation Guidelines

### Do's

- Write tests before fixing bugs
- Use descriptive test names
- Test edge cases and error scenarios
- Keep tests isolated and independent
- Use proper mocking to avoid external dependencies

### Don'ts

- Don't test implementation details
- Don't write brittle tests that break with refactoring
- Don't skip error case testing
- Don't rely on test execution order

## Continuous Improvement

- Weekly test coverage reviews
- Monthly retrospectives on test effectiveness
- Quarterly tooling evaluations
- Ongoing documentation updates
