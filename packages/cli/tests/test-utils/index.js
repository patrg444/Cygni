"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMocks = exports.clearAllMocks = exports.mockStdin = exports.createMockError = exports.createMockResponse = exports.mockInquirer = exports.mockFileSystem = exports.mockAxios = exports.mockProcess = exports.mockConsole = void 0;
const vitest_1 = require("vitest");
const stream_1 = require("stream");
exports.mockConsole = {
    log: vitest_1.vi.fn(),
    error: vitest_1.vi.fn(),
    warn: vitest_1.vi.fn(),
    setup: () => {
        vitest_1.vi.spyOn(console, "log").mockImplementation(exports.mockConsole.log);
        vitest_1.vi.spyOn(console, "error").mockImplementation(exports.mockConsole.error);
        vitest_1.vi.spyOn(console, "warn").mockImplementation(exports.mockConsole.warn);
    },
    restore: () => {
        vitest_1.vi.restoreAllMocks();
    },
};
exports.mockProcess = {
    exit: vitest_1.vi.fn().mockImplementation((code) => {
        throw new Error(`process.exit called with "${code}"`);
    }),
    setup: () => {
        vitest_1.vi.spyOn(process, "exit").mockImplementation(exports.mockProcess.exit);
    },
    restore: () => {
        vitest_1.vi.restoreAllMocks();
    },
};
exports.mockAxios = {
    post: vitest_1.vi.fn(),
    get: vitest_1.vi.fn(),
    put: vitest_1.vi.fn(),
    delete: vitest_1.vi.fn(),
    patch: vitest_1.vi.fn(),
};
exports.mockFileSystem = {
    setup: () => {
        const mockFs = new Map();
        vitest_1.vi.mock("fs/promises", () => ({
            readFile: vitest_1.vi.fn((path) => {
                if (mockFs.has(path)) {
                    return Promise.resolve(mockFs.get(path));
                }
                return Promise.reject(new Error("ENOENT"));
            }),
            writeFile: vitest_1.vi.fn((path, content) => {
                mockFs.set(path, content);
                return Promise.resolve();
            }),
            mkdir: vitest_1.vi.fn(() => Promise.resolve()),
            unlink: vitest_1.vi.fn((path) => {
                mockFs.delete(path);
                return Promise.resolve();
            }),
            chmod: vitest_1.vi.fn(() => Promise.resolve()),
        }));
        return {
            mockFs,
            cleanup: () => mockFs.clear(),
        };
    },
};
exports.mockInquirer = {
    input: vitest_1.vi.fn(),
    password: vitest_1.vi.fn(),
    select: vitest_1.vi.fn(),
    confirm: vitest_1.vi.fn(),
};
const createMockResponse = (data, status = 200) => ({
    data,
    status,
    statusText: "OK",
    headers: {},
    config: {},
});
exports.createMockResponse = createMockResponse;
const createMockError = (status, message, data) => {
    const error = new Error(message);
    error.response = {
        status,
        data: data || { error: message },
    };
    return error;
};
exports.createMockError = createMockError;
const mockStdin = (inputs) => {
    let inputIndex = 0;
    const stdin = new stream_1.Readable({
        read() {
            if (inputIndex < inputs.length) {
                this.push(inputs[inputIndex++] + "\n");
            }
            else {
                this.push(null);
            }
        },
    });
    Object.defineProperty(process, "stdin", {
        value: stdin,
        writable: true,
        configurable: true,
    });
    return stdin;
};
exports.mockStdin = mockStdin;
const clearAllMocks = () => {
    vitest_1.vi.clearAllMocks();
    exports.mockConsole.log.mockClear();
    exports.mockConsole.error.mockClear();
    exports.mockConsole.warn.mockClear();
    exports.mockProcess.exit.mockClear();
};
exports.clearAllMocks = clearAllMocks;
const setupMocks = () => {
    exports.mockConsole.setup();
    exports.mockProcess.setup();
};
exports.setupMocks = setupMocks;
//# sourceMappingURL=index.js.map