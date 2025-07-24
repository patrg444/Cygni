import type { Project } from "../models/Project";
import type { CancelablePromise } from "../core/CancelablePromise";
export declare class ProjectsService {
    /**
     * Get project by ID
     * @param projectId
     * @returns Project Project details
     * @throws ApiError
     */
    static getProjects(projectId: string): CancelablePromise<Project>;
}
//# sourceMappingURL=ProjectsService.d.ts.map