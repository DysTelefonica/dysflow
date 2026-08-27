import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  checkChannelGates,
  describeChannelLines,
  type InstallChannel,
  resolveInstallChannel,
} from "./install/channel.js";
import {
  createReleaseUpdateProviderForChannel,
  type PreparedReleasePackage,
  type ReleaseUpdateProvider,
} from "./install/downloader.js";
import { createInstallReport, installRuntime, resolveRuntimePaths } from "./install/extractor.js";
import { readInstallState, writeInstallState } from "./install/install-state.js";
import { configureAgent } from "./install/mcp-configurator.js";
import { resolvePackageRoot } from "./install/package-root.js";
import {
  createPluginRefreshReport,
  refreshBundledAgentPlugins,
} from "./install/plugin-refresher.js";
import {
  discoverSkillTargets,
  formatSkillInstallReport,
  installBundledSkills,
} from "./install/skills-installer.js";
import { INSTALL_USAGE, parseInstallArgs } from "./install/updater.js";
import {
  type AgentConfigPaths,
  type AgentName,
  ALL_AGENTS,
  getHome,
  MAX_SUBPROCESS_BUFFER_BYTES,
  removeAgentConfig,
  removeDysflowMcpConfig,
  resolveAgentConfigPaths,
  resolveRuntimeDir,
} from "./install-utils.js";
import type { CliResult } from "./types.js";

export type {
  ChannelSource,
  InstallChannel,
  RequestedChannel,
  ResolvedChannel,
} from "./install/channel.js";
export {
  CHANNEL_ERROR_CODES,
  checkChannelGates,
  checkChannelPin,
  DEFAULT_INSTALL_CHANNEL,
  describeChannelLines,
  INSTALL_CHANNELS,
  readRequestedChannel,
  resolveInstallChannel,
} from "./install/channel.js";
export type {
  PreparedReleasePackage,
  ReleaseInfo,
  ReleaseUpdateProvider,
} from "./install/downloader.js";
export {
  createGitHubReleaseRequestHeaders,
  createGitHubReleaseUpdateProvider,
  createMainBranchArchiveProvider,
  createPrereleaseGitHubReleaseProvider,
  createReleaseUpdateProviderForChannel,
  createStableGitHubReleaseProvider,
  validateReleaseTagName,
} from "./install/downloader.js";
export type { InstallState } from "./install/install-state.js";
export {
  getInstallStatePath,
  INSTALL_STATE_FILE,
  readInstallState,
  writeInstallState,
} from "./install/install-state.js";

export { MAX_PACKAGE_ROOT_DEPTH } from "./install/package-root.js";
export {
  handleUpdateCommand,
  parseAgentList,
  parseInstallArgs,
  parseUpdateArgs,
} from "./install/updater.js";
export type { AgentConfigPaths, AgentName };
export {
  ALL_AGENTS,
  MAX_SUBPROCESS_BUFFER_BYTES,
  removeDysflowMcpConfig,
  resolveAgentConfigPaths,
  resolvePackageRoot,
};

function commandPathForConfig(runtimeDir: string): string {
  return path.join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
}

export { hasDysflowMcpConfig, replaceCodexMcpSection } from "./install/mcp-configurator.js";

export async function applyIntegrationSelection(
  selectedAgents: readonly AgentName[],
  options: {
    env?: NodeJS.ProcessEnv;
    runtimeDir?: string;
    packageRoot?: string;
  } = {},
): Promise<CliResult> {
  const env = options.env ?? process.env;
  const runtimeDir = resolveRuntimeDir(options.runtimeDir, env);
  const packageRoot = options.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
  const commandPath = commandPathForConfig(runtimeDir);
  const selected = new Set(selectedAgents);

  try {
    const runtimeInstall = await installRuntime(runtimePaths, packageRoot, env);
    const mcpConfigurations = [];
    for (const agent of ALL_AGENTS) {
      if (selected.has(agent)) {
        mcpConfigurations.push(
          await configureAgent(agent, agentConfigPaths, commandPath, runtimeDir),
        );
        continue;
      }
      try {
        await removeAgentConfig(agent, agentConfigPaths);
      } catch {
        // Ignore cleanup failures for unselected agents
      }
    }
    const skillInstall = await installBundledSkills({
      bundleRoot: packageRoot,
      targets: discoverSkillTargets(getHome(env), { only: selectedAgents, exclude: [] }),
    });
    const pluginRefresh = await refreshBundledAgentPlugins(
      packageRoot,
      getHome(env),
      selectedAgents.filter((agent): agent is "codex" | "opencode" | "claude" => agent !== "pi"),
    );
    return {
      exitCode: 0,
      stdout: [
        createInstallReport(runtimeDir, [...selected], {
          copiedFiles: runtimeInstall.copiedFiles,
          mcpConfigurations,
          verbose: true,
        }),
        createPluginRefreshReport(pluginRefresh, { verbose: true }),
        formatSkillInstallReport(skillInstall),
      ]
        .filter((section) => section.length > 0)
        .join("\n"),
      stderr: "",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply Dysflow integrations.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

async function selectAgentsInteractive(allowList: readonly AgentName[]): Promise<AgentName[]> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const selected: AgentName[] = [];
    for (const agent of allowList) {
      const answer = await prompt.question(`[${agent}] Install MCP integration? [y/N] `);
      if (answer.trim().toLowerCase().startsWith("y")) {
        selected.push(agent);
      }
    }
    return selected;
  } finally {
    prompt.close();
  }
}

export { writeRuntimeLaunchers } from "./install/path-configurator.js";
export {
  DYSSKILL_NAMES,
  MCP_HARNESS_VERSION,
  SKILL_AGENT_IDS,
} from "./install/skills-installer.js";

export async function handleInstallCommand(
  args: readonly string[],
  context: {
    env?: NodeJS.ProcessEnv;
    packageRoot?: string;
    createReleaseUpdateProvider?: (channel: InstallChannel) => ReleaseUpdateProvider;
  } = {},
): Promise<CliResult> {
  const env = context.env ?? process.env;
  const parsed = parseInstallArgs(args, env);
  if (!parsed.ok) {
    const isUsage = parsed.message === INSTALL_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? INSTALL_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const installState = await readInstallState(runtimeDir);
  const resolvedChannel = resolveInstallChannel(
    parsed.options.requestedChannel,
    installState?.channel,
  );
  const channelGate = checkChannelGates({ channel: resolvedChannel.channel, env });
  if (!channelGate.ok) {
    return { exitCode: 1, stdout: "", stderr: channelGate.message };
  }

  // `stable` installs the package this CLI was started from — the pre-#1521
  // behavior, and the only shape that never reaches the network. The unsigned
  // channels have no local bytes to install, so they fetch and build first.
  let preparedPackage: PreparedReleasePackage | undefined;
  let packageRoot: string;
  try {
    if (resolvedChannel.channel === "stable") {
      packageRoot = context.packageRoot ?? resolvePackageRoot();
    } else {
      const provider =
        context.createReleaseUpdateProvider?.(resolvedChannel.channel) ??
        createReleaseUpdateProviderForChannel(resolvedChannel.channel);
      const release = await provider.resolveLatestRelease();
      preparedPackage = await provider.preparePackage(release, { env });
      packageRoot = preparedPackage.packageRoot;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch the requested Dysflow channel.";
    await preparedPackage?.cleanup?.();
    return { exitCode: 1, stdout: "", stderr: message };
  }

  const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
  const commandPath = commandPathForConfig(runtimeDir);

  try {
    let agents = parsed.options.agentNames;
    if (agents.length === 0 && parsed.options.interactive && process.stdin.isTTY) {
      agents = await selectAgentsInteractive(ALL_AGENTS);
    }

    const runtimeInstall = await installRuntime(runtimePaths, packageRoot, env);

    const mcpConfigurations = [];
    for (const agent of agents) {
      mcpConfigurations.push(
        await configureAgent(agent, agentConfigPaths, commandPath, runtimeDir),
      );
    }
    const skillInstall = await installBundledSkills({
      bundleRoot: packageRoot,
      targets: discoverSkillTargets(getHome(env), {
        only: parsed.options.onlySkills,
        exclude: parsed.options.excludeSkills,
      }),
    });
    const pluginRefresh = await refreshBundledAgentPlugins(
      packageRoot,
      getHome(env),
      agents.filter((agent): agent is "codex" | "opencode" | "claude" => agent !== "pi"),
    );

    await writeInstallState(runtimeDir, {
      channel: resolvedChannel.channel,
      version: (await readInstalledVersion(runtimePaths.packageJsonDest)) ?? "unknown",
      ...(preparedPackage?.commitSha === undefined ? {} : { commitSha: preparedPackage.commitSha }),
      installedAt: new Date().toISOString(),
    });

    return {
      exitCode: 0,
      stdout: [
        // The stable channel prints exactly what it printed before #1521.
        resolvedChannel.channel === "stable"
          ? ""
          : describeChannelLines(resolvedChannel).join("\n"),
        createInstallReport(runtimeDir, agents, {
          copiedFiles: runtimeInstall.copiedFiles,
          mcpConfigurations,
          verbose: parsed.options.verbose,
        }),
        createPluginRefreshReport(pluginRefresh, { verbose: parsed.options.verbose }),
        formatSkillInstallReport(skillInstall),
      ]
        .filter((section) => section.length > 0)
        .join("\n"),
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to install Dysflow runtime.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  } finally {
    await preparedPackage?.cleanup?.();
  }
}

/** Reads the version actually written into the runtime, for install state. */
async function readInstalledVersion(packageJsonPath: string): Promise<string | undefined> {
  const raw = await readFile(packageJsonPath, "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.length > 0
      ? parsed.version
      : undefined;
  } catch {
    return undefined;
  }
}

export function formatAgentsLine(agents: readonly AgentName[]): string {
  return agents.length === 0 ? "(none)" : agents.join(", ");
}
