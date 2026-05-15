import type { CliResult } from "./types.js";

export const SERVE_USAGE = "Usage: dysflow serve [--host 127.0.0.1] [--port 17321]";

export async function handleServeCommand(args: readonly string[]): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: SERVE_USAGE, stderr: "" };
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr: [
      "dysflow serve is planned for the HTTP adapter phase.",
      SERVE_USAGE,
    ].join("\n"),
  };
}


