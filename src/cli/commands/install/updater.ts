import { readFile } from "node:fs/promises";
import { compareVersions } from "../../../core/utils/version.js";
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

  const options: InstallOptions = {
    agentNames: [],
    interactive: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runtime-dir") {
      const runtimeDir = args[index + 1];
      if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
        return { ok: false, message: "Missing value for --runtime-dir." };
      }
      options.runtimeDir = runtimeDir;
      index += 1;
      continue;
    }

    if (arg === "--agents") {
      const parsed = parseAgentList(args[index + 1]);
      if (!parsed.ok) {
        return { ok: false, message: parsed.message };
      }
      options.agentNames = parsed.agents;
      options.interactive = false;
      index += 1;
      continue;
    }

    if (arg === "--agent-all") {
      options.interactive = false;
      options.agentNames = [...ALL_AGENTS];
      continue;
    }

    if (arg === "--no-tui") {
      options.interactive = false;
      continue;
    }

    return { ok: false, message: `Unsupported install option: ${arg}` };
  }

  return { ok: true, options };
}

export function parseUpdateArgs(
  args: readonly string[],
): { ok: true; options: UpdateOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: UPDATE_USAGE };
  }

  const options: UpdateOptions = {
    runtimeDir: undefined,
    force: false,
    skipChecksum: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runtime-dir") {
      const runtimeDir = args[index + 1];
      if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
        return { ok: false, message: "Missing value for --runtime-dir." };
      }
      options.runtimeDir = runtimeDir;
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--skip-checksum") {
      options.skipChecksum = true;
      continue;
    }

    return { ok: false, message: `Unsupported update option: ${arg}` };
  }

  return { ok: true, options };
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
