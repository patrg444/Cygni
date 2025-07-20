import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import path from "path";

describe("API Graceful Shutdown", () => {
  it("should shutdown gracefully within 5 seconds on SIGTERM", async () => {
    const apiPath = path.join(__dirname, "../../src/index.ts");
    
    // Start the API service
    const apiProcess = spawn("tsx", [apiPath], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "3333",
        LOG_LEVEL: "error",
      },
    });

    let serverStarted = false;
    let serverClosed = false;
    const logs: string[] = [];

    // Capture output
    apiProcess.stdout.on("data", (data) => {
      const log = data.toString();
      logs.push(log);
      if (log.includes("Server listening") || log.includes("started")) {
        serverStarted = true;
      }
      if (log.includes("Server closed") || log.includes("shutdown complete")) {
        serverClosed = true;
      }
    });

    apiProcess.stderr.on("data", (data) => {
      logs.push(`stderr: ${data.toString()}`);
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (serverStarted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    });

    expect(serverStarted).toBe(true);

    // Send SIGTERM
    const shutdownStart = Date.now();
    apiProcess.kill("SIGTERM");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      apiProcess.on("exit", (code) => {
        const shutdownDuration = Date.now() - shutdownStart;
        
        // Should exit with code 0
        expect(code).toBe(0);
        
        // Should shutdown within 5 seconds
        expect(shutdownDuration).toBeLessThan(5000);
        
        // Should have logged shutdown message
        expect(serverClosed).toBe(true);
        
        resolve();
      });

      // Force kill after 10 seconds if not shut down
      setTimeout(() => {
        apiProcess.kill("SIGKILL");
        resolve();
      }, 10000);
    });
  }, 20000); // 20 second timeout for the test
});