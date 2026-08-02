import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type {
  DiscoveredProjectDiagnostic,
  ProjectConfigDiagnostic,
} from "../config/project-config-diagnostic.js";

export const PROJECT_CHOICE_REASON = "user_selected_after_ambiguous_project" as const;
export const DEFAULT_RESOLUTION_CACHE_TTL_MS = 10 * 60 * 1000;
export const MIN_RESOLUTION_CACHE_TTL_MS = 1_000;
export const MAX_RESOLUTION_CACHE_TTL_MS = 60 * 60 * 1000;
export const RECOVERY_INSTRUCTION =
  "User must pick one of availableProjects; retry resolve_project or a write-class tool with projectId, projectChoiceReason, and recoveryToken.";

export const PROJECT_RECOVERY_SCHEMA_BLOCK = {
  projectChoiceReason: {
    type: "string",
    enum: [PROJECT_CHOICE_REASON],
    description:
      "Exact reason required when a human selects a project from an ambiguous recovery envelope.",
  },
  recoveryToken: {
    type: "string",
    minLength: 1,
    description:
      "Opaque, short-lived token returned by an ambiguous resolve_project outcome. Valid only in this MCP process.",
  },
} as const;

export const CLEAR_RESOLUTION_SCHEMA_PROP = {
  type: "boolean",
  description:
    "Clear the process-local project resolution cache and outstanding recovery tokens before resolving again.",
} as const;

export type AvailableProject = {
  projectId: string;
  projectRoot: string;
  accessPath: string | null;
};

export type ProjectRecoveryInput = {
  cwd?: string;
  projectId?: string;
  projectChoiceReason?: string;
  recoveryToken?: string;
};

type RecoveryFailure = {
  ok: false;
  code: "MCP_INPUT_INVALID" | "PROJECT_ID_COLLISION";
  message: string;
  remediation: string;
};

type RecoverySuccess = { ok: true; project: AvailableProject };

type PendingRecovery = {
  token: string;
  expiresAt: number;
  fingerprint: string;
  projects: readonly AvailableProject[];
  configPaths: readonly string[];
  projectRoots: readonly string[];
};

type CachedResolution = {
  expiresAt: number;
  fingerprint: string;
  project: AvailableProject;
  configPaths: readonly string[];
  projectRoots: readonly string[];
};

export type ProjectResolutionRecovery = ReturnType<typeof createProjectResolutionRecovery>;

export function createProjectResolutionRecovery(
  options: {
    env?: Record<string, string | undefined>;
    now?: () => number;
    token?: () => string;
  } = {},
) {
  const now = options.now ?? Date.now;
  const ttlMs = resolutionCacheTtlMs(options.env ?? process.env);
  const createToken = options.token ?? (() => randomBytes(32).toString("base64url"));
  let pending: PendingRecovery | null = null;
  let cached: CachedResolution | null = null;

  const clear = (): void => {
    pending = null;
    cached = null;
  };

  const issue = (diagnostic: ProjectConfigDiagnostic) => {
    const projects = availableProjects(diagnostic.discoveredProjects ?? []);
    const configPaths = configPathsFor(diagnostic.discoveredProjects ?? []);
    const projectRoots = projects.map((project) => project.projectRoot);
    const token = createToken();
    pending = {
      token,
      expiresAt: now() + ttlMs,
      fingerprint: fingerprint(configPaths, projectRoots),
      projects,
      configPaths,
      projectRoots,
    };
    return {
      availableProjects: projects,
      recoveryToken: token,
      recoveryInstruction: RECOVERY_INSTRUCTION,
    };
  };

  const consume = (input: ProjectRecoveryInput): RecoveryFailure | RecoverySuccess => {
    if (
      input.projectChoiceReason !== PROJECT_CHOICE_REASON ||
      typeof input.recoveryToken !== "string" ||
      input.recoveryToken.length === 0 ||
      typeof input.projectId !== "string" ||
      input.projectId.length === 0
    ) {
      return invalidRecovery(
        "The recovery selection must include the exact projectId, projectChoiceReason, and recoveryToken trio.",
      );
    }
    if (pending === null || pending.token !== input.recoveryToken) {
      return invalidRecovery("The recovery token is unknown or has already been consumed.");
    }
    if (now() >= pending.expiresAt) {
      clear();
      return invalidRecovery("The recovery token has expired.");
    }
    if (fingerprint(pending.configPaths, pending.projectRoots) !== pending.fingerprint) {
      clear();
      return invalidRecovery(
        "The visible project configuration changed after the token was issued.",
      );
    }
    const idMatches = pending.projects.filter((project) => project.projectId === input.projectId);
    const matches =
      idMatches.length > 1 && typeof input.cwd === "string" && input.cwd.trim().length > 0
        ? idMatches.filter((project) => sameProjectRoot(project.projectRoot, input.cwd as string))
        : idMatches;
    if (matches.length > 1) {
      return {
        ok: false,
        code: "PROJECT_ID_COLLISION",
        message: `Project id '${input.projectId}' identifies more than one visible project.`,
        remediation:
          "Give each worktree a unique project id, request a fresh recoveryToken, and ask the user to choose again.",
      };
    }
    const project = matches[0];
    if (project === undefined) {
      return invalidRecovery(
        idMatches.length > 1
          ? "The selected cwd is not part of the recovery envelope for that projectId."
          : "The selected project is not part of the recovery envelope.",
      );
    }
    cached = {
      project,
      configPaths: pending.configPaths,
      projectRoots: pending.projectRoots,
      fingerprint: pending.fingerprint,
      expiresAt: now() + ttlMs,
    };
    pending = null;
    return { ok: true, project };
  };

  const getCached = (): AvailableProject | null => {
    if (cached === null) return null;
    if (
      now() >= cached.expiresAt ||
      fingerprint(cached.configPaths, cached.projectRoots) !== cached.fingerprint
    ) {
      clear();
      return null;
    }
    return cached.project;
  };

  return { clear, consume, getCached, issue, ttlMs };
}

function sameProjectRoot(left: string, right: string): boolean {
  const canonical = (value: string): string => {
    const absolute = resolve(value);
    let result = absolute;
    try {
      result = realpathSync.native(absolute);
    } catch {
      // Missing/unreachable paths cannot gain authority; preserve their absolute identity.
    }
    return process.platform === "win32" ? result.toLowerCase() : result;
  };
  return canonical(left) === canonical(right);
}

function invalidRecovery(message: string): RecoveryFailure {
  return {
    ok: false,
    code: "MCP_INPUT_INVALID",
    message,
    remediation:
      "Call resolve_project again, ask the user to choose one availableProjects entry, and retry once with its projectId plus the fresh recoveryToken and exact projectChoiceReason.",
  };
}

function availableProjects(
  projects: readonly DiscoveredProjectDiagnostic[],
): readonly AvailableProject[] {
  return projects
    .filter((project): project is DiscoveredProjectDiagnostic & { id: string } =>
      Boolean(project.id),
    )
    .map((project) => ({
      projectId: project.id,
      projectRoot: project.projectRoot,
      accessPath: project.accessPath,
    }));
}

function configPathsFor(projects: readonly DiscoveredProjectDiagnostic[]): readonly string[] {
  return [...new Set(projects.map((project) => resolve(project.configPath)))].sort();
}

function fingerprint(configPaths: readonly string[], projectRoots: readonly string[]): string {
  const hash = createHash("sha256");
  for (const path of configPaths) {
    hash.update(path);
    hash.update("\0");
    try {
      hash.update(readFileSync(path));
    } catch {
      hash.update("<missing>");
    }
    hash.update("\0");
  }
  for (const root of [...new Set(projectRoots.map((value) => resolve(value)))].sort()) {
    hash.update(worktreeRegistryFingerprint(root));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function worktreeRegistryFingerprint(projectRoot: string): string {
  const dotGit = join(projectRoot, ".git");
  if (!existsSync(dotGit)) return `${dotGit}:missing`;
  let commonDir = dotGit;
  try {
    if (statSync(dotGit).isFile()) {
      const gitdirLine = readFileSync(dotGit, "utf8")
        .match(/^gitdir:\s*(.+)$/im)?.[1]
        ?.trim();
      if (gitdirLine === undefined) return `${dotGit}:invalid`;
      const gitDir = resolve(projectRoot, gitdirLine);
      const commonLine = readFileSync(join(gitDir, "commondir"), "utf8").trim();
      commonDir = isAbsolute(commonLine) ? commonLine : resolve(gitDir, commonLine);
    }
    const registry = join(commonDir, "worktrees");
    const entries = existsSync(registry) ? readdirSync(registry).sort() : [];
    return `${resolve(commonDir)}:${entries.join(",")}`;
  } catch {
    return `${dirname(dotGit)}:unreadable`;
  }
}

function resolutionCacheTtlMs(env: Record<string, string | undefined>): number {
  const raw = env.DYSFLOW_RESOLUTION_CACHE_TTL_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RESOLUTION_CACHE_TTL_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) &&
    parsed >= MIN_RESOLUTION_CACHE_TTL_MS &&
    parsed <= MAX_RESOLUTION_CACHE_TTL_MS
    ? parsed
    : DEFAULT_RESOLUTION_CACHE_TTL_MS;
}
