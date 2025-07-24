import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const dashboardApi = {
  // Metrics
  getMetrics: () => api.get("/metrics/overview"),
  getSystemHealth: () => api.get("/health?deep=true"),
  
  // Billing
  getBillingOverview: () => api.get("/billing/overview"),
  getSubscriptions: () => api.get("/subscriptions"),
  
  // Activity
  getRecentActivity: () => api.get("/audit/recent"),
  getAlerts: () => api.get("/alerts/active"),
  
  // Users
  getUsers: () => api.get("/users"),
  getTeamMembers: () => api.get("/teams/members"),
  
  // Projects
  getProjects: () => api.get("/projects"),
  getDeployments: () => api.get("/deployments/recent"),
};