import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import ConsolePage from "./page";

// Mock the API response
global.fetch = vi.fn();

describe("ConsolePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render loading state initially", () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<ConsolePage />);

    expect(screen.getByText("Analyzing project...")).toBeInTheDocument();
  });

  it("should render console page with tabs", async () => {
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

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    render(<ConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("CloudExpress Console")).toBeInTheDocument();
    });

    // Check tabs are rendered
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("API Endpoints")).toBeInTheDocument();
    expect(screen.getByText("Runtime Config")).toBeInTheDocument();
    expect(screen.getByText("Deployment")).toBeInTheDocument();

    // Check action buttons
    expect(screen.getByText("View Logs")).toBeInTheDocument();
    expect(screen.getByText("Deploy Now")).toBeInTheDocument();
  });

  it("should handle API error", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
    });

    render(<ConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to analyze project")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("should switch between tabs", async () => {
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

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    render(<ConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("Project Analysis Summary")).toBeInTheDocument();
    });

    // Click on API Endpoints tab
    fireEvent.click(screen.getByText("API Endpoints"));

    // Should show endpoints list
    expect(screen.getByText("Search endpoints...")).toBeInTheDocument();

    // Click on Runtime Config tab
    fireEvent.click(screen.getByText("Runtime Config"));

    // Should show runtime config editor
    expect(screen.getByText("runtime.yaml")).toBeInTheDocument();

    // Click on Deployment tab
    fireEvent.click(screen.getByText("Deployment"));

    // Should show deployment config
    expect(screen.getByText("Target Environment")).toBeInTheDocument();
  });
});
