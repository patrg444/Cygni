"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const utils_1 = require("@/test/utils");
const page_1 = __importDefault(require("./page"));
// Mock the API response
global.fetch = vitest_1.vi.fn();
(0, vitest_1.describe)("ConsolePage", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should render loading state initially", () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });
        (0, utils_1.render)(<page_1.default />);
        (0, vitest_1.expect)(utils_1.screen.getByText("Analyzing project...")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should render console page with tabs", async () => {
        const mockData = {
            framework: "express",
            endpoints: [
                {
                    method: "GET",
                    path: "/api/users",
                    file: "src/routes/users.js",
                    line: 15,
                },
            ],
        };
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockData,
        });
        (0, utils_1.render)(<page_1.default />);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("CloudExpress Console")).toBeInTheDocument();
        });
        // Check tabs are rendered
        (0, vitest_1.expect)(utils_1.screen.getByText("Overview")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("API Endpoints")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Runtime Config")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Deployment")).toBeInTheDocument();
        // Check action buttons
        (0, vitest_1.expect)(utils_1.screen.getByText("View Logs")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Deploy Now")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should handle API error", async () => {
        fetch.mockResolvedValueOnce({
            ok: false,
            statusText: "Internal Server Error",
        });
        (0, utils_1.render)(<page_1.default />);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Failed to analyze project")).toBeInTheDocument();
        });
        (0, vitest_1.expect)(utils_1.screen.getByText("Retry")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should switch between tabs", async () => {
        const mockData = {
            framework: "express",
            endpoints: [
                {
                    method: "GET",
                    path: "/api/users",
                    file: "src/routes/users.js",
                },
            ],
            runtimeConfig: {
                runtime: "node",
                framework: "express",
                port: 3000,
            },
        };
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockData,
        });
        (0, utils_1.render)(<page_1.default />);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Project Analysis Summary")).toBeInTheDocument();
        });
        // Click on API Endpoints tab
        utils_1.fireEvent.click(utils_1.screen.getByText("API Endpoints"));
        // Should show endpoints list
        (0, vitest_1.expect)(utils_1.screen.getByText("Search endpoints...")).toBeInTheDocument();
        // Click on Runtime Config tab
        utils_1.fireEvent.click(utils_1.screen.getByText("Runtime Config"));
        // Should show runtime config editor
        (0, vitest_1.expect)(utils_1.screen.getByText("runtime.yaml")).toBeInTheDocument();
        // Click on Deployment tab
        utils_1.fireEvent.click(utils_1.screen.getByText("Deployment"));
        // Should show deployment config
        (0, vitest_1.expect)(utils_1.screen.getByText("Target Environment")).toBeInTheDocument();
    });
});
//# sourceMappingURL=page.test.js.map