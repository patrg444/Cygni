// Browser-compatible FormData shim
// This replaces the Node.js form-data package in browser builds

// In browsers, FormData is a global constructor
export default globalThis.FormData;

// For compatibility with form-data package API
export const FormData = globalThis.FormData;