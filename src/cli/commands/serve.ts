import {
  type StartDysflowHttpServerOptions,
  type StartedDysflowHttpServer,
  startDysflowHttpServer,
} from "../../adapters/http/server.js";
import { parseNamedArgs } from "./install-utils.js";
import type { CliCommandContext, CliResult } from "./types.js";

export const SERVE_USAGE =
  "Usage: dysflow serve [--host 127.0.0.1] [--port 17321] [--enable-writes] [--token <token>]";

type ServeOptions = {
  host: string;
  port: number;
  writesEnabled: boolean;
  httpToken?: string;
};

/**
 * #669 — fail-closed guard for non-loopback hosts without a token.
 * Listening on a non-loopback interface (e.g. 0.0.0.0) without a token
 * exposes the API (and `--enable-writes`) to the LAN. We refuse to start
 * in that combination and tell the operator what to do.
 */
function isNonLoopbackHost(host: string): boolean {
  // Accept the literal "0.0.0.0", "::", IPv4 broadcast, and IPv6 wildcard.
  // Anything that's NOT 127.0.0.1/::1/localhost is treated as non-loopback
  // for fail-closed purposes.
  if (host === "localhost") return false;
  if (host === "127.0.0.1" || host === "::1") return false;
  if (host === "0.0.0.0" || host === "::") return true;
  // Conservative default: anything that isn't an obvious loopback address
  // is treated as non-loopback. Operators who want to listen on a private
  // IP MUST provide a token.
  return true;
}

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

  // #669 — fail-closed: refuse to bind a non-loopback host without a token.
  // The token is required so that LAN-reachable instances cannot be
  // exercised without authentication, even with `--enable-writes`.
  if (isNonLoopbackHost(parsed.options.host) && !parsed.options.httpToken) {
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        `Refusing to start: host ${parsed.options.host} is non-loopback and no --token was provided.\n` +
        `Pass --token <token> (or set DYSFLOW_SERVE_TOKEN) to authenticate callers, or bind to 127.0.0.1.\n` +
        SERVE_USAGE,
    };
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
    onMissing: (arg) =>
      arg === "--port"
        ? "--port must be an integer between 0 and 65535."
        : `Missing value for ${arg}.`,
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
