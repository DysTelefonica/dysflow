import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ensureObject, fileExists, readJson, writeJson, writeFileAtomically } from "./file-utils.js";

export type AgentName = "codex" | "opencode" | "claude" | "pi";
export const ALL_AGENTS = ["codex", "opencode", "claude", "pi"] as const;

export type AgentConfigPaths = {
  codex: string;
  opencode: string;
  claudeDesktop: string;
  claudeSettings: string;
  pi: string;
};

export function getHome(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE ?? env.HOME ?? env.USER ?? "";
}

export function resolveAgentConfigPaths(home: string): AgentConfigPaths {
  return {
    codex: path.join(home, ".codex", "config.toml"),
    opencode: path.join(home, ".config", "opencode", "opencode.json"),
    claudeDesktop: path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    claudeSettings: path.join(home, ".claude", "settings.json"),
    pi: path.join(home, ".pi", "agent", "mcp.json"),
  };
}

export function isDysflowOwned(command: unknown): boolean {
  if (typeof command === "string") {
    const normalized = command.toLowerCase().replace(/\\/g, "/");
    return (
      normalized.endsWith("/dysflow.cmd") ||
      normalized.endsWith("/dysflow") ||
      normalized.endsWith("/dysflow.exe") ||
      normalized === "dysflow" ||
      normalized.includes("/dysflow/") ||
      normalized.includes("/.gemini/antigravity-cli/")
    );
  }
  if (Array.isArray(command)) {
    return command.some((item) => isDysflowOwned(item));
  }
  return false;
}

export function isCodexSectionDysflowOwned(content: string): boolean {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sectionHeader = "[mcp_servers.dysflow]";
  const start = lines.findIndex((line) => line.trim() === sectionHeader);
  if (start === -1) return false;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1);
      if (!sectionName.startsWith("mcp_servers.dysflow")) {
        end = index;
        break;
      }
    }
  }

  const sectionLines = lines.slice(start + 1, end);
  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("command")) {
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const val = parts.slice(1).join("=").trim().replace(/['"]/g, "");
        if (isDysflowOwned(val)) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function removeDysflowMcpConfig(agent: AgentName, filePath: string): Promise<void> {
  if (!(await fileExists(filePath))) return;

  if (agent === "codex") {
    const raw = await readFile(filePath, "utf8");
    if (!isCodexSectionDysflowOwned(raw)) return;
    const updated = removeCodexMcpSection(raw);
    if (updated === raw) return;
    await writeFileAtomically(filePath, updated);
    return;
  }

  const root = await readJson(filePath);
  const key = agent === "opencode" ? "mcp" : "mcpServers";
  const container = ensureObject(root[key]);
  if (container.dysflow === undefined) return;

  const entry = container.dysflow;
  let cmd: unknown = undefined;
  if (typeof entry === "object" && entry !== null) {
    cmd = (entry as Record<string, unknown>).command;
  }
  if (!isDysflowOwned(cmd)) return;

  delete container.dysflow;
  root[key] = container;
  await writeJson(filePath, root);
}

export function removeCodexMcpSection(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sectionHeader = "[mcp_servers.dysflow]";
  const start = lines.findIndex((line) => line.trim() === sectionHeader);
  if (start === -1) return `${lines.join("\n").trimEnd()}\n`;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1);
      if (!sectionName.startsWith("mcp_servers.dysflow")) {
        end = index;
        break;
      }
    }
  }

  return `${[...lines.slice(0, start), ...lines.slice(end)].join("\n").trimEnd()}\n`;
}

export async function removeAgentConfig(
  agent: AgentName,
  agentConfigPaths: AgentConfigPaths,
): Promise<void> {
  if (agent === "codex") {
    await removeDysflowMcpConfig(agent, agentConfigPaths.codex);
    return;
  }
  if (agent === "opencode") {
    await removeDysflowMcpConfig(agent, agentConfigPaths.opencode);
    return;
  }
  if (agent === "claude") {
    await removeDysflowMcpConfig(agent, agentConfigPaths.claudeSettings);
    await removeDysflowMcpConfig(agent, agentConfigPaths.claudeDesktop);
    return;
  }
  await removeDysflowMcpConfig(agent, agentConfigPaths.pi);
}
