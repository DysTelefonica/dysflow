import { readFile } from "node:fs/promises";
import { compareVersions } from "../../../core/utils/version.js";
import { parseNamedArgs } from "../arg-parser.js";
import type { CliResult } from "../types.js";
import { type AgentName, ALL_AGENTS, getHome } from "./agent-config.js";
import {
  checkChannelGates,
  checkChannelPin,
  INSTALL_CHANNELS,
  type InstallChannel,
  type RequestedChannel,
  type ResolvedChannel,
  readRequestedChannel,
  resolveInstallChannel,
} from "./channel.js";
import {
  createReleaseUpdateProviderForChannel,
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
import { readInstallState, writeInstallState } from "./install-state.js";
import { resolvePackageRoot } from "./package-root.js";
import { createPluginRefreshReport, refreshBundledAgentPlugins } from "./plugin-refresher.js";
import { getSystemMarkerPath, resolveRuntimeDir } from "./runtime-dir.js";
import {
  discoverSkillTargets,
  formatSkillInstallReport,
  installBundledSkills,
  SKILL_AGENT_IDS,
  type SkillAgentId,
} from "./skills-installer.js";

const CHANNEL_USAGE = `[--channel <${INSTALL_CHANNELS.join("|")}>]`;

export const INSTALL_USAGE = `Usage: dysflow install [--runtime-dir <dir>] [--agents <codex,opencode,claude,pi>] [--agent-all] [--only <opencode,claude,codex,cursor,pi>] [--exclude <...>] ${CHANNEL_USAGE} [--no-tui] [--verbose]`;
const UPDATE_USAGE = `Usage: dysflow update [--runtime-dir <dir>] [--force] [--only <opencode,claude,codex,cursor,pi>] [--exclude <...>] ${CHANNEL_USAGE}`;

export type InstallOptions = {
  runtimeDir?: string;
  agentNames: AgentName[];
  interactive: boolean;
  verbose: boolean;
  onlySkills: SkillAgentId[];
  excludeSkills: SkillAgentId[];
  /** `--channel` / `DYSFLOW_CHANNEL`; install state is layered in by the command. */
  requestedChannel: RequestedChannel;
};

type UpdateOptions = {
  runtimeDir?: string;
  force: boolean;
  skipChecksum: boolean;
  onlySkills: SkillAgentId[];
  excludeSkills: SkillAgentId[];
  /** `--channel` / `DYSFLOW_CHANNEL`; install state is layered in by the command. */
  requestedChannel: RequestedChannel;
};

function expandEqualsOptions(args: readonly string[]): string[] {
  return args.flatMap((arg) => {
    for (const name of ["--only", "--exclude", "--channel"] as const) {
      const prefix = `${name}=`;
      if (arg.startsWith(prefix)) return [name, arg.slice(prefix.length)];
    }
    return [arg];
  });
}

function parseSkillAgentList(
  raw: string | undefined,
): { ok: true; agents: SkillAgentId[] } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, agents: [] };
  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  const unknown = names.filter((name) => !SKILL_AGENT_IDS.includes(name as SkillAgentId));
  if (unknown.length > 0) {
    return { ok: false, message: `Unknown skill adapter(s): ${unknown.join(", ")}.` };
  }
  return { ok: true, agents: Array.from(new Set(names as SkillAgentId[])) };
}

function parseSkillFilters(
  values: Record<string, unknown>,
):
  | { ok: true; onlySkills: SkillAgentId[]; excludeSkills: SkillAgentId[] }
  | { ok: false; message: string } {
  const only = parseSkillAgentList(values["--only"] as string | undefined);
  if (!only.ok) return only;
  const exclude = parseSkillAgentList(values["--exclude"] as string | undefined);
  if (!exclude.ok) return exclude;
  if (only.agents.length > 0 && exclude.agents.length > 0) {
    return { ok: false, message: "--only and --exclude cannot be combined." };
  }
  return { ok: true, onlySkills: only.agents, excludeSkills: exclude.agents };
}

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
  env: NodeJS.ProcessEnv = process.env,
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
      { name: "--verbose", type: "boolean" },
      { name: "--only", type: "string" },
      { name: "--exclude", type: "string" },
      { name: "--channel", type: "string" },
    ],
    args: expandEqualsOptions(args),
    onUnknown: (arg) => `Unsupported install option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  const skillFilters = parseSkillFilters(parsed.values);
  if (!skillFilters.ok) return skillFilters;
  const channel = readRequestedChannel(parsed.values["--channel"] as string | undefined, env);
  if (!channel.ok) return { ok: false, message: channel.message };

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
      verbose: parsed.values["--verbose"] === true,
      onlySkills: skillFilters.onlySkills,
      excludeSkills: skillFilters.excludeSkills,
      requestedChannel: channel.requested,
    },
  };
}

export function parseUpdateArgs(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; options: UpdateOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: UPDATE_USAGE };
  }

  const parsed = parseNamedArgs({
    specs: [
      { name: "--runtime-dir", type: "string" },
      { name: "--force", type: "boolean" },
      { name: "--skip-checksum", type: "boolean" },
      { name: "--only", type: "string" },
      { name: "--exclude", type: "string" },
      { name: "--channel", type: "string" },
    ],
    args: expandEqualsOptions(args),
    onUnknown: (arg) => `Unsupported update option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  const skillFilters = parseSkillFilters(parsed.values);
  if (!skillFilters.ok) return skillFilters;
  const channel = readRequestedChannel(parsed.values["--channel"] as string | undefined, env);
  if (!channel.ok) return { ok: false, message: channel.message };

  return {
    ok: true,
    options: {
      runtimeDir: parsed.values["--runtime-dir"] as string | undefined,
      force: parsed.values["--force"] === true,
      skipChecksum: parsed.values["--skip-checksum"] === true,
      onlySkills: skillFilters.onlySkills,
      excludeSkills: skillFilters.excludeSkills,
      requestedChannel: channel.requested,
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

/**
 * A non-stable channel prefixes its report so the operator can never mistake an
 * unsigned build for a signed release. The stable channel prints exactly what it
 * printed before #1521.
 */
function channelReportPrefix(resolved: ResolvedChannel): string {
  return resolved.channel === "stable"
    ? ""
    : `Dysflow install channel: ${resolved.channel} (source: ${resolved.source})\n`;
}

/** Records what is on disk now, so `update` can pin and `doctor` can report. */
async function persistInstallState(input: {
  runtimeDir: string;
  channel: InstallChannel;
  version: string;
  commitSha?: string;
}): Promise<void> {
  await writeInstallState(input.runtimeDir, {
    channel: input.channel,
    version: input.version,
    ...(input.commitSha === undefined ? {} : { commitSha: input.commitSha }),
    installedAt: new Date().toISOString(),
  });
}

export async function handleUpdateCommand(
  args: readonly string[],
  context: {
    env?: NodeJS.ProcessEnv;
    releaseUpdateProvider?: ReleaseUpdateProvider;
    createReleaseUpdateProvider?: (channel: InstallChannel) => ReleaseUpdateProvider;
    packageRoot?: string;
  } = {},
): Promise<CliResult> {
  const env = context.env ?? process.env;
  const parsed = parseUpdateArgs(args, env);
  if (!parsed.ok) {
    const isUsage = parsed.message === UPDATE_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? UPDATE_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const installState = await readInstallState(runtimeDir);
  const resolvedChannel = resolveInstallChannel(
    parsed.options.requestedChannel,
    installState?.channel,
  );

  // Channel gates run before the legacy --skip-checksum guard: combining that
  // stable-only flag with an already-unsigned channel is a contradiction, and
  // the operator deserves the specific code rather than the generic one.
  const channelGate = checkChannelGates({
    channel: resolvedChannel.channel,
    skipChecksum: parsed.options.skipChecksum,
    env,
  });
  if (!channelGate.ok) {
    return { exitCode: 1, stdout: "", stderr: channelGate.message };
  }

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

  // A runtime stays on the channel it was installed from unless the operator
  // says otherwise. Re-running update on the pinned channel is always allowed.
  const channelPin = checkChannelPin({
    requestedChannel: resolvedChannel.channel,
    persistedChannel: installState?.channel,
    force: parsed.options.force,
  });
  if (!channelPin.ok) {
    return { exitCode: 1, stdout: "", stderr: channelPin.message };
  }

  const localPackageRoot = context.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, localPackageRoot);

  const installedVersion = await readPackageJsonVersion(runtimePaths.packageJsonDest);
  const provider =
    context.releaseUpdateProvider ??
    context.createReleaseUpdateProvider?.(resolvedChannel.channel) ??
    createReleaseUpdateProviderForChannel(resolvedChannel.channel);

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

  // A rolling channel has no comparable version — `main` always overlays HEAD.
  // A channel switch always overlays too, because the installed version number
  // says nothing about which channel produced those bytes.
  const isRollingChannel = provider.isRolling === true;
  const isChannelSwitch =
    installState !== undefined && installState.channel !== resolvedChannel.channel;
  const isUpdateNeeded =
    isRollingChannel ||
    isChannelSwitch ||
    parsed.options.force ||
    installedVersion === undefined ||
    compareVersions(latestRelease.version, installedVersion) > 0;

  if (!isUpdateNeeded) {
    // Even when up to date, persist the marker so that future update calls
    // (without --runtime-dir) can still discover this runtime directory.
    try {
      await writeRuntimeMarker(getSystemMarkerPath(env), runtimeDir);
      const skillInstall = await installBundledSkills({
        bundleRoot: localPackageRoot,
        targets: discoverSkillTargets(getHome(env), {
          only: parsed.options.onlySkills,
          exclude: parsed.options.excludeSkills,
        }),
      });
      // Refresh the pin even when nothing was downloaded, so a runtime installed
      // before install state existed still records the channel it is tracking.
      await persistInstallState({
        runtimeDir,
        channel: resolvedChannel.channel,
        version: installedVersion ?? latestRelease.version,
        ...(installState?.commitSha === undefined ? {} : { commitSha: installState.commitSha }),
      });
      return {
        exitCode: 0,
        stdout: `${channelReportPrefix(resolvedChannel)}${createNoUpdateReport(runtimeDir, latestRelease.version)}\n${formatSkillInstallReport(skillInstall)}`,
        stderr: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh bundled skills.";
      return { exitCode: 1, stdout: "", stderr: `Failed to update Dysflow runtime: ${message}` };
    }
  }

  const previousVersion = installedVersion ?? "not installed";
  let preparedPackage: PreparedReleasePackage | undefined;
  try {
    preparedPackage = await provider.preparePackage(latestRelease, {
      skipChecksum: parsed.options.skipChecksum,
      env,
    });
    const releaseRuntimePaths = resolveRuntimePaths(runtimeDir, preparedPackage.packageRoot);
    const runtimeInstall = await installRuntime(
      releaseRuntimePaths,
      preparedPackage.packageRoot,
      env,
    );
    const skillInstall = await installBundledSkills({
      bundleRoot: preparedPackage.packageRoot,
      targets: discoverSkillTargets(getHome(env), {
        only: parsed.options.onlySkills,
        exclude: parsed.options.excludeSkills,
      }),
    });
    const pluginRefresh = await refreshBundledAgentPlugins(
      preparedPackage.packageRoot,
      getHome(env),
    );
    const pluginRefreshReport = createPluginRefreshReport(pluginRefresh);
    const previousVersionStr =
      installedVersion !== undefined ? `v${installedVersion}` : "none (not installed)";
    const latestVersionStr = `v${latestRelease.version}`;
    // A rolling channel installs whatever HEAD builds to; the authoritative
    // version is what actually landed on disk, not the moniker we asked for.
    const landedVersion =
      (await readPackageJsonVersion(releaseRuntimePaths.packageJsonDest)) ?? latestRelease.version;
    await persistInstallState({
      runtimeDir,
      channel: resolvedChannel.channel,
      version: landedVersion,
      ...(preparedPackage.commitSha === undefined ? {} : { commitSha: preparedPackage.commitSha }),
    });
    const upgradeLine = isRollingChannel
      ? `Dysflow runtime update: installed ${resolvedChannel.channel} channel build v${landedVersion} (unverified development build)\n`
      : `Dysflow runtime update: upgrading from ${previousVersionStr} to ${latestVersionStr} (${previousVersion} -> ${latestRelease.version})\n`;
    return {
      exitCode: 0,
      stdout:
        channelReportPrefix(resolvedChannel) +
        upgradeLine +
        (preparedPackage.commitSha === undefined
          ? ""
          : `Installed release commit: ${preparedPackage.commitSha}\n`) +
        createInstallReport(runtimeDir, [], { copiedFiles: runtimeInstall.copiedFiles }) +
        `\n${formatSkillInstallReport(skillInstall)}` +
        (pluginRefreshReport.length === 0 ? "" : `\n${pluginRefreshReport}`),
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
