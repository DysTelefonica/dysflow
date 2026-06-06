import path from "node:path";
import { createInterface } from "node:readline/promises";
import { createInstallReport, installRuntime, resolveRuntimePaths } from "./install/extractor.js";
import { configureAgent } from "./install/mcp-configurator.js";
import { resolvePackageRoot } from "./install/package-root.js";
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
  PreparedReleasePackage,
  ReleaseInfo,
  ReleaseUpdateProvider,
} from "./install/downloader.js";
export {
  createGitHubReleaseRequestHeaders,
  createGitHubReleaseUpdateProvider,
  validateReleaseTagName,
} from "./install/downloader.js";

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
    await installRuntime(runtimePaths, packageRoot, env);
    for (const agent of ALL_AGENTS) {
      if (selected.has(agent)) {
        await configureAgent(agent, agentConfigPaths, commandPath, runtimeDir);
        continue;
      }
      try {
        await removeAgentConfig(agent, agentConfigPaths);
      } catch {
        // Ignore cleanup failures for unselected agents
      }
    }
    return {
      exitCode: 0,
      stdout: createInstallReport(runtimeDir, [...selected]),
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

export async function handleInstallCommand(
  args: readonly string[],
  context: { env?: NodeJS.ProcessEnv; packageRoot?: string } = {},
): Promise<CliResult> {
  const parsed = parseInstallArgs(args);
  if (!parsed.ok) {
    const isUsage = parsed.message === INSTALL_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? INSTALL_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const env = context.env ?? process.env;
  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const packageRoot = context.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
  const commandPath = commandPathForConfig(runtimeDir);

  try {
    let agents = parsed.options.agentNames;
    if (agents.length === 0 && parsed.options.interactive && process.stdin.isTTY) {
      agents = await selectAgentsInteractive(ALL_AGENTS);
    }

    await installRuntime(runtimePaths, packageRoot, env);

    for (const agent of agents) {
      await configureAgent(agent, agentConfigPaths, commandPath, runtimeDir);
    }

    return {
      exitCode: 0,
      stdout: createInstallReport(runtimeDir, agents),
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to install Dysflow runtime.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  }
}

export function formatAgentsLine(agents: readonly AgentName[]): string {
  return agents.length === 0 ? "(none)" : agents.join(", ");
}
