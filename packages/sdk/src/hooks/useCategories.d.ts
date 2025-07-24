export interface Category {
    id: string;
    name: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
}
export declare function useCategoriesList(): import("@tanstack/react-query").UseQueryResult<Category[], Error>;
export declare function useGetCategory(id: string | null): import("@tanstack/react-query").UseQueryResult<Category, Error>;
export declare function useCreateCategory(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    createdAt: string;
    name?: string | undefined;
    description?: string | undefined;
    updatedAt?: string | undefined;
}, Error, Partial<Category>, unknown>;
export declare function useUpdateCategory(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    updatedAt: string;
    name?: string | undefined;
    description?: string | undefined;
    createdAt?: string | undefined;
}, Error, {
    id: string;
    data: Partial<Category>;
}, unknown>;
export declare function useDeleteCategory(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
}, Error, string, unknown>;
//# sourceMappingURL=useCategories.d.ts.map