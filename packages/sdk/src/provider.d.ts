import { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { ApiConfig } from "./config";
export interface CygniProviderProps {
    children: ReactNode;
    config: ApiConfig;
    queryClient?: QueryClient;
}
export declare function CygniProvider({ children, config, queryClient, }: CygniProviderProps): import("react").JSX.Element;
//# sourceMappingURL=provider.d.ts.map