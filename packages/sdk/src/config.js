"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApi = configureApi;
exports.setAuthToken = setAuthToken;
exports.clearAuthToken = clearAuthToken;
const generated_1 = require("./generated");
function configureApi(config) {
    generated_1.OpenAPI.BASE = config.baseUrl;
    if (config.token) {
        generated_1.OpenAPI.TOKEN = config.token;
        generated_1.OpenAPI.HEADERS = {
            ...generated_1.OpenAPI.HEADERS,
            Authorization: `Bearer ${config.token}`,
        };
    }
}
function setAuthToken(token) {
    generated_1.OpenAPI.TOKEN = token;
    generated_1.OpenAPI.HEADERS = {
        ...generated_1.OpenAPI.HEADERS,
        Authorization: `Bearer ${token}`,
    };
}
function clearAuthToken() {
    generated_1.OpenAPI.TOKEN = undefined;
    const headers = { ...generated_1.OpenAPI.HEADERS };
    delete headers.Authorization;
    generated_1.OpenAPI.HEADERS = headers;
}
//# sourceMappingURL=config.js.map