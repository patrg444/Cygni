import axios, { AxiosInstance } from "axios";
import { loadAuth } from "../utils/auth";

let apiClient: AxiosInstance | null = null;

export async function getApiClient(): Promise<AxiosInstance> {
  if (!apiClient) {
    const auth = await loadAuth();

    if (!auth || !auth.token) {
      throw new Error('Not authenticated. Please run "cygni login" first.');
    }

    const baseURL = process.env.CLOUDEXPRESS_API_URL || "https://api.cygni.io";

    apiClient = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Add request interceptor for debugging
    if (process.env.DEBUG) {
      apiClient.interceptors.request.use((request) => {
        console.log("API Request:", request.method?.toUpperCase(), request.url);
        return request;
      });
    }

    // Add response interceptor for error handling
    apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new Error(
            'Authentication failed. Please run "cygni login" again.',
          );
        }
        throw error;
      },
    );
  }

  return apiClient;
}
