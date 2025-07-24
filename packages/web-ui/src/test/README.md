# Web UI Component Testing Setup

This directory contains the testing infrastructure for the CloudExpress Web UI components.

## Test Setup

The testing setup uses:

- **Vitest** for test running
- **React Testing Library** for component testing
- **JSDOM** for DOM simulation
- **@testing-library/jest-dom** for additional matchers

## Key Files

### `setup.ts`

- Configures the test environment
- Extends Vitest's expect with Testing Library matchers
- Mocks Next.js router and other browser APIs
- Ensures cleanup after each test

### `utils.tsx`

- Exports a custom `renderWithProviders` function (aliased as `render`)
- Wraps components with required providers:
  - `QueryClientProvider` for React Query
  - `AuthProvider` for authentication context
- Allows overriding auth state and query client for testing

## Usage

### Basic Component Test

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "../test/utils";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("should render correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });
});
```

### Testing with Authentication

```tsx
import { render, screen } from "../test/utils";
import { UserProfile } from "./UserProfile";

it("should show user info when authenticated", () => {
  const mockUser = {
    id: "123",
    email: "test@example.com",
    name: "Test User",
  };

  render(<UserProfile />, {
    authValue: {
      user: mockUser,
      isLoading: false,
    },
  });

  expect(screen.getByText("Test User")).toBeInTheDocument();
});
```

### Testing with React Query

```tsx
import { render, screen, waitFor } from "../test/utils";
import { DataComponent } from "./DataComponent";

it("should fetch and display data", async () => {
  const { queryClient } = render(<DataComponent />);

  // Wait for query to complete
  await waitFor(() => {
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
  });

  // Access query cache if needed
  const queryData = queryClient.getQueryData(["data-key"]);
  expect(queryData).toBeDefined();
});
```

### Mocking API Calls

```tsx
import { vi } from "vitest";
import axios from "axios";

vi.mock("axios");

it("should handle API errors", async () => {
  axios.get.mockRejectedValueOnce(new Error("API Error"));

  render(<MyComponent />);

  await waitFor(() => {
    expect(screen.getByText("Error loading data")).toBeInTheDocument();
  });
});
```

## Best Practices

1. **Use `renderWithProviders`** - Always use the custom render function to ensure components have access to required contexts

2. **Test User Interactions** - Focus on testing what users see and do, not implementation details

3. **Async Testing** - Use `waitFor` for async operations and state updates

4. **Cleanup** - The setup file automatically handles cleanup, but you can manually cleanup if needed

5. **Mock External Dependencies** - Mock browser APIs, network requests, and other external dependencies

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Debugging Tests

1. Use `screen.debug()` to print the current DOM state
2. Use `screen.logTestingPlaygroundURL()` to get a Testing Playground link
3. Add `console.log` statements in your components during testing
4. Use the `--reporter=verbose` flag for more detailed output
