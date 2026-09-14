import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { logSwallowedIoError } from "../../../core/utils/log-swallowed-io-error.js";
import type { AgentConfigPaths, AgentName } from "./agent-config.js";
import {
  ensureObject,
  fileExists,
  readJson,
  writeFileAtomically,
  writeJson,
} from "./file-utils.js";

type PiIntegrationInput = {
  mcpConfigPath: string;
  commandPath: string;
  mode?: "install" | "remove";
};

type PiIntegrationResult = {
  status: "added" | "changed" | "unchanged";
  active: boolean;
};

export type PiIntegrationSnapshot = { existed: false } | { existed: true; content: string };

export async function capturePiIntegration(mcpConfigPath: string): Promise<PiIntegrationSnapshot> {
  try {
    return { existed: true, content: await readFile(mcpConfigPath, "utf8") };
  } catch (error) {
    if (isMissingPathError(error)) return { existed: false };
    throw error;
  }
}

export async function restorePiIntegration(
  mcpConfigPath: string,
  snapshot: PiIntegrationSnapshot,
): Promise<void> {
  if (snapshot.existed) {
    await writeFileAtomically(mcpConfigPath, snapshot.content);
    return;
  }
  await rm(mcpConfigPath, { force: true });
}

function normalizedLocalSource(source: string): string {
  const normalized = path.resolve(source).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isManagedPiMcpEntry(entry: Record<string, unknown>, commandPath: string): boolean {
  const isLegacyBareEntry = entry.command === "dysflow" && entry.args === undefined;
  const hasManagedArgs =
    Array.isArray(entry.args) && entry.args.length === 1 && entry.args[0] === "mcp";
  if (!isLegacyBareEntry && !hasManagedArgs) return false;
  if (entry.command === "dysflow") return true;
  if (typeof entry.command !== "string") return false;
  return normalizedLocalSource(entry.command) === normalizedLocalSource(commandPath);
}

function requireObject(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export async function reconcilePiIntegration(
  input: PiIntegrationInput,
): Promise<PiIntegrationResult> {
  const mode = input.mode ?? "install";
  const root = await readJson(input.mcpConfigPath);
  const servers =
    root.mcpServers === undefined ? {} : requireObject(root.mcpServers, "Pi mcpServers");
  const existing = servers.dysflow;

  if (mode === "remove") {
    if (
      typeof existing !== "object" ||
      existing === null ||
      Array.isArray(existing) ||
      !isManagedPiMcpEntry(existing as Record<string, unknown>, input.commandPath)
    ) {
      return { status: "unchanged", active: existing !== undefined };
    }
    delete servers.dysflow;
    root.mcpServers = servers;
    await writeJson(input.mcpConfigPath, root);
    return { status: "changed", active: false };
  }

  if (existing !== undefined) {
    const entry = requireObject(existing, "Pi Dysflow MCP entry");
    if (!isManagedPiMcpEntry(entry, input.commandPath)) {
      throw new Error(
        "Pi already has a foreign MCP entry named dysflow; Dysflow left Pi configuration unchanged.",
      );
    }
    let changed = false;
    if (entry.command !== input.commandPath) {
      entry.command = input.commandPath;
      changed = true;
    }
    if (entry.directTools !== false) {
      entry.directTools = false;
      changed = true;
    }
    if (changed) await writeJson(input.mcpConfigPath, root);
    return { status: changed ? "changed" : "unchanged", active: true };
  }

  servers.dysflow = {
    command: input.commandPath,
    args: ["mcp"],
    directTools: false,
    type: "local",
    lifecycle: "lazy",
  };
  root.mcpServers = servers;
  await writeJson(input.mcpConfigPath, root);
  return { status: "added", active: true };
}

export async function hasPiIntegration(
  mcpConfigPath: string,
  commandPath: string,
): Promise<boolean> {
  const root = await readJson(mcpConfigPath);
  const servers =
    typeof root.mcpServers === "object" &&
    root.mcpServers !== null &&
    !Array.isArray(root.mcpServers)
      ? (root.mcpServers as Record<string, unknown>)
      : {};
  const entry = servers.dysflow;
  return (
    typeof entry === "object" &&
    entry !== null &&
    !Array.isArray(entry) &&
    isManagedPiMcpEntry(entry as Record<string, unknown>, commandPath)
  );
}

export async function hasDysflowMcpConfig(agent: AgentName, filePath: string): Promise<boolean> {
  if (agent === "codex") {
    const raw = await readFile(filePath, "utf8").catch((err: unknown) => {
      if (isMissingPathError(err)) return "";
      logSwallowedIoError("mcp-configurator:has-dysflow-mcp-config", err);
      return "";
    });
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .some((line) => line.trim() === "[mcp_servers.dysflow]");
  }

  const root = await readJson(filePath);
  const container = agent === "opencode" ? ensureObject(root.mcp) : ensureObject(root.mcpServers);
  return container.dysflow !== undefined;
}

export function replaceCodexMcpSection(content: string, commandPath: string): string {
  const normalized = commandPath.replaceAll("\\", "/");
  const sectionHeader = "[mcp_servers.dysflow]";
  const replacementLines = [
    sectionHeader,
    `command = '${normalized}'`,
    `args = ["mcp"]`,
    "startup_timeout_sec = 60.0",
    "",
  ];

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === sectionHeader);

  if (start === -1) {
    return `${lines.join("\n").trimEnd()}\n\n${replacementLines.join("\n").trimEnd()}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine === undefined) continue;
    const line = rawLine.trim();
    if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1);
      if (!sectionName.startsWith("mcp_servers.dysflow")) {
        end = index;
        break;
      }
    }
  }

  const updated = [...lines.slice(0, start), ...replacementLines, ...lines.slice(end)];
  return `${updated.join("\n").trimEnd()}\n`;
}

async function configureCodex(filePath: string, commandPath: string): Promise<void> {
  const raw = await readFile(filePath, "utf8").catch((err: unknown) => {
    if (isMissingPathError(err)) return "";
    logSwallowedIoError("mcp-configurator:configure-codex", err);
    return "";
  });
  const updated = replaceCodexMcpSection(raw, commandPath);
  await writeFileAtomically(filePath, updated);
}

function isMissingPathError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

async function configureOpencode(filePath: string, command: readonly string[]): Promise<void> {
  const root = await readJson(filePath);
  const mcp = ensureObject(root.mcp);
  mcp.dysflow = {
    enabled: true,
    type: "local",
    command: [...command],
  };
  root.mcp = mcp;
  await writeJson(filePath, root);
}

async function configureClaude(filePath: string, commandPath: string): Promise<void> {
  const root = await readJson(filePath);
  const mcpServers = ensureObject(root.mcpServers);
  mcpServers.dysflow = { command: commandPath, args: ["mcp"] };
  root.mcpServers = mcpServers;
  await writeJson(filePath, root);
}

export async function resolveClaudeConfigPath(
  paths: Pick<AgentConfigPaths, "claudeDesktop" | "claudeSettings">,
): Promise<string> {
  if (await fileExists(paths.claudeSettings)) {
    return paths.claudeSettings;
  }

  if (await fileExists(paths.claudeDesktop)) {
    return paths.claudeDesktop;
  }

  return paths.claudeSettings;
}

export async function opencodeCommandForConfig(runtimeDir: string): Promise<string[]> {
  const launcher = path.join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
  const normalizedLauncher = launcher.replaceAll("\\", "/");
  const entrypoint = path.join(runtimeDir, "app", "dist", "cli", "index.js");
  const normalizedEntrypoint = entrypoint.replaceAll("\\", "/");

  if (!(await fileExists(launcher))) {
    throw new Error(
      `Cannot configure OpenCode MCP: runtime launcher not found at ${normalizedLauncher}.`,
    );
  }
  if (!(await fileExists(entrypoint))) {
    throw new Error(
      `Cannot configure OpenCode MCP: runtime entrypoint not found at ${normalizedEntrypoint}.`,
    );
  }

  return [normalizedLauncher, "mcp"];
}

export async function configureAgent(
  agent: AgentName,
  agentConfigPaths: AgentConfigPaths,
  commandPath: string,
  runtimeDir: string,
): Promise<{
  agent: AgentName;
  configPath: string;
  status: "added" | "changed" | "unchanged";
  active: boolean;
}> {
  const configPath =
    agent === "codex"
      ? agentConfigPaths.codex
      : agent === "opencode"
        ? agentConfigPaths.opencode
        : agent === "claude"
          ? await resolveClaudeConfigPath(agentConfigPaths)
          : agentConfigPaths.pi;

  if (agent === "pi") {
    const result = await reconcilePiIntegration({
      mcpConfigPath: configPath,
      commandPath,
    });
    return { agent, configPath, ...result };
  }

  const wasActive = await hasDysflowMcpConfig(agent, configPath);
  const before = await readFile(configPath, "utf8").catch(() => undefined);

  if (agent === "codex") await configureCodex(configPath, commandPath);
  if (agent === "opencode") {
    await configureOpencode(configPath, await opencodeCommandForConfig(runtimeDir));
  }
  if (agent === "claude") await configureClaude(configPath, commandPath);

  const after = await readFile(configPath, "utf8");
  return {
    agent,
    configPath,
    status: !wasActive ? "added" : before === after ? "unchanged" : "changed",
    active: await hasDysflowMcpConfig(agent, configPath),
  };
}
