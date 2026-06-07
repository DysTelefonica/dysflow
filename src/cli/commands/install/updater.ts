import { readFile } from "node:fs/promises";
import { compareVersions } from "../../../core/utils/version.js";
import { parseNamedArgs } from "../arg-parser.js";
import type { CliResult } from "../types.js";
import { type AgentName, ALL_AGENTS } from "./agent-config.js";
import {
  createGitHubReleaseUpdateProvider,
  type PreparedReleasePackage,
  type ReleaseInfo,
  type ReleaseUpdateProvider,
} from "./downloader.js";
import {
  createInstallReport,
  installRuntime,
  resolveRuntimePaths,
  writeRuntimeMarker,
} from "./extractor.js";
import { resolvePackageRoot } from "./package-root.js";
import { getSystemMarkerPath, resolveRuntimeDir } from "./runtime-dir.js";

export const INSTALL_USAGE =
  "Usage: dysflow install [--runtime-dir <dir>] [--agents <codex,opencode,claude,pi>] [--agent-all] [--no-tui]";
const UPDATE_USAGE = "Usage: dysflow update [--runtime-dir <dir>] [--force]";

export type InstallOptions = {
  runtimeDir?: string;
  agentNames: AgentName[];
  interactive: boolean;
};

type UpdateOptions = {
  runtimeDir?: string;
  force: boolean;
  skipChecksum: boolean;
};

export function parseAgentList(
  raw: string | undefined,
): { ok: true; agents: AgentName[] } | { ok: false; message: string } {
  if (raw === undefined) {
    return { ok: true, agents: [] };
  }

  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  const unknown = names.filter((name) => !ALL_AGENTS.includes(name as AgentName));

  if (unknown.length > 0) {
    return { ok: false, message: `Unknown agent(s): ${unknown.join(", ")}.` };
  }

  return { ok: true, agents: Array.from(new Set(names as AgentName[])) };
}

export function parseInstallArgs(
  args: readonly string[],
): { ok: true; options: InstallOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: INSTALL_USAGE };
  }

  const parsed = parseNamedArgs({
    specs: [
      { name: "--runtime-dir", type: "string" },
      { name: "--agents", type: "string" },
      { name: "--agent-all", type: "boolean" },
      { name: "--no-tui", type: "boolean" },
    ],
    args,
    onUnknown: (arg) => `Unsupported install option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  const agentAll = parsed.values["--agent-all"] === true;
  const noTui = parsed.values["--no-tui"] === true;
  const rawAgents = parsed.values["--agents"] as string | undefined;

  let agentNames: AgentName[] = [];
  let interactive = true;

  if (rawAgents !== undefined) {
    const parsedAgents = parseAgentList(rawAgents);
    if (!parsedAgents.ok) {
      return { ok: false, message: parsedAgents.message };
    }
    agentNames = parsedAgents.agents;
    interactive = false;
  }

  if (agentAll) {
    interactive = false;
    agentNames = [...ALL_AGENTS];
  }

  if (noTui) {
    interactive = false;
  }

  return {
    ok: true,
    options: {
      runtimeDir: parsed.values["--runtime-dir"] as string | undefined,
      agentNames,
      interactive,
    },
  };
}

export function parseUpdateArgs(
  args: readonly string[],
): { ok: true; options: UpdateOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: UPDATE_USAGE };
  }

  const parsed = parseNamedArgs({
    specs: [
      { name: "--runtime-dir", type: "string" },
      { name: "--force", type: "boolean" },
      { name: "--skip-checksum", type: "boolean" },
    ],
    args,
    onUnknown: (arg) => `Unsupported update option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  return {
    ok: true,
    options: {
      runtimeDir: parsed.values["--runtime-dir"] as string | undefined,
      force: parsed.values["--force"] === true,
      skipChecksum: parsed.values["--skip-checksum"] === true,
    },
  };
}

async function readPackageJsonVersion(packagePath: string): Promise<string | undefined> {
  const raw = await readFile(packagePath, "utf8").catch(() => undefined);
  if (raw === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function createNoUpdateReport(runtimeDir: string, localVersion: string): string {
  return `Dysflow runtime is up to date and already at the latest version: v${localVersion} (at ${runtimeDir}).`;
}

export async function handleUpdateCommand(
  args: readonly string[],
  context: {
    env?: NodeJS.ProcessEnv;
    releaseUpdateProvider?: ReleaseUpdateProvider;
    packageRoot?: string;
  } = {},
): Promise<CliResult> {
  const parsed = parseUpdateArgs(args);
  if (!parsed.ok) {
    const isUsage = parsed.message === UPDATE_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? UPDATE_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const env = context.env ?? process.env;

  // Guard: --skip-checksum requires explicit opt-in
  if (parsed.options.skipChecksum) {
    const allowInsecure = env.DYSFLOW_ALLOW_INSECURE_UPDATE;
    const isAllowed =
      allowInsecure !== undefined &&
      (allowInsecure === "1" || allowInsecure.toLowerCase() === "true");
    if (!isAllowed) {
      return {
        exitCode: 1,
        stdout: "",
        stderr:
          "Refusing --skip-checksum without DYSFLOW_ALLOW_INSECURE_UPDATE=1. " +
          "See docs/security/update-trust-model.md.",
      };
    }
    // Warn when the skip is actually applied
    console.warn(
      "[WARN] --skip-checksum is active: SHA-256 verification is bypassed. " +
        "Set DYSFLOW_ALLOW_INSECURE_UPDATE=1 only in development/testing environments.",
    );
  }

  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const localPackageRoot = context.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, localPackageRoot);

  const installedVersion = await readPackageJsonVersion(runtimePaths.packageJsonDest);
  const provider = context.releaseUpdateProvider ?? createGitHubReleaseUpdateProvider();

  let latestRelease: ReleaseInfo;
  try {
    latestRelease = await provider.resolveLatestRelease();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve latest release.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Failed to update Dysflow runtime: ${message}`,
    };
  }

  const isUpdateNeeded =
    parsed.options.force ||
    installedVersion === undefined ||
    compareVersions(latestRelease.version, installedVersion) > 0;

  if (!isUpdateNeeded) {
    // Even when up to date, persist the marker so that future update calls
    // (without --runtime-dir) can still discover this runtime directory.
    await writeRuntimeMarker(getSystemMarkerPath(env), runtimeDir);
    return {
      exitCode: 0,
      stdout: createNoUpdateReport(runtimeDir, latestRelease.version),
      stderr: "",
    };
  }

  const previousVersion = installedVersion ?? "not installed";
  let preparedPackage: PreparedReleasePackage | undefined;
  try {
    preparedPackage = await provider.preparePackage(latestRelease, {
      skipChecksum: parsed.options.skipChecksum,
      env,
    });
    const releaseRuntimePaths = resolveRuntimePaths(runtimeDir, preparedPackage.packageRoot);
    await installRuntime(releaseRuntimePaths, preparedPackage.packageRoot, env);
    const previousVersionStr =
      installedVersion !== undefined ? `v${installedVersion}` : "none (not installed)";
    const latestVersionStr = `v${latestRelease.version}`;
    return {
      exitCode: 0,
      stdout:
        `Dysflow runtime update: upgrading from ${previousVersionStr} to ${latestVersionStr} (${previousVersion} -> ${latestRelease.version})\n` +
        (preparedPackage.commitSha === undefined
          ? ""
          : `Installed release commit: ${preparedPackage.commitSha}\n`) +
        createInstallReport(runtimeDir, []),
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update Dysflow runtime.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Failed to update Dysflow runtime: ${message}`,
    };
  } finally {
    await preparedPackage?.cleanup?.();
  }
}
