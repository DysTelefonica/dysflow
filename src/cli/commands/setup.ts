import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import { diagnoseProjectConfig } from "../../adapters/config/project-config-diagnostic.js";
import { type DysflowConfig, redactDysflowConfig } from "../../core/config/dysflow-config.js";
import { isAbsolutePath } from "../../core/utils/index.js";
import { parseNamedArgs } from "./install-utils.js";
import type { CliCommandContext, CliResult } from "./types.js";

const HELP_TEXT =
  "Usage: dysflow setup [--cwd <path>] [--apply] [--write-project --access-path <path> [--backend-path <path>] [--project-id <id>]] [--set-project-id <id>] [--help]";

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
      return {
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Project config could not be written.",
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

function toPortableProjectPath(value: string | undefined, projectRoot: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const absolutePath = isAbsolutePath(value) ? resolve(value) : resolve(projectRoot, value);
  const projectRelative = relative(projectRoot, absolutePath);
  return projectRelative.length === 0
    ? basename(absolutePath)
    : projectRelative.replaceAll("\\", "/");
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
  await publishProjectConfig(projectRoot, parsed);
  return `Updated project id in .dysflow/project.json: ${projectId}`;
}

export async function writeRelativeProjectConfig(
  config: DysflowConfig,
  cwd?: string,
  beforeRename?: () => void | Promise<void>,
  afterRename?: () => void | Promise<void>,
): Promise<{ message: string; projectPath: string }> {
  const projectRoot = cwd ?? process.cwd();
  const projectPath = join(projectRoot, ".dysflow", "project.json");
  const projectId = config.projectId ?? basename(projectRoot);
  const projectJson = {
    id: projectId,
    accessPath: toPortableProjectPath(config.accessDbPath, projectRoot),
    ...(config.backendPath === undefined
      ? {}
      : {
          backendPath: toPortableProjectPath(config.backendPath, projectRoot),
        }),
    destinationRoot: "src",
    // Scaffold the per-project timeout as an explicit, editable knob. Heavy
    // whole-project operations (verify_code / export_all)
    // on large databases can exceed the generic default; surfacing it here lets
    // the user tune it instead of silently false-timing out.
    timeoutMs: config.timeoutMs,
  };

  await mkdir(dirname(projectPath), { recursive: true });
  await publishProjectConfig(projectRoot, projectJson, beforeRename, afterRename);
  return {
    message: [
      `Wrote portable project config to ${projectPath}`,
      `Recommended: tune "timeoutMs" in .dysflow/project.json for this project — large databases and heavy whole-project operations may need more than the current ${config.timeoutMs}ms.`,
    ].join("\n"),
    projectPath,
  };
}

async function publishProjectConfig(
  projectRoot: string,
  projectJson: Record<string, unknown>,
  beforeRename?: () => void | Promise<void>,
  afterRename?: () => void | Promise<void>,
): Promise<void> {
  const projectPath = join(projectRoot, ".dysflow", "project.json");
  const diagnostic = diagnoseProjectConfig(projectRoot, {}, projectJson);
  if (!diagnostic.writeReady)
    throw new Error(
      `Project config is not write-ready (${diagnostic.status}). ${diagnostic.remediation ?? ""}`.trim(),
    );
  const temporaryPath = `${projectPath}.${process.pid}.${Date.now()}.tmp`;
  const canonicalRoot = await realpath(projectRoot);
  const canonicalParent = await realpath(dirname(projectPath));
  const owns = (candidate: string) => {
    const rel = relative(canonicalRoot, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  if (!owns(canonicalParent)) throw new Error("Project config directory is outside the worktree.");
  const previous = await readFile(projectPath, "utf8").catch(() => undefined);
  const handle = await open(temporaryPath, "wx");
  let canonicalTemporary = temporaryPath;
  let renamed = false;
  try {
    canonicalTemporary = await realpath(temporaryPath);
    if (dirname(canonicalTemporary) !== canonicalParent || !owns(canonicalTemporary))
      throw new Error("Temporary project config escaped the owned directory.");
    await handle.writeFile(`${JSON.stringify(projectJson, null, 2)}\n`, "utf8");
    await handle.sync();
    await beforeRename?.();
    if ((await realpath(dirname(projectPath))) !== canonicalParent)
      throw new Error("Project config directory ownership changed before publication.");
    await handle.close();
    await rename(temporaryPath, projectPath);
    renamed = true;
    await afterRename?.();
    if ((await realpath(projectPath)) !== join(canonicalParent, "project.json"))
      throw new Error("Published project config escaped the owned directory.");
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(canonicalTemporary, { force: true });
    const ownedProjectPath = join(canonicalParent, "project.json");
    if (renamed) {
      if (previous === undefined) {
        await rm(ownedProjectPath, { force: true });
      } else {
        const recoveryPath = `${ownedProjectPath}.${process.pid}.${Date.now()}.recovery.tmp`;
        const recovery = await open(recoveryPath, "wx");
        try {
          await recovery.writeFile(previous, "utf8");
          await recovery.sync();
          await recovery.close();
          await rename(recoveryPath, ownedProjectPath);
        } finally {
          await recovery.close().catch(() => undefined);
          await rm(recoveryPath, { force: true });
        }
      }
    }
    throw error;
  }
}
