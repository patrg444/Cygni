"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCategoriesList = useCategoriesList;
exports.useGetCategory = useGetCategory;
exports.useCreateCategory = useCreateCategory;
exports.useUpdateCategory = useUpdateCategory;
exports.useDeleteCategory = useDeleteCategory;
const react_query_1 = require("@tanstack/react-query");
// Mock hooks for generated UI
function useCategoriesList() {
    return (0, react_query_1.useQuery)({
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
function useGetCategory(id) {
    return (0, react_query_1.useQuery)({
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
function useCreateCategory() {
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
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });
}
function useUpdateCategory() {
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
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });
}
function useDeleteCategory() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (_id) => {
            // Mock delete
            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });
}
//# sourceMappingURL=useCategories.js.map