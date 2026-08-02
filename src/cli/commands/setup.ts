import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import {
  publishProjectConfig,
  writeRelativeProjectConfig as writeRelativeProjectConfigShared,
} from "../../adapters/config/project-config-bootstrap-service.js";
import { diagnoseProjectConfig } from "../../adapters/config/project-config-diagnostic.js";
import { type DysflowConfig, redactDysflowConfig } from "../../core/config/dysflow-config.js";
import { parseNamedArgs } from "./install-utils.js";
import type { CliCommandContext, CliResult } from "./types.js";

const HELP_TEXT =
  "Usage: dysflow setup [--cwd <path>] [--apply] [--write-project --access-path <path> --project-id <id> [--backend-path <path>]] [--set-project-id <id>] [--help]";

type SetupOptions = {
  writeProject: boolean;
  accessPath?: string;
  backendPath?: string;
  projectId?: string;
  setProjectId?: string;
  cwd?: string;
  apply: boolean;
};

export async function handleSetupCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
  }

  const parsed = parseSetupArgs(args);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: "", stderr: parsed.message };
  }

  const effectiveContext =
    parsed.options.cwd === undefined ? context : { ...context, cwd: resolve(parsed.options.cwd) };

  if (parsed.options.setProjectId !== undefined) {
    if (!parsed.options.apply)
      return {
        exitCode: 1,
        stdout: "",
        stderr: "--set-project-id requires --apply for an intentional guarded write.",
      };
    try {
      return {
        exitCode: 0,
        stdout: await updateProjectConfigId(parsed.options.setProjectId, effectiveContext),
        stderr: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update project id.";
      return { exitCode: 1, stdout: "", stderr: message };
    }
  }

  const configResult = await loadDysflowConfigAsync({
    env: context.env,
    cwd: effectiveContext.cwd,
    accessDbPath: parsed.options.accessPath,
    backendPath: parsed.options.backendPath,
    projectId: parsed.options.projectId,
  });
  if (!configResult.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${configResult.error.code}: ${configResult.error.message}`,
    };
  }

  const redacted = redactDysflowConfig(configResult.data);
  let extraOutput: string[] = [];
  if (parsed.options.writeProject || parsed.options.apply) {
    if (parsed.options.apply && parsed.options.accessPath === undefined)
      return {
        exitCode: 1,
        stdout: "",
        stderr: "--apply requires --access-path so setup cannot invent a write target.",
      };
    let writeResult: Awaited<ReturnType<typeof writeRelativeProjectConfig>>;
    try {
      writeResult = await writeRelativeProjectConfig(configResult.data, effectiveContext.cwd);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project config could not be written.";
      return {
        exitCode: 1,
        stdout: "",
        stderr: message.includes("projectId is required")
          ? `MCP_INPUT_INVALID: ${message}`
          : message,
      };
    }
    extraOutput = [writeResult.message];
  }

  return {
    exitCode: 0,
    stdout: [
      "Dysflow core configuration resolved.",
      `Access database: ${redacted.accessDbPath}`,
      `Timeout: ${redacted.timeoutMs}ms`,
      `Password: ${redacted.accessPassword ?? "(not configured)"}`,
      ...extraOutput,
    ].join("\n"),
    stderr: "",
  };
}

function parseSetupArgs(
  args: readonly string[],
): { ok: true; options: SetupOptions } | { ok: false; message: string } {
  const parsed = parseNamedArgs({
    specs: [
      { name: "--write-project", type: "boolean" },
      { name: "--apply", type: "boolean" },
      { name: "--cwd", type: "string" },
      { name: "--access-path", type: "string" },
      { name: "--backend-path", type: "string" },
      { name: "--project-id", type: "string" },
      { name: "--set-project-id", type: "string" },
    ],
    args,
    onUnknown: (arg) => `Unsupported setup option: ${arg}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  return {
    ok: true,
    options: {
      writeProject: parsed.values["--write-project"] === true,
      accessPath: parsed.values["--access-path"] as string | undefined,
      backendPath: parsed.values["--backend-path"] as string | undefined,
      projectId: parsed.values["--project-id"] as string | undefined,
      setProjectId: parsed.values["--set-project-id"] as string | undefined,
      cwd: parsed.values["--cwd"] as string | undefined,
      apply: parsed.values["--apply"] === true,
    },
  };
}

async function updateProjectConfigId(
  projectId: string,
  context: Pick<CliCommandContext, "cwd" | "env">,
): Promise<string> {
  const projectRoot = context.cwd ?? process.cwd();
  const projectPath = join(projectRoot, ".dysflow", "project.json");
  let raw: string;
  try {
    raw = await readFile(projectPath, "utf8");
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === "ENOENT") {
      raw = "{}";
    } else {
      throw error;
    }
  }
  let parsed: Record<string, unknown>;
  try {
    const val = JSON.parse(raw);
    if (typeof val !== "object" || val === null || Array.isArray(val)) {
      throw new Error("JSON value is not a plain object");
    }
    parsed = val as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid .dysflow/project.json: ${projectPath}. ${message}`);
  }
  parsed.id = projectId;
  await publishProjectConfig(projectRoot, parsed, undefined, undefined, assertWriteReady);
  return `Updated project id in .dysflow/project.json: ${projectId}`;
}

export async function writeRelativeProjectConfig(
  config: DysflowConfig,
  cwd?: string,
  beforeRename?: () => void | Promise<void>,
  afterRename?: () => void | Promise<void>,
): Promise<{ message: string; projectPath: string }> {
  return writeRelativeProjectConfigShared(config, cwd, beforeRename, afterRename, assertWriteReady);
}

function assertWriteReady(projectRoot: string, projectJson: Record<string, unknown>): void {
  const diagnostic = diagnoseProjectConfig(projectRoot, {}, projectJson);
  if (!diagnostic.writeReady) {
    throw new Error(
      `Project config is not write-ready (${diagnostic.status}). ${diagnostic.remediation ?? ""}`.trim(),
    );
  }
}
