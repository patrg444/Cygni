"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CygniProvider = CygniProvider;
const react_1 = require("react");
const react_query_1 = require("@tanstack/react-query");
const config_1 = require("./config");
const defaultQueryClient = new react_query_1.QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            retry: 3,
            refetchOnWindowFocus: false,
        },
    },
});
function CygniProvider({ children, config, queryClient = defaultQueryClient, }) {
    (0, react_1.useEffect)(() => {
        (0, config_1.configureApi)(config);
    }, [config.baseUrl, config.token]);
    return (<react_query_1.QueryClientProvider client={queryClient}>{children}</react_query_1.QueryClientProvider>);
}
//# sourceMappingURL=provider.js.map