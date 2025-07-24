export interface Post {
    id: string;
    title: string;
    content?: string;
    published?: boolean;
    createdAt?: string;
    updatedAt?: string;
}
export declare function usePostsList(): import("@tanstack/react-query").UseQueryResult<Post[], Error>;
export declare function useGetPost(id: string | null): import("@tanstack/react-query").UseQueryResult<Post, Error>;
export declare function useCreatePost(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    createdAt: string;
    title?: string | undefined;
    content?: string | undefined;
    published?: boolean | undefined;
    updatedAt?: string | undefined;
}, Error, Partial<Post>, unknown>;
export declare function useUpdatePost(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
    updatedAt: string;
    title?: string | undefined;
    content?: string | undefined;
    published?: boolean | undefined;
    createdAt?: string | undefined;
}, Error, {
    id: string;
    data: Partial<Post>;
}, unknown>;
export declare function useDeletePost(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
}, Error, string, unknown>;
//# sourceMappingURL=usePosts.d.ts.map