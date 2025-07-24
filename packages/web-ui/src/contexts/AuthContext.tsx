"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export interface User {
  id: string;
  email: string;
  name?: string;
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// For testing - allow overriding the context value
interface AuthProviderProps {
  children: React.ReactNode;
  value?: AuthContextValue;
}

export function AuthProvider({ children, value }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(true);

  // Fetch current user
  const {
    data: user,
    isLoading: isUserLoading,
    refetch,
  } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      if (!token) return null;

      const response = await axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    retry: false,
    enabled: !value, // Disable if we're in test mode
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      const response = await axios.post("/api/auth/login", { email, password });
      return response.data;
    },
    onSuccess: (data) => {
      localStorage.setItem("authToken", data.token);
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        await axios.post(
          "/api/auth/logout",
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      }
    },
    onSettled: () => {
      localStorage.removeItem("authToken");
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  useEffect(() => {
    setIsInitializing(false);
  }, []);

  const contextValue: AuthContextValue = value || {
    user: user || null,
    isLoading: isInitializing || isUserLoading,
    login: async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    refreshSession: async () => {
      await refetch();
    },
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
