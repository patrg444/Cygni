import { OpenAPI } from "./generated";

export interface ApiConfig {
  baseUrl: string;
  token?: string;
}

export function configureApi(config: ApiConfig) {
  OpenAPI.BASE = config.baseUrl;

  if (config.token) {
    OpenAPI.TOKEN = config.token;
    OpenAPI.HEADERS = {
      ...OpenAPI.HEADERS,
      Authorization: `Bearer ${config.token}`,
    };
  }
}

export function setAuthToken(token: string) {
  OpenAPI.TOKEN = token;
  OpenAPI.HEADERS = {
    ...OpenAPI.HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

export function clearAuthToken() {
  OpenAPI.TOKEN = undefined;
  const headers: Record<string, string> = { ...OpenAPI.HEADERS };
  delete headers.Authorization;
  OpenAPI.HEADERS = headers;
}
