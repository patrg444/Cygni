"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const utils_1 = require("../test/utils");
const LogViewer_1 = require("./LogViewer");
// Mock WebSocket
class MockWebSocket {
    constructor(url) {
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
        this.url = url;
        // Simulate connection after a short delay
        setTimeout(() => {
            (0, utils_1.act)(() => {
                this.readyState = 1;
                if (this.onopen) {
                    this.onopen(new Event("open"));
                }
            });
        }, 10);
    }
    send(data) {
        // Mock send
    }
    close() {
        this.readyState = 3;
        if (this.onclose) {
            this.onclose(new CloseEvent("close"));
        }
    }
}
// Replace global WebSocket with mock
global.WebSocket = MockWebSocket;
(0, vitest_1.describe)("LogViewer", () => {
    let mockWebSocket;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Capture the WebSocket instance when it's created
        const originalWebSocket = global.WebSocket;
        global.WebSocket = class extends MockWebSocket {
            constructor(url) {
                super(url);
                mockWebSocket = this;
            }
        };
    });
    (0, vitest_1.afterEach)(() => {
        if (mockWebSocket) {
            mockWebSocket.close();
        }
    });
    (0, vitest_1.it)("should render the log viewer", () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        (0, vitest_1.expect)(utils_1.screen.getByText("Logs")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByPlaceholderText("Filter logs...")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("All Levels")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should show connected status when WebSocket connects", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        // Initially disconnected
        (0, vitest_1.expect)(utils_1.screen.getByText("Disconnected")).toBeInTheDocument();
        // Wait for WebSocket to connect
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Connected")).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)("should display received log entries", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        // Wait for WebSocket to connect
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockWebSocket).toBeDefined();
        });
        // Simulate receiving a log entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: "info",
            message: "Test log message",
        };
        if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage(new MessageEvent("message", {
                data: JSON.stringify(logEntry),
            }));
        }
        // Check if log entry is displayed
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Test log message")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("INFO")).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)("should filter logs by level", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockWebSocket).toBeDefined();
        });
        // Send logs of different levels
        const logs = [
            {
                timestamp: new Date().toISOString(),
                level: "info",
                message: "Info log",
            },
            {
                timestamp: new Date().toISOString(),
                level: "error",
                message: "Error log",
            },
            {
                timestamp: new Date().toISOString(),
                level: "debug",
                message: "Debug log",
            },
        ];
        logs.forEach((log) => {
            if (mockWebSocket.onmessage) {
                mockWebSocket.onmessage(new MessageEvent("message", {
                    data: JSON.stringify(log),
                }));
            }
        });
        // All logs should be visible initially
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Info log")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Error log")).toBeInTheDocument();
            (0, vitest_1.expect)(utils_1.screen.getByText("Debug log")).toBeInTheDocument();
        });
        // Filter by error level
        const levelSelect = utils_1.screen.getByRole("combobox");
        utils_1.fireEvent.change(levelSelect, { target: { value: "error" } });
        // Only error log should be visible
        (0, vitest_1.expect)(utils_1.screen.queryByText("Info log")).not.toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Error log")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.queryByText("Debug log")).not.toBeInTheDocument();
    });
    (0, vitest_1.it)("should filter logs by text", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockWebSocket).toBeDefined();
        });
        // Send some logs
        const logs = [
            {
                timestamp: new Date().toISOString(),
                level: "info",
                message: "Starting server",
            },
            {
                timestamp: new Date().toISOString(),
                level: "info",
                message: "Database connected",
            },
            {
                timestamp: new Date().toISOString(),
                level: "info",
                message: "Server ready",
            },
        ];
        logs.forEach((log) => {
            if (mockWebSocket.onmessage) {
                mockWebSocket.onmessage(new MessageEvent("message", {
                    data: JSON.stringify(log),
                }));
            }
        });
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Starting server")).toBeInTheDocument();
        });
        // Filter by text
        const filterInput = utils_1.screen.getByPlaceholderText("Filter logs...");
        utils_1.fireEvent.change(filterInput, { target: { value: "database" } });
        // Only matching log should be visible
        (0, vitest_1.expect)(utils_1.screen.queryByText("Starting server")).not.toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Database connected")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.queryByText("Server ready")).not.toBeInTheDocument();
    });
    (0, vitest_1.it)("should pause/resume log updates", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockWebSocket).toBeDefined();
        });
        // Click pause button
        const pauseButton = utils_1.screen.getByTitle("Pause");
        utils_1.fireEvent.click(pauseButton);
        // Send a log while paused
        const log = {
            timestamp: new Date().toISOString(),
            level: "info",
            message: "Log while paused",
        };
        if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage(new MessageEvent("message", {
                data: JSON.stringify(log),
            }));
        }
        // Log should not appear
        (0, vitest_1.expect)(utils_1.screen.queryByText("Log while paused")).not.toBeInTheDocument();
        // Resume
        const resumeButton = utils_1.screen.getByTitle("Resume");
        utils_1.fireEvent.click(resumeButton);
        // Send another log
        const log2 = {
            timestamp: new Date().toISOString(),
            level: "info",
            message: "Log after resume",
        };
        if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage(new MessageEvent("message", {
                data: JSON.stringify(log2),
            }));
        }
        // This log should appear
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Log after resume")).toBeInTheDocument();
        });
    });
    (0, vitest_1.it)("should show log count in footer", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockWebSocket).toBeDefined();
        });
        // Initially no logs
        (0, vitest_1.expect)(utils_1.screen.getByText("Showing 0 of 0 logs")).toBeInTheDocument();
        // Send some logs
        const logs = [
            { timestamp: new Date().toISOString(), level: "info", message: "Log 1" },
            { timestamp: new Date().toISOString(), level: "error", message: "Log 2" },
        ];
        logs.forEach((log) => {
            if (mockWebSocket.onmessage) {
                mockWebSocket.onmessage(new MessageEvent("message", {
                    data: JSON.stringify(log),
                }));
            }
        });
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Showing 2 of 2 logs")).toBeInTheDocument();
        });
        // Filter to show only one
        const levelSelect = utils_1.screen.getByRole("combobox");
        utils_1.fireEvent.change(levelSelect, { target: { value: "error" } });
        (0, vitest_1.expect)(utils_1.screen.getByText("Showing 1 of 2 logs")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should handle WebSocket reconnection", async () => {
        (0, utils_1.render)(<LogViewer_1.LogViewer deploymentId="test-deployment"/>);
        // Wait for initial connection
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Connected")).toBeInTheDocument();
        });
        // Simulate disconnect
        mockWebSocket.close();
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(utils_1.screen.getByText("Disconnected")).toBeInTheDocument();
        });
        // In a real scenario, it would reconnect after 5 seconds
        // We're just testing that it properly shows disconnected state
    });
});
//# sourceMappingURL=LogViewer.test.js.map