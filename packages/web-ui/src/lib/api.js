"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const axios_1 = __importDefault(require("axios"));
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.cygni.io";
exports.api = axios_1.default.create({
    baseURL: API_URL,
    headers: {
        "Content-Type": "application/json",
    },
});
// Add auth token to requests
exports.api.interceptors.request.use((config) => {
    const token = localStorage.getItem("cygni_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
// Handle auth errors
exports.api.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401) {
        localStorage.removeItem("cygni_token");
        window.location.href = "/login";
    }
    return Promise.reject(error);
});
//# sourceMappingURL=api.js.map