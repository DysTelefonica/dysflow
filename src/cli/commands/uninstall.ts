import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import {
  ALL_AGENTS,
  fileExists,
  getHome,
  getSystemMarkerPath,
  isSafeToDelete,
  parseNamedArgs,
  removeAgentConfig,
  resolveAgentConfigPaths,
  resolveRuntimeDir,
} from "./install-utils.js";
import type { CliCommandContext, CliResult } from "./types.js";

const UNINSTALL_USAGE = "Usage: dysflow uninstall [--runtime-dir <dir>]";

export type UninstallOptions = {
  runtimeDir?: string;
};

export function parseUninstallArgs(
  args: readonly string[],
): { ok: true; options: UninstallOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: UNINSTALL_USAGE };
  }

  const parsed = parseNamedArgs({
    specs: [{ name: "--runtime-dir", type: "string" }],
    args,
    onUnknown: (arg) => `Unsupported uninstall option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  return {
    ok: true,
    options: {
      runtimeDir: parsed.values["--runtime-dir"] as string | undefined,
    },
  };
}

export async function handleUninstallCommand(
  args: readonly string[],
  context?: CliCommandContext,
): Promise<CliResult> {
  const parsed = parseUninstallArgs(args);
  if (!parsed.ok) {
    if (args.includes("--help") || args.includes("-h")) {
      return { exitCode: 0, stdout: parsed.message, stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: parsed.message };
  }

  const env = context?.env ?? process.env;
  const home = getHome(env);

  // Revert agent configurations
  const agentConfigPaths = resolveAgentConfigPaths(home);
  for (const agent of ALL_AGENTS) {
    try {
      await removeAgentConfig(agent, agentConfigPaths);
    } catch {
      // Ignore cleanup failures on uninstall to ensure it proceeds
    }
  }

  // Delete resolved runtime directory recursively if it exists
  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  if (await fileExists(runtimeDir)) {
    if (!isSafeToDelete(runtimeDir, env)) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Aborted: Unsafe runtime directory path: ${runtimeDir}`,
      };
    }
    await rm(runtimeDir, { recursive: true, force: true });
  }

  // Delete system marker file .dysflow-marker if it exists
  const markerPath = getSystemMarkerPath(env);
  const markerDir = path.dirname(markerPath);
  if (await fileExists(markerPath)) {
    await rm(markerPath, { force: true });
  }

  // Attempt to delete the parent directory of the marker file if empty
  try {
    await rmdir(markerDir);
  } catch {
    // Silent catch if not empty or not found
  }

  // Remove DYSFLOW_HOME and DYSFLOW_RUNTIME_MARKER_PATH from context.env if present
  if (context?.env) {
    delete context.env.DYSFLOW_HOME;
    delete context.env.DYSFLOW_RUNTIME_MARKER_PATH;
  }

  const stdoutParts: string[] = [];

  // Check process.env and format warnings
  if (process.env.DYSFLOW_HOME !== undefined) {
    stdoutParts.push(
      "Warning: DYSFLOW_HOME is still set in your process environment. You may need to remove it manually.",
    );
  }
  if (process.env.DYSFLOW_RUNTIME_MARKER_PATH !== undefined) {
    stdoutParts.push(
      "Warning: DYSFLOW_RUNTIME_MARKER_PATH is still set in your process environment. You may need to remove it manually.",
    );
  }

  stdoutParts.push("Dysflow uninstalled successfully.");

  return { exitCode: 0, stdout: stdoutParts.join("\n"), stderr: "" };
}
