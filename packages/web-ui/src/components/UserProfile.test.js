"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const utils_1 = require("../test/utils");
const UserProfile_1 = require("./UserProfile");
(0, vitest_1.describe)("UserProfile", () => {
    const mockUser = {
        id: "123",
        email: "test@example.com",
        name: "Test User",
        organizations: [
            { id: "org1", name: "Acme Corp", role: "admin" },
            { id: "org2", name: "Tech Inc", role: "member" },
        ],
    };
    (0, vitest_1.it)("should not render when user is not authenticated", () => {
        const { container } = (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: null, isLoading: false },
        });
        (0, vitest_1.expect)(container.firstChild).toBeNull();
    });
    (0, vitest_1.it)("should render user profile button when authenticated", () => {
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: mockUser, isLoading: false },
        });
        (0, vitest_1.expect)(utils_1.screen.getByLabelText("User menu")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Test User")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("T")).toBeInTheDocument(); // Avatar initial
    });
    (0, vitest_1.it)("should use email when name is not available", () => {
        const userWithoutName = { ...mockUser, name: undefined };
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: userWithoutName, isLoading: false },
        });
        (0, vitest_1.expect)(utils_1.screen.getByText("test@example.com")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("T")).toBeInTheDocument(); // Avatar uses email initial
    });
    (0, vitest_1.it)("should toggle dropdown when clicked", () => {
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: mockUser, isLoading: false },
        });
        // Dropdown should be closed initially
        (0, vitest_1.expect)(utils_1.screen.queryByText("Sign out")).not.toBeInTheDocument();
        // Click to open dropdown
        utils_1.fireEvent.click(utils_1.screen.getByLabelText("User menu"));
        // Dropdown should be visible
        (0, vitest_1.expect)(utils_1.screen.getByText("Sign out")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("test@example.com")).toBeInTheDocument();
        // Click again to close
        utils_1.fireEvent.click(utils_1.screen.getByLabelText("User menu"));
        // Dropdown should be hidden
        (0, vitest_1.expect)(utils_1.screen.queryByText("Sign out")).not.toBeInTheDocument();
    });
    (0, vitest_1.it)("should display user organizations in dropdown", () => {
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: mockUser, isLoading: false },
        });
        // Open dropdown
        utils_1.fireEvent.click(utils_1.screen.getByLabelText("User menu"));
        // Check organizations are displayed
        (0, vitest_1.expect)(utils_1.screen.getByText("Organizations")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Acme Corp")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("(admin)")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("Tech Inc")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("(member)")).toBeInTheDocument();
    });
    (0, vitest_1.it)("should not show organizations section when user has none", () => {
        const userWithoutOrgs = { ...mockUser, organizations: [] };
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: userWithoutOrgs, isLoading: false },
        });
        // Open dropdown
        utils_1.fireEvent.click(utils_1.screen.getByLabelText("User menu"));
        // Organizations section should not be present
        (0, vitest_1.expect)(utils_1.screen.queryByText("Organizations")).not.toBeInTheDocument();
    });
    (0, vitest_1.it)("should call logout when sign out is clicked", async () => {
        const mockLogout = vitest_1.vi.fn().mockResolvedValue(undefined);
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: {
                user: mockUser,
                isLoading: false,
                logout: mockLogout,
            },
        });
        // Open dropdown
        utils_1.fireEvent.click(utils_1.screen.getByLabelText("User menu"));
        // Click sign out
        utils_1.fireEvent.click(utils_1.screen.getByText("Sign out"));
        // Logout should be called
        await (0, utils_1.waitFor)(() => {
            (0, vitest_1.expect)(mockLogout).toHaveBeenCalledTimes(1);
        });
        // Dropdown should be closed after logout
        (0, vitest_1.expect)(utils_1.screen.queryByText("Sign out")).not.toBeInTheDocument();
    });
    (0, vitest_1.it)("should render correctly with minimal user data", () => {
        const minimalUser = {
            id: "456",
            email: "minimal@example.com",
        };
        (0, utils_1.render)(<UserProfile_1.UserProfile />, {
            authValue: { user: minimalUser, isLoading: false },
        });
        (0, vitest_1.expect)(utils_1.screen.getByText("minimal@example.com")).toBeInTheDocument();
        (0, vitest_1.expect)(utils_1.screen.getByText("M")).toBeInTheDocument(); // Avatar initial
    });
});
//# sourceMappingURL=UserProfile.test.js.map