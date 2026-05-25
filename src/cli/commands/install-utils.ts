import { execFile } from "node:child_process";
import { constants, readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_SUBPROCESS_BUFFER_BYTES = 10 * 1024 * 1024;
export const RUNTIME_MARKER_FILE = ".dysflow-marker";
export const RUNTIME_MARKER_VERSION = "1";
export const RUNTIME_MARKER_PATH_ENV = "DYSFLOW_RUNTIME_MARKER_PATH";

export type AgentName = "codex" | "opencode" | "claude" | "pi";
export const ALL_AGENTS = ["codex", "opencode", "claude", "pi"] as const;

export type AgentConfigPaths = {
  codex: string;
  opencode: string;
  claudeDesktop: string;
  claudeSettings: string;
  pi: string;
};

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function ensureObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, "utf8").catch(() => "{}");
  try {
    const parsed = JSON.parse(raw);
    return ensureObject(parsed);
  } catch {
    return {};
  }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createCommandError(command: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${command} failed: ${error.message}`);
  }
  return new Error(`${command} failed.`);
}

export async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    await execFileAsync(execCmd, execArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
      shell: false,
    });
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}

export async function runCommandOutput(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    const { stdout } = await execFileAsync(execCmd, execArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
      shell: false,
    });
    return String(stdout).trim();
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}

export function getSystemMarkerPath(env: NodeJS.ProcessEnv): string {
  const explicitMarkerPath = env[RUNTIME_MARKER_PATH_ENV];
  if (explicitMarkerPath !== undefined && explicitMarkerPath.trim().length > 0) {
    return path.resolve(explicitMarkerPath);
  }

  const programData = env.ProgramData ?? path.join(env.SystemDrive ?? "C:", "ProgramData");
  return path.join(programData, "dysflow", RUNTIME_MARKER_FILE);
}

export function parseRuntimeMarker(content: string): string | undefined {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return undefined;
  if (lines[0] === RUNTIME_MARKER_VERSION) return lines[1];
  return lines[0];
}

export function resolveRuntimeDir(
  runtimeOverride: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (runtimeOverride !== undefined) {
    return path.resolve(runtimeOverride);
  }

  if (env.DYSFLOW_HOME !== undefined && env.DYSFLOW_HOME.trim().length > 0) {
    return path.resolve(env.DYSFLOW_HOME);
  }

  const markerPath = getSystemMarkerPath(env);
  try {
    const markedRuntimeDir = parseRuntimeMarker(readFileSync(markerPath, "utf8"));
    if (markedRuntimeDir !== undefined) {
      return path.resolve(markedRuntimeDir);
    }
  } catch {
    // Marker not found or unreadable — fall through to default
  }

  const localAppData =
    env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? env.HOME ?? "", "AppData", "Local");

  return path.join(localAppData, "dysflow");
}

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

export async function removeDysflowMcpConfig(agent: AgentName, filePath: string): Promise<void> {
  if (!(await fileExists(filePath))) return;

  if (agent === "codex") {
    const raw = await readFile(filePath, "utf8");
    const updated = removeCodexMcpSection(raw);
    if (updated === raw) return;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, updated, "utf8");
    return;
  }

  const root = await readJson(filePath);
  const key = agent === "opencode" ? "mcp" : "mcpServers";
  const container = ensureObject(root[key]);
  if (container.dysflow === undefined) return;
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
