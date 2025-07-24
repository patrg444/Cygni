"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("@testing-library/jest-dom");
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const matchers = __importStar(require("@testing-library/jest-dom/matchers"));
// Extend Vitest's expect with Testing Library matchers
vitest_1.expect.extend(matchers);
// Cleanup after each test
(0, vitest_1.afterEach)(() => {
    (0, react_1.cleanup)();
});
// Mock Next.js router
vitest_1.vi.mock("next/navigation", () => ({
    useRouter() {
        return {
            push: vitest_1.vi.fn(),
            replace: vitest_1.vi.fn(),
            refresh: vitest_1.vi.fn(),
            back: vitest_1.vi.fn(),
            forward: vitest_1.vi.fn(),
            prefetch: vitest_1.vi.fn(),
        };
    },
    useSearchParams() {
        return new URLSearchParams();
    },
    usePathname() {
        return "";
    },
}));
// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vitest_1.vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn(),
        addEventListener: vitest_1.vi.fn(),
        removeEventListener: vitest_1.vi.fn(),
        dispatchEvent: vitest_1.vi.fn(),
    })),
});
//# sourceMappingURL=setup.js.map