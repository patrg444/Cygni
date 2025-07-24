import { vi } from "vitest";
import { Readable } from "stream";
import type { AxiosResponse } from "axios";

export const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  setup: () => {
    vi.spyOn(console, "log").mockImplementation(mockConsole.log);
    vi.spyOn(console, "error").mockImplementation(mockConsole.error);
    vi.spyOn(console, "warn").mockImplementation(mockConsole.warn);
  },
  restore: () => {
    vi.restoreAllMocks();
  },
};

export const mockProcess = {
  exit: vi.fn().mockImplementation((code?: number) => {
    throw new Error(`process.exit called with "${code}"`);
  }),
  setup: () => {
    vi.spyOn(process, "exit").mockImplementation(mockProcess.exit);
  },
  restore: () => {
    vi.restoreAllMocks();
  },
};

export const mockAxios = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
};

export const mockFileSystem = {
  setup: () => {
    const mockFs = new Map<string, string>();

    vi.mock("fs/promises", () => ({
      readFile: vi.fn((path: string) => {
        if (mockFs.has(path)) {
          return Promise.resolve(mockFs.get(path));
        }
        return Promise.reject(new Error("ENOENT"));
      }),
      writeFile: vi.fn((path: string, content: string) => {
        mockFs.set(path, content);
        return Promise.resolve();
      }),
      mkdir: vi.fn(() => Promise.resolve()),
      unlink: vi.fn((path: string) => {
        mockFs.delete(path);
        return Promise.resolve();
      }),
      chmod: vi.fn(() => Promise.resolve()),
    }));

    return {
      mockFs,
      cleanup: () => mockFs.clear(),
    };
  },
};

export const mockInquirer = {
  input: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
};

export const createMockResponse = <T = any>(
  data: T,
  status = 200,
): AxiosResponse<T> => ({
  data,
  status,
  statusText: "OK",
  headers: {},
  config: {} as any,
});

export const createMockError = (
  status: number,
  message: string,
  data?: any,
) => {
  const error: any = new Error(message);
  error.response = {
    status,
    data: data || { error: message },
  };
  return error;
};

export const mockStdin = (inputs: string[]) => {
  let inputIndex = 0;
  const stdin = new Readable({
    read() {
      if (inputIndex < inputs.length) {
        this.push(inputs[inputIndex++] + "\n");
      } else {
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

export const clearAllMocks = () => {
  vi.clearAllMocks();
  mockConsole.log.mockClear();
  mockConsole.error.mockClear();
  mockConsole.warn.mockClear();
  mockProcess.exit.mockClear();
};

export const setupMocks = () => {
  mockConsole.setup();
  mockProcess.setup();
};
