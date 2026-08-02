import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import { isAbsolutePath } from "../../core/utils/index.js";

export type ProjectConfigCandidate = Record<string, unknown>;
export type ProjectConfigCandidateValidator = (
  projectRoot: string,
  candidate: ProjectConfigCandidate,
) => void | Promise<void>;

export type SetupProjectConfigInput = {
  frontendFile: string;
  backendPath?: string;
  projectId?: string;
  destinationRoot?: string;
  timeoutMs?: number;
  capabilities?: {
    allowWrites?: boolean;
    writeExecutionPolicy?: "safe-by-default" | "developer";
  };
};

function toPortableProjectPath(value: string | undefined, projectRoot: string): string | undefined {
  if (value === undefined) return undefined;
  const absolutePath = isAbsolutePath(value) ? resolve(value) : resolve(projectRoot, value);
  const projectRelative = relative(projectRoot, absolutePath);
  return projectRelative.length === 0
    ? basename(absolutePath)
    : projectRelative.replaceAll("\\", "/");
}

export function buildSetupProjectConfig(
  input: SetupProjectConfigInput,
  projectRoot: string,
): ProjectConfigCandidate {
  const projectId = input.projectId?.trim();
  if (projectId === undefined || projectId.length === 0) {
    throw new Error("projectId is required when no existing worktree configuration can be reused.");
  }
  const frontendFile = basename(input.frontendFile);
  if (frontendFile !== input.frontendFile) {
    throw new Error("frontendFile must be a basename located at the worktree root.");
  }
  const capabilities = {
    allowWrites: input.capabilities?.allowWrites ?? true,
    ...(input.capabilities?.writeExecutionPolicy === undefined
      ? {}
      : { writeExecutionPolicy: input.capabilities.writeExecutionPolicy }),
  };
  return {
    id: projectId,
    frontendFile,
    ...(input.backendPath === undefined
      ? {}
      : { backendPath: toPortableProjectPath(input.backendPath, projectRoot) }),
    destinationRoot: input.destinationRoot ?? "src",
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    capabilities,
  };
}

export function buildRelativeProjectConfig(
  config: DysflowConfig,
  projectRoot: string,
): ProjectConfigCandidate {
  const projectId = config.projectId?.trim();
  if (projectId === undefined || projectId.length === 0) {
    throw new Error("projectId is required when no existing project configuration can be reused.");
  }
  const frontendFile = basename(config.accessDbPath);
  const frontendRelative = toPortableProjectPath(config.accessDbPath, projectRoot);
  if (frontendRelative !== frontendFile) {
    throw new Error(
      `Frontend must be at the worktree root before writing portable config. Move it to ${join(projectRoot, frontendFile)} or pass a root frontend.`,
    );
  }
  return {
    id: projectId,
    frontendFile,
    ...(config.backendPath === undefined
      ? {}
      : { backendPath: toPortableProjectPath(config.backendPath, projectRoot) }),
    destinationRoot: "src",
    timeoutMs: config.timeoutMs,
  };
}

export async function writeRelativeProjectConfig(
  config: DysflowConfig,
  cwd?: string,
  beforeRename?: () => void | Promise<void>,
  afterRename?: () => void | Promise<void>,
  validateCandidate?: ProjectConfigCandidateValidator,
): Promise<{ message: string; projectPath: string }> {
  const projectRoot = cwd ?? process.cwd();
  const projectJson = buildRelativeProjectConfig(config, projectRoot);
  await publishProjectConfig(
    projectRoot,
    projectJson,
    beforeRename,
    afterRename,
    validateCandidate,
  );
  return {
    message: [
      `Wrote portable project config to ${join(projectRoot, ".dysflow", "project.json")}`,
      `Recommended: tune "timeoutMs" in .dysflow/project.json for this project — large databases and heavy whole-project operations may need more than the current ${config.timeoutMs}ms.`,
    ].join("\n"),
    projectPath: join(projectRoot, ".dysflow", "project.json"),
  };
}

export async function publishProjectConfig(
  projectRoot: string,
  projectJson: ProjectConfigCandidate,
  beforeRename?: () => void | Promise<void>,
  afterRename?: () => void | Promise<void>,
  validateCandidate?: ProjectConfigCandidateValidator,
): Promise<string> {
  const projectPath = join(projectRoot, ".dysflow", "project.json");
  await mkdir(dirname(projectPath), { recursive: true });
  await validateCandidate?.(projectRoot, projectJson);

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
    if (dirname(canonicalTemporary) !== canonicalParent || !owns(canonicalTemporary)) {
      throw new Error("Temporary project config escaped the owned directory.");
    }
    await handle.writeFile(`${JSON.stringify(projectJson, null, 2)}\n`, "utf8");
    await handle.sync();
    await beforeRename?.();
    if ((await realpath(dirname(projectPath))) !== canonicalParent) {
      throw new Error("Project config directory ownership changed before publication.");
    }
    await handle.close();
    await rename(temporaryPath, projectPath);
    renamed = true;
    await afterRename?.();
    if ((await realpath(projectPath)) !== join(canonicalParent, "project.json")) {
      throw new Error("Published project config escaped the owned directory.");
    }
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
  return projectPath;
}
