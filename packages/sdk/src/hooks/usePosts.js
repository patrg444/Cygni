"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePostsList = usePostsList;
exports.useGetPost = useGetPost;
exports.useCreatePost = useCreatePost;
exports.useUpdatePost = useUpdatePost;
exports.useDeletePost = useDeletePost;
const react_query_1 = require("@tanstack/react-query");
// Mock hooks for generated UI
function usePostsList() {
    return (0, react_query_1.useQuery)({
        queryKey: ["posts"],
        queryFn: async () => {
            // Mock data for now
            return [
                {
                    id: "1",
                    title: "Welcome to CloudExpress",
                    content: "This is a sample post",
                    published: true,
                    createdAt: new Date().toISOString(),
                },
            ];
        },
    });
}
function useGetPost(id) {
    return (0, react_query_1.useQuery)({
        queryKey: ["posts", id],
        queryFn: async () => {
            // Mock data
            return {
                id: id || "1",
                title: "Sample Post",
                content: "This is a sample post content",
                published: true,
                createdAt: new Date().toISOString(),
            };
        },
        enabled: !!id,
    });
}
function useCreatePost() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (data) => {
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
function useUpdatePost() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async ({ id, data }) => {
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
function useDeletePost() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (_id) => {
            // Mock delete
            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}
//# sourceMappingURL=usePosts.js.map