import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type DysflowMcpResult = {
  content: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
};

export type DysflowMcpPort = {
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: unknown) => void;
    },
  ): Promise<DysflowMcpResult>;
  close(): Promise<void>;
};

type ClientState = {
  client: Client;
  transport: StdioClientTransport;
};

export function resolveDysflowCommand(
  _moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.DYSFLOW_BIN?.trim();
  if (override) {
    if (!path.isAbsolute(override)) {
      throw new Error("DYSFLOW_BIN must be an absolute path to a trusted Dysflow launcher.");
    }
    return override;
  }

  let runtimeDir = env.DYSFLOW_HOME?.trim();
  if (!runtimeDir) {
    const markerPath =
      env.DYSFLOW_RUNTIME_MARKER_PATH ??
      path.join(env.ProgramData ?? path.join(env.SystemDrive ?? "C:", "ProgramData"), "dysflow", ".dysflow-marker");
    try {
      const lines = readFileSync(markerPath, "utf8")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      runtimeDir = /^\d+$/.test(lines[0] ?? "") ? lines[1] : lines[0];
    } catch {
      // Missing or unreadable marker falls through to the documented default.
    }
  }
  runtimeDir ??= path.join(
    env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? env.HOME ?? "", "AppData", "Local"),
    "dysflow",
  );
  if (!path.isAbsolute(runtimeDir)) {
    throw new Error("The resolved Dysflow runtime directory must be absolute.");
  }
  return path.join(runtimeDir, "bin", process.platform === "win32" ? "dysflow.cmd" : "dysflow");
}

export function dysflowChildEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function createDysflowMcpClient(options: {
  command?: string;
  cwd: () => string;
  env?: NodeJS.ProcessEnv;
}): DysflowMcpPort {
  let state: ClientState | undefined;
  let connecting: Promise<ClientState> | undefined;

  async function connect(): Promise<ClientState> {
    if (state) return state;
    if (connecting) return connecting;

    connecting = (async () => {
      const client = new Client({ name: "dysflow-pi-native", version: "1.0.0" });
      const transport = new StdioClientTransport({
        command: options.command ?? resolveDysflowCommand(import.meta.url, options.env),
        args: ["mcp"],
        cwd: options.cwd(),
        env: dysflowChildEnvironment(options.env),
        stderr: "inherit",
      });
      await client.connect(transport);
      const connected = { client, transport };
      state = connected;
      return connected;
    })();

    try {
      return await connecting;
    } finally {
      connecting = undefined;
    }
  }

  return {
    async callTool(name, args, request = {}) {
      const current = await connect();
      const result = await current.client.callTool(
        { name, arguments: args },
        undefined,
        {
          signal: request.signal,
          onprogress: request.onProgress,
          resetTimeoutOnProgress: true,
        },
      );
      return result as DysflowMcpResult;
    },
    async close() {
      const current = state;
      state = undefined;
      connecting = undefined;
      if (current) await current.client.close();
    },
  };
}
