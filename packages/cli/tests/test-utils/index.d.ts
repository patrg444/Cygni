import { Readable } from "stream";
import type { AxiosResponse } from "axios";
export declare const mockConsole: {
    log: import("vitest").Mock<any, any>;
    error: import("vitest").Mock<any, any>;
    warn: import("vitest").Mock<any, any>;
    setup: () => void;
    restore: () => void;
};
export declare const mockProcess: {
    exit: import("vitest").Mock<any, any>;
    setup: () => void;
    restore: () => void;
};
export declare const mockAxios: {
    post: import("vitest").Mock<any, any>;
    get: import("vitest").Mock<any, any>;
    put: import("vitest").Mock<any, any>;
    delete: import("vitest").Mock<any, any>;
    patch: import("vitest").Mock<any, any>;
};
export declare const mockFileSystem: {
    setup: () => {
        mockFs: Map<string, string>;
        cleanup: () => void;
    };
};
export declare const mockInquirer: {
    input: import("vitest").Mock<any, any>;
    password: import("vitest").Mock<any, any>;
    select: import("vitest").Mock<any, any>;
    confirm: import("vitest").Mock<any, any>;
};
export declare const createMockResponse: <T = any>(data: T, status?: number) => AxiosResponse<T>;
export declare const createMockError: (status: number, message: string, data?: any) => any;
export declare const mockStdin: (inputs: string[]) => Readable;
export declare const clearAllMocks: () => void;
export declare const setupMocks: () => void;
//# sourceMappingURL=index.d.ts.map