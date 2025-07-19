import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.cygni.io";

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cygni_token");
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
      localStorage.removeItem("cygni_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
