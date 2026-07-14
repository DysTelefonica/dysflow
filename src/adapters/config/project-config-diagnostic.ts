import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type ProjectConfigStatus =
  | "valid"
  | "missing"
  | "id-mismatch"
  | "path-mismatch"
  | "outside-project-root"
  | "target-not-found"
  | "ambiguous";

export type ProjectConfigDiagnostic = {
  status: ProjectConfigStatus;
  cwd: string;
  configPath: string;
  projectRoot: string;
  projectId: string | null;
  accessPath: string | null;
  backendPath: string | null;
  destinationRoot: string | null;
  writeReady: boolean;
  diagnostics: readonly { code: string; severity: "error" | "warning"; message: string }[];
  remediation: string | null;
};

export type ProjectConfigRequest = {
  operation?: string;
  projectId?: string;
  accessPath?: string;
  accessDbPath?: string;
  databasePath?: string;
  sourcePath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  contextId?: string;
};

const normalize = (value: string): string => resolve(value).replaceAll("\\", "/");
const identity = (value: string): string =>
  process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);
const canonical = (value: string): string => normalize(realpathSync(value));
const within = (child: string, root: string): boolean => {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

function worktreeRoot(cwd: string): string | null {
  let cursor = resolve(cwd);
  while (true) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

export function diagnoseProjectConfig(
  cwdInput: string,
  request: ProjectConfigRequest = {},
  candidateConfig?: Record<string, unknown>,
): ProjectConfigDiagnostic {
  const cwd = normalize(cwdInput);
  const projectRootNative = worktreeRoot(cwdInput);
  if (projectRootNative === null) {
    return {
      status: "outside-project-root",
      cwd,
      configPath: normalize(join(cwdInput, ".dysflow", "project.json")),
      projectRoot: cwd,
      projectId: null,
      accessPath: null,
      backendPath: null,
      destinationRoot: null,
      writeReady: false,
      diagnostics: [
        {
          code: "OUTSIDE_PROJECT_ROOT",
          severity: "error",
          message: "The requested cwd is not inside a Git worktree.",
        },
      ],
      remediation: `Run Dysflow from the intended Git worktree or pass its path with \`--cwd\`.`,
    };
  }
  const projectRoot = normalize(projectRootNative);
  const canonicalProjectRoot = canonical(projectRootNative);
  const configCandidate = join(projectRootNative, ".dysflow", "project.json");
  const legacy = join(projectRootNative, "dysflow.project.json");
  const present = [
    ...(candidateConfig === undefined ? [configCandidate].filter(existsSync) : [configCandidate]),
    ...[legacy].filter(existsSync),
  ];
  const base = {
    cwd,
    configPath: normalize(configCandidate),
    projectRoot,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
  };
  const fail = (
    status: ProjectConfigStatus,
    message: string,
    remediation: string,
  ): ProjectConfigDiagnostic => ({
    ...base,
    status,
    writeReady: false,
    diagnostics: [{ code: status.toUpperCase().replaceAll("-", "_"), severity: "error", message }],
    remediation,
  });
  if (present.length === 0)
    return fail(
      "missing",
      "No per-worktree .dysflow/project.json was found.",
      `Run \`dysflow setup --cwd ${cwd} --apply --access-path <path>\` to bootstrap a per-worktree .dysflow/project.json. No write operation was performed.`,
    );
  if (present.length > 1)
    return fail(
      "ambiguous",
      "Both project.json and legacy dysflow.project.json exist in this worktree.",
      `Remove the legacy ${normalize(legacy)} after migrating its settings to ${normalize(configCandidate)}.`,
    );
  const selectedConfig = present[0];
  if (selectedConfig === undefined)
    return fail(
      "missing",
      "No project config selected.",
      `Run \`dysflow setup --cwd ${cwd} --apply --access-path <path>\`.`,
    );
  try {
    if (!within(canonical(dirname(selectedConfig)), canonicalProjectRoot)) throw new Error();
  } catch {
    return fail(
      "outside-project-root",
      "The project config path is redirected outside the owning worktree.",
      `Replace ${normalize(dirname(selectedConfig))} with a directory owned by ${projectRoot}.`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = candidateConfig ?? JSON.parse(readFileSync(selectedConfig, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
  } catch {
    return fail(
      "ambiguous",
      "The project config is not valid JSON.",
      `Run \`dysflow doctor --cwd ${cwd}\` and repair ${normalize(selectedConfig)}.`,
    );
  }
  const pathValue = (key: string): string | null =>
    typeof parsed[key] === "string" && parsed[key]
      ? normalize(resolve(projectRootNative, parsed[key] as string))
      : null;
  const projectId = typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  const accessPath = pathValue("accessPath");
  const backendPath = pathValue("backendPath");
  const destinationRoot = pathValue("destinationRoot") ?? normalize(join(projectRootNative, "src"));
  Object.assign(base, {
    configPath: normalize(selectedConfig),
    projectId,
    accessPath,
    backendPath,
    destinationRoot,
  });
  const requestedId = request.projectId;
  if (requestedId !== undefined && requestedId !== projectId)
    return failWith(
      base,
      "id-mismatch",
      `Requested project identity '${requestedId}' does not match '${projectId ?? "(missing)"}'.`,
      `Use projectId '${projectId ?? "<configured-id>"}' or update ${base.configPath}.`,
    );
  if (
    accessPath === null ||
    !within(accessPath, projectRootNative) ||
    !within(destinationRoot, projectRootNative)
  )
    return failWith(
      base,
      "path-mismatch",
      "Configured accessPath or destinationRoot is outside the owning worktree.",
      `Move the target under ${projectRoot} or update ${base.configPath}.`,
    );
  try {
    if (
      identity(worktreeRoot(canonical(destinationRoot)) ?? "") !== identity(canonicalProjectRoot) ||
      !within(canonical(destinationRoot), canonicalProjectRoot)
    )
      throw new Error();
  } catch {
    return failWith(
      base,
      "outside-project-root",
      "Configured destinationRoot cannot be canonically owned by this worktree.",
      `Create or move destinationRoot under ${projectRoot}.`,
    );
  }
  if (request.projectRoot !== undefined) {
    try {
      if (
        identity(canonical(resolve(projectRootNative, request.projectRoot))) ===
        identity(canonicalProjectRoot)
      ) {
        // Continue with the canonical owning worktree.
      } else throw new Error();
    } catch {
      return failWith(
        base,
        "outside-project-root",
        "Requested projectRoot is not the active worktree.",
        `Use projectRoot '${projectRoot}'.`,
      );
    }
  }
  const sourcePathTargetsDatabase =
    request.operation === undefined ||
    (!request.operation.startsWith("form_") &&
      request.operation !== "apply_form_design_plan" &&
      request.operation !== "create_form_from_template");
  const targetAliases = [
    request.accessPath,
    request.accessDbPath,
    request.databasePath,
    ...(sourcePathTargetsDatabase ? [request.sourcePath] : []),
  ].filter((value): value is string => value !== undefined);
  const targets = new Set(
    targetAliases.map((value) => identity(resolve(projectRootNative, value))),
  );
  if (targets.size > 1)
    return failWith(
      base,
      "ambiguous",
      "Conflicting Access target aliases were supplied.",
      "Pass exactly one of accessPath, accessDbPath, databasePath, or sourcePath.",
    );
  const requestedTarget = targetAliases[0];
  if (!existsSync(accessPath))
    return failWith(
      base,
      "target-not-found",
      `Configured accessPath does not exist: ${accessPath}.`,
      `Create or correct the Access target in ${base.configPath}.`,
    );
  let canonicalAccess: string;
  try {
    canonicalAccess = canonical(accessPath);
    if (identity(worktreeRoot(dirname(canonicalAccess)) ?? "") !== identity(canonicalProjectRoot))
      throw new Error("different worktree");
  } catch {
    return failWith(
      base,
      "outside-project-root",
      "Configured Access target cannot be canonically owned by this worktree.",
      `Move the target under ${projectRoot}.`,
    );
  }
  let canonicalBackend: string | null = null;
  if (backendPath !== null) {
    try {
      canonicalBackend = canonical(backendPath);
      if (
        !within(backendPath, projectRootNative) ||
        identity(worktreeRoot(dirname(canonicalBackend)) ?? "") !==
          identity(canonicalProjectRoot) ||
        !within(canonicalBackend, canonicalProjectRoot)
      )
        throw new Error("different worktree");
    } catch {
      return failWith(
        base,
        existsSync(backendPath) ? "outside-project-root" : "target-not-found",
        `Configured backendPath is missing or not canonically owned by this worktree: ${backendPath}.`,
        `Create or move the backend target under ${projectRoot}.`,
      );
    }
  }
  if (requestedTarget !== undefined) {
    const target = normalize(resolve(projectRootNative, requestedTarget));
    const isConfiguredBackend = backendPath !== null && identity(target) === identity(backendPath);
    if (!isConfiguredBackend && !within(target, projectRootNative))
      return failWith(
        base,
        "outside-project-root",
        `Requested target '${target}' is outside this worktree.`,
        `Use the MCP process for the target's owning worktree.`,
      );
    if (!isConfiguredBackend) {
      let canonicalTarget: string;
      try {
        canonicalTarget = canonical(target);
      } catch {
        return failWith(
          base,
          "target-not-found",
          `Requested target does not exist: ${target}.`,
          `Correct the target path.`,
        );
      }
      if (
        identity(worktreeRoot(dirname(canonicalTarget)) ?? "") !== identity(canonicalProjectRoot) ||
        identity(canonicalTarget) !== identity(canonicalAccess)
      )
        return failWith(
          base,
          "outside-project-root",
          `Requested target '${target}' is not owned by this worktree config.`,
          `Run \`dysflow doctor --cwd ${normalize(dirname(target))}\` and call that worktree's MCP process.`,
        );
    }
    if (isConfiguredBackend && identity(canonical(target)) !== identity(canonicalBackend ?? ""))
      return failWith(
        base,
        "outside-project-root",
        `Requested backend target '${target}' is not owned by this worktree config.`,
        `Use backendPath '${backendPath}'.`,
      );
  }
  if (
    request.destinationRoot !== undefined &&
    identity(resolve(projectRootNative, request.destinationRoot)) !== identity(destinationRoot)
  )
    return failWith(
      base,
      "outside-project-root",
      "Requested destinationRoot is not owned by this worktree config.",
      `Use destinationRoot '${destinationRoot}'.`,
    );
  if (
    request.backendPath !== undefined &&
    (backendPath === null ||
      identity(resolve(projectRootNative, request.backendPath)) !== identity(backendPath))
  )
    return failWith(
      base,
      "outside-project-root",
      "Requested backendPath is not owned by this worktree config.",
      `Use backendPath '${backendPath ?? "<configured-backend>"}'.`,
    );
  return { ...base, status: "valid", writeReady: true, diagnostics: [], remediation: null };
}

function failWith(
  base: Omit<ProjectConfigDiagnostic, "status" | "writeReady" | "diagnostics" | "remediation">,
  status: ProjectConfigStatus,
  message: string,
  remediation: string,
): ProjectConfigDiagnostic {
  return {
    ...base,
    status,
    writeReady: false,
    diagnostics: [{ code: status.toUpperCase().replaceAll("-", "_"), severity: "error", message }],
    remediation,
  };
}
