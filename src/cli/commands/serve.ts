import {
  type StartDysflowHttpServerOptions,
  type StartedDysflowHttpServer,
  startDysflowHttpServer,
} from "../../adapters/http/server.js";
import type { CliCommandContext, CliResult } from "./types.js";
import { parseNamedArgs } from "./install-utils.js";

export const SERVE_USAGE =
  "Usage: dysflow serve [--host 127.0.0.1] [--port 17321] [--enable-writes] [--token <token>]";

type ServeOptions = {
  host: string;
  port: number;
  writesEnabled: boolean;
  httpToken?: string;
};

/**
 * Composition root for the HTTP adapter.
 * Concrete service construction is delegated to createHttpServices() via startDysflowHttpServer.
 */
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
  const parsed = parseNamedArgs({
    specs: [
      { name: "--enable-writes", type: "boolean" },
      { name: "--host", type: "string" },
      { name: "--port", type: "string" },
      { name: "--token", type: "string" },
    ],
    args,
    onUnknown: (arg) => `Unsupported serve option: ${arg}`,
    onMissing: (arg) => arg === "--port" ? "--port must be an integer between 0 and 65535." : `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  const portValue = parsed.values["--port"] as string | undefined;
  let port = 17_321;
  if (portValue !== undefined) {
    port = Number(portValue);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      return { ok: false, message: "--port must be an integer between 0 and 65535." };
    }
  }

  return {
    ok: true,
    options: {
      host: (parsed.values["--host"] as string) ?? "127.0.0.1",
      port,
      writesEnabled: parsed.values["--enable-writes"] === true,
      httpToken: parsed.values["--token"] as string | undefined,
    },
  };
}

export type StartHttpAdapter = (
  options: StartDysflowHttpServerOptions,
) => Promise<Omit<StartedDysflowHttpServer, "server">>;
