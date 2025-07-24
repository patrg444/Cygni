import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "../test/utils";
import { UserProfile } from "./UserProfile";
import { User } from "../contexts/AuthContext";

describe("UserProfile", () => {
  const mockUser: User = {
    id: "123",
    email: "test@example.com",
    name: "Test User",
    organizations: [
      { id: "org1", name: "Acme Corp", role: "admin" },
      { id: "org2", name: "Tech Inc", role: "member" },
    ],
  };

  it("should not render when user is not authenticated", () => {
    const { container } = render(<UserProfile />, {
      authValue: { user: null, isLoading: false },
    });

    expect(container.firstChild).toBeNull();
  });

  it("should render user profile button when authenticated", () => {
    render(<UserProfile />, {
      authValue: { user: mockUser, isLoading: false },
    });

    expect(screen.getByLabelText("User menu")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument(); // Avatar initial
  });

  it("should use email when name is not available", () => {
    const userWithoutName = { ...mockUser, name: undefined };

    render(<UserProfile />, {
      authValue: { user: userWithoutName, isLoading: false },
    });

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument(); // Avatar uses email initial
  });

  it("should toggle dropdown when clicked", () => {
    render(<UserProfile />, {
      authValue: { user: mockUser, isLoading: false },
    });

    // Dropdown should be closed initially
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();

    // Click to open dropdown
    fireEvent.click(screen.getByLabelText("User menu"));

    // Dropdown should be visible
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();

    // Click again to close
    fireEvent.click(screen.getByLabelText("User menu"));

    // Dropdown should be hidden
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("should display user organizations in dropdown", () => {
    render(<UserProfile />, {
      authValue: { user: mockUser, isLoading: false },
    });

    // Open dropdown
    fireEvent.click(screen.getByLabelText("User menu"));

    // Check organizations are displayed
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("(admin)")).toBeInTheDocument();
    expect(screen.getByText("Tech Inc")).toBeInTheDocument();
    expect(screen.getByText("(member)")).toBeInTheDocument();
  });

  it("should not show organizations section when user has none", () => {
    const userWithoutOrgs = { ...mockUser, organizations: [] };

    render(<UserProfile />, {
      authValue: { user: userWithoutOrgs, isLoading: false },
    });

    // Open dropdown
    fireEvent.click(screen.getByLabelText("User menu"));

    // Organizations section should not be present
    expect(screen.queryByText("Organizations")).not.toBeInTheDocument();
  });

  it("should call logout when sign out is clicked", async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);

    render(<UserProfile />, {
      authValue: {
        user: mockUser,
        isLoading: false,
        logout: mockLogout,
      },
    });

    // Open dropdown
    fireEvent.click(screen.getByLabelText("User menu"));

    // Click sign out
    fireEvent.click(screen.getByText("Sign out"));

    // Logout should be called
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    // Dropdown should be closed after logout
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("should render correctly with minimal user data", () => {
    const minimalUser: User = {
      id: "456",
      email: "minimal@example.com",
    };

    render(<UserProfile />, {
      authValue: { user: minimalUser, isLoading: false },
    });

    expect(screen.getByText("minimal@example.com")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument(); // Avatar initial
  });
});
