import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ensureObject,
  fileExists,
  readJson,
  writeFileAtomically,
  writeJson,
} from "./file-utils.js";

export type AgentName = "codex" | "opencode" | "claude" | "pi";
export const ALL_AGENTS = ["codex", "opencode", "claude", "pi"] as const;

export type AgentConfigPaths = {
  codex: string;
  opencode: string;
  claudeDesktop: string;
  claudeSettings: string;
  pi: string;
  piSettings: string;
};

export function getHome(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE ?? env.HOME ?? env.USER ?? "";
}

/**
 * Resolve the directory that owns every Pi-managed artifact: MCP configuration,
 * settings, SkillsDir and the harness pointer file.
 *
 * Precedence:
 * 1. `PI_CODING_AGENT_DIR`, when set and non-blank after trimming — a
 *    Pi-compatible host uses it to select the active agent profile. The value
 *    is resolved to an absolute path.
 * 2. `<home>/.pi/agent` otherwise — the conventional Pi profile.
 */
export function resolvePiAgentDir(home: string, env: NodeJS.ProcessEnv): string {
  const configured = env.PI_CODING_AGENT_DIR?.trim() ?? "";
  if (configured.length > 0) return path.resolve(configured);
  return path.join(home, ".pi", "agent");
}

/** One Pi agent directory Dysflow reconciles, with the paths it owns there. */
export type PiProfile = {
  agentDir: string;
  /**
   * `default`: `<home>/.pi/agent`; `override`: `PI_CODING_AGENT_DIR`;
   * `gentle-shell`: the home gentle-shell launches Pi with (issue #1822).
   */
  origin: "default" | "override" | "gentle-shell";
  mcpConfigPath: string;
  settingsPath: string;
  /**
   * The environment that selects this profile for Pi itself (`pi install`) and
   * for every Dysflow helper that resolves the Pi directory from `env`.
   */
  env: NodeJS.ProcessEnv;
};

/** Set to `1`/`true` to keep install and update off the gentle-shell profile. */
export const SKIP_GENTLE_SHELL_ENV = "DYSFLOW_SKIP_GENTLE_SHELL";

function expandUserPath(value: string, home: string): string {
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(home, value.slice(2));
  return path.resolve(home, value);
}

function readGentleShellHomeSetting(home: string): string | undefined {
  const configPath = path.join(home, ".gentle-shell", "config.json");
  if (!existsSync(configPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const value = (parsed as Record<string, unknown>).home;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    // gentle-shell itself treats a malformed config as "use the default home".
    return undefined;
  }
}

/**
 * The agent directory gentle-shell launches Pi with when started without a
 * home flag, mirroring its own launcher resolution: `~/.gentle-shell/config.json`
 * `home` is `"link"` (the user's own Pi home), `"isolated"` (the default), or a
 * path; the isolated home is `GENTLE_SHELL_HOME` or `~/.gentle-shell/agent`.
 */
export function resolveGentleShellAgentDir(home: string, env: NodeJS.ProcessEnv): string {
  const setting = readGentleShellHomeSetting(home);
  if (setting === "link") {
    const userPiHome = env.GENTLE_SHELL_USER_PI_HOME?.trim() ?? "";
    return userPiHome.length > 0 ? path.resolve(userPiHome) : path.join(home, ".pi", "agent");
  }
  if (setting !== undefined && setting !== "isolated") return expandUserPath(setting, home);
  const isolated = env.GENTLE_SHELL_HOME?.trim() ?? "";
  return isolated.length > 0 ? path.resolve(isolated) : path.join(home, ".gentle-shell", "agent");
}

function samePiDir(left: string, right: string): boolean {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function piProfile(agentDir: string, origin: PiProfile["origin"], env: NodeJS.ProcessEnv) {
  return {
    agentDir,
    origin,
    mcpConfigPath: path.join(agentDir, "mcp.json"),
    settingsPath: path.join(agentDir, "settings.json"),
    env,
  } satisfies PiProfile;
}

/**
 * Every Pi agent directory install and update reconcile (issue #1822).
 *
 * The first entry is always the selected profile (`resolvePiAgentDir`) with the
 * caller's environment untouched. An explicit `PI_CODING_AGENT_DIR` selects
 * exactly that profile (#1797). Otherwise an EXISTING gentle-shell agent
 * directory that differs from the selected one is added, unless
 * `DYSFLOW_SKIP_GENTLE_SHELL` excludes it. Nothing here creates a directory.
 */
export function resolvePiProfiles(home: string, env: NodeJS.ProcessEnv): PiProfile[] {
  const override = (env.PI_CODING_AGENT_DIR?.trim() ?? "").length > 0;
  const primaryDir = resolvePiAgentDir(home, env);
  const profiles: PiProfile[] = [piProfile(primaryDir, override ? "override" : "default", env)];
  if (override || home.trim().length === 0) return profiles;
  const skip = env[SKIP_GENTLE_SHELL_ENV]?.trim().toLowerCase() ?? "";
  if (skip === "1" || skip === "true") return profiles;
  const gentleShellDir = resolveGentleShellAgentDir(home, env);
  if (samePiDir(gentleShellDir, primaryDir) || !existsSync(gentleShellDir)) return profiles;
  profiles.push(
    piProfile(gentleShellDir, "gentle-shell", { ...env, PI_CODING_AGENT_DIR: gentleShellDir }),
  );
  return profiles;
}

export function resolveAgentConfigPaths(home: string, env: NodeJS.ProcessEnv): AgentConfigPaths {
  const piAgentDir = resolvePiAgentDir(home, env);
  return {
    codex: path.join(home, ".codex", "config.toml"),
    opencode: path.join(home, ".config", "opencode", "opencode.json"),
    claudeDesktop: path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    claudeSettings: path.join(home, ".claude", "settings.json"),
    pi: path.join(piAgentDir, "mcp.json"),
    piSettings: path.join(piAgentDir, "settings.json"),
  };
}

export function isDysflowOwned(command: unknown): boolean {
  if (typeof command === "string") {
    const normalized = command.toLowerCase().replace(/\\/g, "/");
    return (
      normalized.endsWith("/dysflow.cmd") ||
      normalized.endsWith("/dysflow") ||
      normalized.endsWith("/dysflow.exe") ||
      normalized === "dysflow"
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
  let cmd: unknown;
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
