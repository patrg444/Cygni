import { ReactNode, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureApi, ApiConfig } from "./config";

export interface CygniProviderProps {
  children: ReactNode;
  config: ApiConfig;
  queryClient?: QueryClient;
}

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

export function CygniProvider({
  children,
  config,
  queryClient = defaultQueryClient,
}: CygniProviderProps) {
  useEffect(() => {
    configureApi(config);
  }, [config.baseUrl, config.token]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
