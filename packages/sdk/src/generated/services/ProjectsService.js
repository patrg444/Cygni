"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const OpenAPI_1 = require("../core/OpenAPI");
const request_1 = require("../core/request");
class ProjectsService {
    /**
     * Get project by ID
     * @param projectId
     * @returns Project Project details
     * @throws ApiError
     */
    static getProjects(projectId) {
        return (0, request_1.request)(OpenAPI_1.OpenAPI, {
            method: "GET",
            url: "/projects/{projectId}",
            path: {
                projectId: projectId,
            },
        });
    }
}
exports.ProjectsService = ProjectsService;
//# sourceMappingURL=ProjectsService.js.map