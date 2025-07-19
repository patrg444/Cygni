import { WebSocket } from "ws";
import { getApiClient } from "./api-client";

export async function watchLogs(deploymentId: string): Promise<void> {
  const api = await getApiClient();
  const wsUrl = process.env.CLOUDEXPRESS_WS_URL || "wss://api.cygni.io";

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${wsUrl}/deployments/${deploymentId}/logs/stream`,
      {
        headers: {
          Authorization: api.defaults.headers.Authorization as string,
        },
      },
    );

    ws.on("open", () => {
      console.log("Connected to log stream...\n");
    });

    ws.on("message", (data) => {
      const log = JSON.parse(data.toString());
      formatAndPrintLog(log);
    });

    ws.on("error", (error) => {
      reject(error);
    });

    ws.on("close", () => {
      resolve();
    });

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      ws.close();
      resolve();
    });
  });
}

function formatAndPrintLog(log: any) {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  const level = log.level || "info";

  const message = `[${timestamp}] ${log.message || log.msg || JSON.stringify(log)}`;

  // Color based on level
  if (level === "error") {
    console.error(message);
  } else {
    console.log(message);
  }
}
