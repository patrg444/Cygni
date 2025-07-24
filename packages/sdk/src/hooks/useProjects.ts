import { useQuery } from "@tanstack/react-query";
import { ProjectsService } from "../generated";

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId],
    queryFn: async () => {
      return await ProjectsService.getProjects(projectId);
    },
    enabled: !!projectId,
  });
}
