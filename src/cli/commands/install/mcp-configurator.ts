import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type AgentConfigPaths,
  type AgentName,
  ensureObject,
  fileExists,
  readJson,
  writeJson,
} from "../install-utils.js";

export async function hasDysflowMcpConfig(agent: AgentName, filePath: string): Promise<boolean> {
  if (agent === "codex") {
    const raw = await readFile(filePath, "utf8").catch(() => "");
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
    const line = lines[index].trim();
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
  const raw = await readFile(filePath, "utf8").catch(() => "");
  const updated = replaceCodexMcpSection(raw, commandPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, updated, "utf8");
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

async function configurePi(filePath: string, commandPath: string): Promise<void> {
  const root = await readJson(filePath);
  const mcpServers = ensureObject(root.mcpServers);
  mcpServers.dysflow = {
    command: commandPath,
    args: ["mcp"],
    directTools: true,
    type: "local",
    lifecycle: "lazy",
  };
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
): Promise<void> {
  if (agent === "codex") return configureCodex(agentConfigPaths.codex, commandPath);
  if (agent === "opencode") {
    return configureOpencode(agentConfigPaths.opencode, await opencodeCommandForConfig(runtimeDir));
  }
  if (agent === "claude")
    return configureClaude(await resolveClaudeConfigPath(agentConfigPaths), commandPath);
  return configurePi(agentConfigPaths.pi, commandPath);
}
