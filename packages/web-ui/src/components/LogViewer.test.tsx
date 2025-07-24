import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "../test/utils";
import { LogViewer } from "./LogViewer";

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection after a short delay
    setTimeout(() => {
      act(() => {
        this.readyState = 1;
        if (this.onopen) {
          this.onopen(new Event("open"));
        }
      });
    }, 10);
  }

  send(data: string) {
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
global.WebSocket = MockWebSocket as any;

describe("LogViewer", () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    // Capture the WebSocket instance when it's created
    const originalWebSocket = global.WebSocket;
    global.WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWebSocket = this;
      }
    } as any;
  });

  afterEach(() => {
    if (mockWebSocket) {
      mockWebSocket.close();
    }
  });

  it("should render the log viewer", () => {
    render(<LogViewer deploymentId="test-deployment" />);

    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter logs...")).toBeInTheDocument();
    expect(screen.getByText("All Levels")).toBeInTheDocument();
  });

  it("should show connected status when WebSocket connects", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    // Initially disconnected
    expect(screen.getByText("Disconnected")).toBeInTheDocument();

    // Wait for WebSocket to connect
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("should display received log entries", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    // Wait for WebSocket to connect
    await waitFor(() => {
      expect(mockWebSocket).toBeDefined();
    });

    // Simulate receiving a log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Test log message",
    };

    if (mockWebSocket.onmessage) {
      mockWebSocket.onmessage(
        new MessageEvent("message", {
          data: JSON.stringify(logEntry),
        }),
      );
    }

    // Check if log entry is displayed
    await waitFor(() => {
      expect(screen.getByText("Test log message")).toBeInTheDocument();
      expect(screen.getByText("INFO")).toBeInTheDocument();
    });
  });

  it("should filter logs by level", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    await waitFor(() => {
      expect(mockWebSocket).toBeDefined();
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
        mockWebSocket.onmessage(
          new MessageEvent("message", {
            data: JSON.stringify(log),
          }),
        );
      }
    });

    // All logs should be visible initially
    await waitFor(() => {
      expect(screen.getByText("Info log")).toBeInTheDocument();
      expect(screen.getByText("Error log")).toBeInTheDocument();
      expect(screen.getByText("Debug log")).toBeInTheDocument();
    });

    // Filter by error level
    const levelSelect = screen.getByRole("combobox");
    fireEvent.change(levelSelect, { target: { value: "error" } });

    // Only error log should be visible
    expect(screen.queryByText("Info log")).not.toBeInTheDocument();
    expect(screen.getByText("Error log")).toBeInTheDocument();
    expect(screen.queryByText("Debug log")).not.toBeInTheDocument();
  });

  it("should filter logs by text", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    await waitFor(() => {
      expect(mockWebSocket).toBeDefined();
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
        mockWebSocket.onmessage(
          new MessageEvent("message", {
            data: JSON.stringify(log),
          }),
        );
      }
    });

    await waitFor(() => {
      expect(screen.getByText("Starting server")).toBeInTheDocument();
    });

    // Filter by text
    const filterInput = screen.getByPlaceholderText("Filter logs...");
    fireEvent.change(filterInput, { target: { value: "database" } });

    // Only matching log should be visible
    expect(screen.queryByText("Starting server")).not.toBeInTheDocument();
    expect(screen.getByText("Database connected")).toBeInTheDocument();
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
  });

  it("should pause/resume log updates", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    await waitFor(() => {
      expect(mockWebSocket).toBeDefined();
    });

    // Click pause button
    const pauseButton = screen.getByTitle("Pause");
    fireEvent.click(pauseButton);

    // Send a log while paused
    const log = {
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Log while paused",
    };

    if (mockWebSocket.onmessage) {
      mockWebSocket.onmessage(
        new MessageEvent("message", {
          data: JSON.stringify(log),
        }),
      );
    }

    // Log should not appear
    expect(screen.queryByText("Log while paused")).not.toBeInTheDocument();

    // Resume
    const resumeButton = screen.getByTitle("Resume");
    fireEvent.click(resumeButton);

    // Send another log
    const log2 = {
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Log after resume",
    };

    if (mockWebSocket.onmessage) {
      mockWebSocket.onmessage(
        new MessageEvent("message", {
          data: JSON.stringify(log2),
        }),
      );
    }

    // This log should appear
    await waitFor(() => {
      expect(screen.getByText("Log after resume")).toBeInTheDocument();
    });
  });

  it("should show log count in footer", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    await waitFor(() => {
      expect(mockWebSocket).toBeDefined();
    });

    // Initially no logs
    expect(screen.getByText("Showing 0 of 0 logs")).toBeInTheDocument();

    // Send some logs
    const logs = [
      { timestamp: new Date().toISOString(), level: "info", message: "Log 1" },
      { timestamp: new Date().toISOString(), level: "error", message: "Log 2" },
    ];

    logs.forEach((log) => {
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(
          new MessageEvent("message", {
            data: JSON.stringify(log),
          }),
        );
      }
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 2 logs")).toBeInTheDocument();
    });

    // Filter to show only one
    const levelSelect = screen.getByRole("combobox");
    fireEvent.change(levelSelect, { target: { value: "error" } });

    expect(screen.getByText("Showing 1 of 2 logs")).toBeInTheDocument();
  });

  it("should handle WebSocket reconnection", async () => {
    render(<LogViewer deploymentId="test-deployment" />);

    // Wait for initial connection
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    // Simulate disconnect
    mockWebSocket.close();

    await waitFor(() => {
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    // In a real scenario, it would reconnect after 5 seconds
    // We're just testing that it properly shows disconnected state
  });
});
