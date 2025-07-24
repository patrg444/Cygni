import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Mock hooks for generated UI
export function useCategoriesList() {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      // Mock data for now
      return [
        {
          id: "1",
          name: "Technology",
          description: "Tech related posts",
          createdAt: new Date().toISOString(),
        },
      ];
    },
  });
}

export function useGetCategory(id: string | null) {
  return useQuery<Category>({
    queryKey: ["categories", id],
    queryFn: async () => {
      // Mock data
      return {
        id: id || "1",
        name: "Sample Category",
        description: "This is a sample category",
        createdAt: new Date().toISOString(),
      };
    },
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Partial<Category>) => {
      // Mock creation
      return {
        ...data,
        id: Math.random().toString(36),
        createdAt: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Category> }) => {
      // Mock update
      return {
        ...data,
        id,
        updatedAt: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (_id: string) => {
      // Mock delete
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}