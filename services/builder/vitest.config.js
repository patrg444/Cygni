"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./tests/setup.ts"],
        testTimeout: 30000, // 30 seconds
        coverage: {
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "tests/", "dist/"],
        },
    },
    resolve: {
        alias: {
            "@": path_1.default.resolve(__dirname, "./src"),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map