import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, AuthContextValue } from "../contexts/AuthContext";
import { vi } from "vitest";

// Create a custom render function that includes all providers
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  authValue?: Partial<AuthContextValue>;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    authValue,
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0,
        },
      },
    }),
    ...renderOptions
  }: CustomRenderOptions = {},
) {
  const defaultAuthValue: AuthContextValue = {
    user: null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    ...authValue,
  };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider value={defaultAuthValue}>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything from Testing Library
export * from "@testing-library/react";
export { renderWithProviders as render };
