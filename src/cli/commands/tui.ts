import { installEditorMcp, renderTuiHome, type AiEditorId } from "../../core/services/ai-editor-installer.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleTuiCommand(args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    return { exitCode: 0, stdout: renderTuiHome(), stderr: "" };
  }

  if (subcommand !== "install-mcp") {
    return { exitCode: 1, stdout: "", stderr: `Unsupported tui command: ${subcommand}` };
  }

  const parsed = parseInstallArgs(rest, context.env ?? process.env);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: "", stderr: parsed.error };
  }

  const result = await installEditorMcp({ ...parsed.value, fileSystem: context.fileSystem });
  return {
    exitCode: 0,
    stdout: [
      result.message,
      `Config: ${result.configPath}`,
      result.dryRun || result.manual ? result.content.trimEnd() : "",
    ].filter(Boolean).join("\n"),
    stderr: "",
  };
}

type ParsedInstallArgs = {
  editor: AiEditorId;
  homeDir?: string;
  command: string;
  dryRun: boolean;
};

function parseInstallArgs(args: readonly string[], env: Record<string, string | undefined>): { ok: true; value: ParsedInstallArgs } | { ok: false; error: string } {
  let editor: AiEditorId | undefined;
  let homeDir: string | undefined;
  let command = env.DYSFLOW_COMMAND_PATH ?? defaultCommandPath(env);
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--editor") {
      editor = args[++i] as AiEditorId | undefined;
      continue;
    }
    if (arg === "--home") {
      homeDir = args[++i];
      continue;
    }
    if (arg === "--command") {
      command = args[++i] ?? "";
      continue;
    }
    return { ok: false, error: `Unsupported install-mcp argument: ${arg}` };
  }

  if (editor === undefined) {
    return { ok: false, error: "Missing --editor <opencode|codex|claude-code|pi|gemini-cli|cursor|windsurf>" };
  }
  if (command.trim().length === 0) {
    return { ok: false, error: "Missing Dysflow command path. Pass --command or set DYSFLOW_COMMAND_PATH/DYSFLOW_HOME." };
  }

  return { ok: true, value: { editor, homeDir, command, dryRun } };
}

function defaultCommandPath(env: Record<string, string | undefined>): string {
  const home = env.DYSFLOW_HOME;
  if (home !== undefined && home.trim().length > 0) {
    return `${home.replace(/\\/g, "/")}/bin/dysflow.cmd`;
  }
  return "dysflow";
}
