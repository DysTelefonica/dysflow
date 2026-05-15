import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type AiEditorId = "opencode" | "codex" | "claude-code" | "pi" | "gemini-cli" | "cursor" | "windsurf";

type WritableStrategy = "opencode-json" | "codex-toml" | "manual";

type EditorDefinition = {
  id: AiEditorId;
  name: string;
  configPath: (home: string) => string;
  strategy: WritableStrategy;
  note?: string;
};

export type DysflowFileSystem = {
  readFile(path: string): Promise<string | undefined>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
};

export type InstallEditorMcpRequest = {
  editor: AiEditorId;
  homeDir?: string;
  command: string;
  dryRun?: boolean;
  fileSystem?: DysflowFileSystem;
};

export type InstallEditorMcpResult = {
  editor: AiEditorId;
  editorName: string;
  configPath: string;
  changed: boolean;
  dryRun: boolean;
  manual: boolean;
  content: string;
  message: string;
};

const EDITORS: readonly EditorDefinition[] = [
  { id: "opencode", name: "OpenCode", strategy: "opencode-json", configPath: (home) => joinPath(home, ".config", "opencode", "opencode.json") },
  { id: "codex", name: "Codex", strategy: "codex-toml", configPath: (home) => joinPath(home, ".codex", "config.toml") },
  { id: "claude-code", name: "Claude Code", strategy: "manual", configPath: (home) => joinPath(home, ".claude", "mcp", "dysflow.json"), note: "Claude Code uses separate MCP files in the Gentle AI model; safe writer pending validation." },
  { id: "pi", name: "Pi", strategy: "manual", configPath: (home) => joinPath(home, ".pi", "agent", "mcp.json"), note: "Pi uses pi-mcp-adapter; manual verification required before Dysflow writes this file automatically." },
  { id: "gemini-cli", name: "Gemini CLI", strategy: "manual", configPath: (home) => joinPath(home, ".gemini", "settings.json"), note: "Gemini CLI config shape must be validated before automatic writes are enabled." },
  { id: "cursor", name: "Cursor", strategy: "manual", configPath: (home) => joinPath(home, ".cursor", "mcp.json"), note: "Cursor support is listed for user choice; automatic writer pending validation." },
  { id: "windsurf", name: "Windsurf", strategy: "manual", configPath: (home) => joinPath(home, ".codeium", "windsurf", "mcp.json"), note: "Windsurf support is listed for user choice; automatic writer pending validation." },
];

export function listAiEditorInstallTargets(): readonly EditorDefinition[] {
  return EDITORS;
}

export async function installEditorMcp(request: InstallEditorMcpRequest): Promise<InstallEditorMcpResult> {
  const editor = EDITORS.find((candidate) => candidate.id === request.editor);
  if (editor === undefined) {
    throw new Error(`Unsupported editor: ${request.editor}`);
  }

  const fs = request.fileSystem ?? nodeFileSystem;
  const home = normalizePath(request.homeDir ?? homedir());
  const configPath = normalizePath(editor.configPath(home));

  if (editor.strategy === "manual") {
    const content = JSON.stringify({ mcpServers: { dysflow: createServerConfig(request.command) } }, null, 2) + "\n";
    return {
      editor: editor.id,
      editorName: editor.name,
      configPath,
      changed: false,
      dryRun: Boolean(request.dryRun),
      manual: true,
      content,
      message: `${editor.name}: manual verification required before automatic writes. Target: ${configPath}. ${editor.note ?? ""}`.trim(),
    };
  }

  const existing = (await fs.readFile(configPath)) ?? "";
  const next = editor.strategy === "opencode-json"
    ? renderOpenCodeConfig(existing, request.command)
    : renderCodexConfig(existing, request.command);
  const changed = normalizeNewlines(existing) !== normalizeNewlines(next);

  if (!request.dryRun && changed) {
    await fs.mkdir(dirname(configPath));
    await fs.writeFile(configPath, next);
  }

  return {
    editor: editor.id,
    editorName: editor.name,
    configPath,
    changed,
    dryRun: Boolean(request.dryRun),
    manual: false,
    content: next,
    message: request.dryRun
      ? `DRY-RUN ${editor.name}: would ${changed ? "update" : "leave unchanged"} ${configPath}`
      : `${editor.name}: ${changed ? "updated" : "already configured"} ${configPath}`,
  };
}

export function renderTuiHome(): string {
  const editorList = EDITORS.map((editor) => `  - ${editor.id} (${editor.name})`).join("\n");
  return [
    "Dysflow Terminal UI",
    "",
    "Options:",
    "  1. Install Dysflow MCP into an AI editor",
    "",
    "Supported editors:",
    editorList,
    "",
    "Non-interactive usage:",
    "  dysflow tui install-mcp --editor opencode --dry-run",
    "  dysflow tui install-mcp --editor codex",
  ].join("\n");
}

function renderOpenCodeConfig(existing: string, command: string): string {
  const parsed = parseJsonObject(existing);
  const mcp = isRecord(parsed.mcp) ? parsed.mcp : {};
  parsed.mcp = { ...mcp, dysflow: { command: [command, "mcp"], type: "local" } };
  return JSON.stringify(parsed, null, 2) + "\n";
}

function renderCodexConfig(existing: string, command: string): string {
  const withoutDysflow = existing.replace(/\n?\[mcp_servers\.dysflow\]\r?\n(?:[^\[]*(?:\r?\n|$))/m, "").trimEnd();
  const section = ["[mcp_servers.dysflow]", `command = "${escapeToml(command)}"`, 'args = ["mcp"]'].join("\n");
  return `${withoutDysflow.length > 0 ? `${withoutDysflow}\n\n` : ""}${section}\n`;
}

function parseJsonObject(content: string): Record<string, unknown> {
  if (content.trim().length === 0) return {};
  const parsed = JSON.parse(content) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function createServerConfig(command: string): { command: string; args: string[] } {
  return { command, args: ["mcp"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(...parts: string[]): string {
  return normalizePath(join(...parts));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function escapeToml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const nodeFileSystem: DysflowFileSystem = {
  async readFile(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  },
  async writeFile(path, content) {
    await writeFile(path, content, "utf8");
  },
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
};
