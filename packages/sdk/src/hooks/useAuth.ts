import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AuthenticationService,
  LoginRequest,
  LoginResponse,
} from "../generated";
import { setAuthToken, clearAuthToken } from "../config";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await AuthenticationService.postAuthLogin(credentials);
      return response;
    },
    onSuccess: (data: LoginResponse) => {
      // Store the token
      if (data.token) {
        setAuthToken(data.token);

        // Store user data in query cache
        queryClient.setQueryData(["auth", "me"], data.user);

        // Store token in localStorage for persistence
        if (typeof window !== "undefined") {
          localStorage.setItem("cygni_token", data.token);
        }
      }
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Clear token
      clearAuthToken();

      // Clear localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("cygni_token");
      }

      return Promise.resolve();
    },
    onSuccess: () => {
      // Clear all queries
      queryClient.clear();
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await AuthenticationService.getAuthMe();
      return response;
    },
    retry: false, // Don't retry auth requests
  });
}

// Hook to check and restore authentication from localStorage
export function useAuthRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (typeof window === "undefined") {
        return null;
      }

      const token = localStorage.getItem("cygni_token");
      if (!token) {
        return null;
      }

      // Set the token
      setAuthToken(token);

      // Try to fetch current user
      try {
        const user = await AuthenticationService.getAuthMe();
        return { token, user };
      } catch (error) {
        // Token is invalid
        clearAuthToken();
        localStorage.removeItem("cygni_token");
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data?.user) {
        queryClient.setQueryData(["auth", "me"], data.user);
      }
    },
  });
}
