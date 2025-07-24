"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useProject = useProject;
const react_query_1 = require("@tanstack/react-query");
const generated_1 = require("../generated");
function useProject(projectId) {
    return (0, react_query_1.useQuery)({
        queryKey: ["projects", projectId],
        queryFn: async () => {
            return await generated_1.ProjectsService.getProjects(projectId);
        },
        enabled: !!projectId,
    });
}
//# sourceMappingURL=useProjects.js.map