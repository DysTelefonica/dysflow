import { lintVbaMissingCalleesSourceTree } from "../../adapters/vba-sync/vba-missing-callees-lint-adapter.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE = "Usage: dysflow lint callees [source-root] [--json]";

export async function handleLintCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: USAGE, stderr: "" };
  }
  const [subcommand, ...rest] = args;
  if (subcommand !== "callees") return invocationError("Unknown lint subcommand.");
  const positional = rest.filter((arg) => !arg.startsWith("-"));
  const unsupported = rest.filter((arg) => arg.startsWith("-") && arg !== "--json");
  if (positional.length > 1 || unsupported.length > 0) return invocationError("Invalid options.");

  let additionalExclusions: readonly string[] = [];
  const rawExtras = context.env?.DYSFLOW_LINT_EXTRAS ?? process.env.DYSFLOW_LINT_EXTRAS;
  if (rawExtras !== undefined) {
    try {
      additionalExclusions = parseExtraExclusions(rawExtras);
    } catch (error) {
      return invocationError(
        error instanceof Error ? error.message : "Invalid DYSFLOW_LINT_EXTRAS.",
      );
    }
  }

  try {
    const result = await lintVbaMissingCalleesSourceTree(
      context.cwd ?? process.cwd(),
      positional[0] ?? "src",
      { additionalExclusions },
    );
    return {
      exitCode: result.ok ? 0 : 1,
      stdout: rest.includes("--json") ? JSON.stringify(result, null, 2) : formatHuman(result),
      stderr: "",
    };
  } catch (error) {
    return invocationError(error instanceof Error ? error.message : "Unable to read VBA sources.");
  }
}

function parseExtraExclusions(raw: string): readonly string[] {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("DYSFLOW_LINT_EXTRAS must be a JSON object.");
  }
  const groups = Object.values(value);
  if (
    !groups.every(
      (group) => Array.isArray(group) && group.every((item) => typeof item === "string"),
    )
  ) {
    throw new Error("DYSFLOW_LINT_EXTRAS values must be arrays of strings.");
  }
  return groups.flat() as string[];
}

function formatHuman(result: Awaited<ReturnType<typeof lintVbaMissingCalleesSourceTree>>): string {
  if (result.ok) {
    return `OK: 0 missing callees across ${result.totals.declarations} declarations (${result.elapsedMs}ms)`;
  }
  return [
    `FAIL: ${result.totals.missing} missing callee(s) across ${result.totals.declarations} declarations (${result.elapsedMs}ms)`,
    "",
    ...result.missing.map(
      (item) =>
        `${item.file}:${item.line}:${item.column}  missing callee: ${item.module}.${item.name} (${item.kind})`,
    ),
  ].join("\n");
}

function invocationError(message: string): CliResult {
  return { exitCode: 2, stdout: "", stderr: `${message}\n${USAGE}` };
}
