import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";

export interface Post {
  id: string;
  title: string;
  content?: string;
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Get API URL from environment or use default
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Helper function to determine if error should be retried
const shouldRetry = (error: unknown): boolean => {
  if (error instanceof AxiosError) {
    // Retry on 5xx errors or network errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }
  return false;
};

// Exponential backoff delay calculation
const getRetryDelay = (attemptIndex: number): number => {
  // Base delay of 1 second, exponentially increasing: 1s, 2s, 4s
  return Math.min(1000 * Math.pow(2, attemptIndex), 10000);
};

// Mock hooks for generated UI
export function usePostsList() {
  return useQuery<Post[]>({
    queryKey: ["posts"],
    queryFn: async () => {
      try {
        const response = await axios.get(`${API_URL}/posts`);
        return response.data;
      } catch (error) {
        // Fallback to mock data if API is not available
        console.warn("Failed to fetch posts, using mock data:", error);
        return [
          {
            id: "1",
            title: "Welcome to CloudExpress",
            content: "This is a sample post",
            published: true,
            createdAt: new Date().toISOString(),
          },
        ];
      }
    },
    retry: 3, // Retry up to 3 times
    retryDelay: getRetryDelay,
    retryOnMount: true,
  });
}

export function useGetPost(id: string | null) {
  return useQuery<Post>({
    queryKey: ["posts", id],
    queryFn: async () => {
      if (!id) throw new Error("Post ID is required");
      
      try {
        const response = await axios.get(`${API_URL}/posts/${id}`);
        return response.data;
      } catch (error) {
        // Fallback to mock data
        console.warn(`Failed to fetch post ${id}, using mock data:`, error);
        return {
          id: id,
          title: "Sample Post",
          content: "This is a sample post content",
          published: true,
          createdAt: new Date().toISOString(),
        };
      }
    },
    enabled: !!id,
    retry: 3,
    retryDelay: getRetryDelay,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Partial<Post>) => {
      // Mock creation
      return {
        ...data,
        id: Math.random().toString(36),
        createdAt: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Post> }) => {
      // Mock update
      return {
        ...data,
        id,
        updatedAt: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (_id: string) => {
      // Mock delete
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}