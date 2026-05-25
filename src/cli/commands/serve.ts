import {
  type StartDysflowHttpServerOptions,
  type StartedDysflowHttpServer,
  startDysflowHttpServer,
} from "../../adapters/http/server.js";
import type { CliCommandContext, CliResult } from "./types.js";

export const SERVE_USAGE =
  "Usage: dysflow serve [--host 127.0.0.1] [--port 17321] [--enable-writes]";

type ServeOptions = {
  host: string;
  port: number;
  writesEnabled: boolean;
};

export async function handleServeCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: SERVE_USAGE, stderr: "" };
  }

  const parsed = parseServeOptions(args);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: "", stderr: `${parsed.message}\n${SERVE_USAGE}` };
  }

  try {
    const start = context.startHttpAdapter ?? startDysflowHttpServer;
    const server = await start({ ...parsed.options, env: context.env });
    return {
      exitCode: 0,
      stdout: `Dysflow HTTP API listening on ${server.url} (writes ${server.writesEnabled ? "enabled" : "disabled"})`,
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Dysflow HTTP API.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

function parseServeOptions(
  args: readonly string[],
): { ok: true; options: ServeOptions } | { ok: false; message: string } {
  const options: ServeOptions = { host: "127.0.0.1", port: 17_321, writesEnabled: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--enable-writes") {
      options.writesEnabled = true;
      continue;
    }

    if (arg === "--host") {
      const host = args[index + 1];
      if (host === undefined || host.startsWith("--")) {
        return { ok: false, message: "Missing value for --host." };
      }
      options.host = host;
      index += 1;
      continue;
    }

    if (arg === "--port") {
      const portValue = args[index + 1];
      const port = Number(portValue);
      if (portValue === undefined || !Number.isInteger(port) || port < 0 || port > 65_535) {
        return { ok: false, message: "--port must be an integer between 0 and 65535." };
      }
      options.port = port;
      index += 1;
      continue;
    }

    return { ok: false, message: `Unsupported serve option: ${arg}` };
  }

  return { ok: true, options };
}

export type StartHttpAdapter = (
  options: StartDysflowHttpServerOptions,
) => Promise<Omit<StartedDysflowHttpServer, "server">>;
