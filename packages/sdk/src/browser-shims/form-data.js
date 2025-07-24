"use strict";
// Browser-compatible FormData shim
// This replaces the Node.js form-data package in browser builds
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormData = void 0;
// In browsers, FormData is a global constructor
exports.default = globalThis.FormData;
// For compatibility with form-data package API
exports.FormData = globalThis.FormData;
//# sourceMappingURL=form-data.js.map