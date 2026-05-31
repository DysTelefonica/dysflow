/**
 * Diagnostic helper that detects when the OpenCode `dysflow` MCP `command`
 * points to a file that does not exist on disk.
 *
 * Design constraints:
 * - Pure function — no direct fs or process imports; all I/O is injected.
 * - warn-only semantics: a dead entrypoint is surfaced as `ok: false` but
 *   flagged `warnOnly: true` so callers can render a ⚠ line without flipping
 *   the process exit code.
 */

/** Subset of an OpenCode config relevant to MCP wiring. */
type OpencodeConfig = {
  mcp?: Record<string, { command?: unknown }>;
};

/**
 * A diagnostic check result extended with a `warnOnly` flag used by the
 * doctor formatter to emit ⚠ instead of ✗ without changing exit code.
 */
export type McpWiringCheck = {
  name: "opencode-mcp-wiring";
  ok: boolean;
  message: string;
  warnOnly: boolean;
};

export type OpencodeMcpWiringOptions = {
  /** Absolute path to the global OpenCode config (e.g. ~/.config/opencode/opencode.json). */
  globalConfigPath: string;
  /** Absolute path to a project-local opencode.json in the current working directory. */
  projectConfigPath: string;
  /**
   * Reads and parses a JSON file.  Returns `{}` if the file does not exist or
   * cannot be parsed — callers should not throw.
   */
  readJsonFile: (filePath: string) => Promise<Record<string, unknown>>;
  /**
   * Synchronous existence check (injectable for unit tests; use
   * `fs.existsSync` in production).
   */
  existsSync: (filePath: string) => boolean;
};

/**
 * Resolves which file the given `command` array would actually execute.
 *
 * Rules:
 * - If command[0] ends with .cmd / .ps1 / .exe → that is the entrypoint.
 * - If command[0] is "node" or "node.exe" → command[1] is the script.
 * - Otherwise → command[0] is the entrypoint.
 */
function resolveEntrypoint(command: string[]): string | null {
  if (command.length === 0) return null;
  const exe = command[0];
  const lowerExe = exe.toLowerCase();
  // node / node.exe is the interpreter — the actual entrypoint is the next arg.
  if (lowerExe === "node" || lowerExe === "node.exe") {
    return command[1] ?? null;
  }
  // Explicit Windows binary / shim extensions that ARE the entrypoint.
  if (lowerExe.endsWith(".cmd") || lowerExe.endsWith(".ps1") || lowerExe.endsWith(".exe")) {
    return exe;
  }
  return exe;
}

function parseMcpBlock(raw: Record<string, unknown>): OpencodeConfig["mcp"] {
  if (typeof raw.mcp === "object" && raw.mcp !== null && !Array.isArray(raw.mcp)) {
    return raw.mcp as OpencodeConfig["mcp"];
  }
  return undefined;
}

function extractDysflowCommand(raw: Record<string, unknown>): string[] | null {
  const mcp = parseMcpBlock(raw);
  if (!mcp) return null;
  const entry = mcp.dysflow;
  if (!entry) return null;
  if (!Array.isArray(entry.command)) return null;
  return entry.command as string[];
}

/**
 * Checks whether the effective OpenCode `dysflow` MCP `command` points to a
 * file that actually exists.
 *
 * Returns `null` when the dysflow block is absent (silent pass) or when the
 * entrypoint exists (healthy).  Returns a `McpWiringCheck` with `ok: false`
 * and `warnOnly: true` when a dead entrypoint is detected.
 */
export async function checkOpencodeWiring(
  options: OpencodeMcpWiringOptions,
): Promise<McpWiringCheck | null> {
  const { globalConfigPath, projectConfigPath, readJsonFile, existsSync } = options;

  const [globalRaw, projectRaw] = await Promise.all([
    readJsonFile(globalConfigPath),
    readJsonFile(projectConfigPath),
  ]);

  // Project-local wins (mirrors OpenCode merge: local overrides global).
  const projectCommand = extractDysflowCommand(projectRaw);
  const globalCommand = extractDysflowCommand(globalRaw);

  const effectiveCommand = projectCommand ?? globalCommand;
  if (effectiveCommand === null) {
    // No dysflow block in either config — silent pass.
    return null;
  }

  const sourceFile = projectCommand !== null ? projectConfigPath : globalConfigPath;

  const entrypoint = resolveEntrypoint(effectiveCommand);
  if (entrypoint === null) {
    // No entrypoint to validate — cannot check, skip silently.
    return null;
  }

  if (existsSync(entrypoint)) {
    return null;
  }

  return {
    name: "opencode-mcp-wiring",
    ok: false,
    message: `OpenCode dysflow MCP command points to a missing file: "${entrypoint}" (from ${sourceFile})`,
    warnOnly: true,
  };
}
