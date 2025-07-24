"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Providers = Providers;
const react_query_1 = require("@tanstack/react-query");
const react_query_devtools_1 = require("@tanstack/react-query-devtools");
const sdk_1 = require("@cygni/sdk");
const react_1 = require("react");
// Configure SDK with API URL
if (typeof window !== "undefined") {
    (0, sdk_1.configureApi)({
        baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
    });
}
function Providers({ children }) {
    const [queryClient] = (0, react_1.useState)(() => new react_query_1.QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
                refetchInterval: 30 * 1000,
            },
        },
    }));
    return (<react_query_1.QueryClientProvider client={queryClient}>
      {children}
      <react_query_devtools_1.ReactQueryDevtools initialIsOpen={false}/>
    </react_query_1.QueryClientProvider>);
}
//# sourceMappingURL=providers.js.map