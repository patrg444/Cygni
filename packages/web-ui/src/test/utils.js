"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderWithProviders = renderWithProviders;
exports.render = renderWithProviders;
const react_1 = __importDefault(require("react"));
const react_2 = require("@testing-library/react");
const react_query_1 = require("@tanstack/react-query");
const AuthContext_1 = require("../contexts/AuthContext");
const vitest_1 = require("vitest");
function renderWithProviders(ui, { authValue, queryClient = new react_query_1.QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            cacheTime: 0,
        },
    },
}), ...renderOptions } = {}) {
    const defaultAuthValue = {
        user: null,
        isLoading: false,
        login: vitest_1.vi.fn(),
        logout: vitest_1.vi.fn(),
        refreshSession: vitest_1.vi.fn(),
        ...authValue,
    };
    function Wrapper({ children }) {
        return (<react_query_1.QueryClientProvider client={queryClient}>
        <AuthContext_1.AuthProvider value={defaultAuthValue}>{children}</AuthContext_1.AuthProvider>
      </react_query_1.QueryClientProvider>);
    }
    return {
        ...(0, react_2.render)(ui, { wrapper: Wrapper, ...renderOptions }),
        queryClient,
    };
}
// Re-export everything from Testing Library
__exportStar(require("@testing-library/react"), exports);
//# sourceMappingURL=utils.js.map