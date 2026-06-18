import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  isAbsolutePath,
  REDACTED_SECRET,
  readJsonFileAsync,
  readJsonFileSync,
  stringValue,
} from "../utils/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PROJECT_CONFIG_PATH = ".dysflow/project.json";
const OLD_PROJECT_CONFIG_PATH = "dysflow.project.json";
const ALT_ACCESS_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

export type DysflowConfigSource = "explicit-request" | "repo-config" | "runtime-default";

export type DysflowProjectConfig = {
  id?: string;
  name?: string;
  allowWrites?: boolean;
  allowedProcedures?: string[];
  accessPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  timeoutMs?: number;
  accessPasswordEnv?: string;
  backendPasswordEnv?: string;
  frontendPasswordEnv?: string;
  passwordEnv?: string;
  httpToken?: string;
  httpTokenEnv?: string;
};

export type DysflowConfig = {
  configSource: DysflowConfigSource;
  allowWrites: boolean;
  allowedProcedures?: readonly string[];
  accessDbPath: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  projectId?: string;
  /** The configuration-level execution timeout. */
  timeoutMs: number;
  accessPassword?: string;
  backendPassword?: string;
  accessPasswordEnv?: string;
  backendPasswordEnv?: string;
  configPath?: string;
  httpToken?: string;
  httpTokenEnv?: string;
};

export type RedactedDysflowConfig = Omit<
  DysflowConfig,
  "accessPassword" | "backendPassword" | "httpToken"
> & {
  accessPassword?: typeof REDACTED_SECRET;
  backendPassword?: typeof REDACTED_SECRET;
  httpToken?: typeof REDACTED_SECRET;
};

export type DysflowConfigInput = {
  accessDbPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  projectId?: string;
  contextId?: string;
  projectConfig?: DysflowProjectConfig;
  projectConfigPath?: string;
  accessPassword?: string;
  backendPassword?: string;
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  httpToken?: string;
  httpTokenEnv?: string;
};

export function loadDysflowConfigShared<
  T extends OperationResult<DysflowConfig> | Promise<OperationResult<DysflowConfig>>,
>(
  input: DysflowConfigInput,
  repoConfig:
    | { found: "none" }
    | { found: "compat" | "standard"; path: string }
    | { found: "ambiguous"; paths: [string, string] },
  loadFromPath: (path: string) => T,
): T {
  const env = input.env ?? process.env;
  const cwd = resolve(input.cwd ?? process.cwd());

  const explicitAccessDbPath = stringValue(input.accessDbPath);
  if (explicitAccessDbPath !== undefined) {
    return buildExplicitConfig(input, env, cwd, explicitAccessDbPath) as T;
  }

  const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);
  if (repoConfig.found === "ambiguous") {
    const [pathA, pathB] = repoConfig.paths;
    return failureResult(
      createDysflowError(
        "CONFIG_AMBIGUOUS_PROJECT_FILE",
        `Both ${pathA} and ${pathB} exist. Remove one before continuing.`,
        { retryable: false },
      ),
    ) as T;
  }
  if (repoConfig.found === "standard" || repoConfig.found === "compat") {
    return loadFromPath(repoConfig.path);
  }
  if (requestedProjectId !== undefined) {
    // Global registry is deprecated. projectId must resolve via per-repo .dysflow/project.json.
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_NOT_REGISTERED",
        `Project '${requestedProjectId}' is not registered. The global projects.json registry is deprecated. Add a .dysflow/project.json to the repository instead.`,
        { retryable: false },
      ),
    ) as T;
  }
  // repoConfig.found === "none"
  return failureResult(
    createDysflowError(
      "CONFIG_MISSING_ACCESS_PATH",
      "Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
    ),
  ) as T;
}

export function loadDysflowConfig(input: DysflowConfigInput = {}): OperationResult<DysflowConfig> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const repoConfig = findRepoProjectConfigPath(cwd);

  const env = input.env ?? process.env;
  const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);

  return loadDysflowConfigShared(input, repoConfig, (path) =>
    loadProjectConfigFromPath(path, input, env, cwd, "repo-config", requestedProjectId),
  );
}

export async function loadDysflowConfigAsync(
  input: DysflowConfigInput = {},
): Promise<OperationResult<DysflowConfig>> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const repoConfig = await findRepoProjectConfigPathAsync(cwd);

  const env = input.env ?? process.env;
  const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);

  return loadDysflowConfigShared(input, repoConfig, (path) =>
    loadProjectConfigFromPathAsync(path, input, env, cwd, "repo-config", requestedProjectId),
  );
}

export function redactDysflowConfig(config: DysflowConfig): RedactedDysflowConfig {
  const base = {
    configSource: config.configSource,
    allowWrites: config.allowWrites,
    accessDbPath: config.accessDbPath,
    backendPath: config.backendPath,
    destinationRoot: config.destinationRoot,
    projectRoot: config.projectRoot,
    projectId: config.projectId,
    timeoutMs: config.timeoutMs,
    accessPasswordEnv: config.accessPasswordEnv,
    backendPasswordEnv: config.backendPasswordEnv,
    configPath: config.configPath,
    httpTokenEnv: config.httpTokenEnv,
  };

  return {
    ...base,
    ...(config.accessPassword === undefined ? {} : { accessPassword: REDACTED_SECRET }),
    ...(config.backendPassword === undefined ? {} : { backendPassword: REDACTED_SECRET }),
    ...(config.httpToken === undefined ? {} : { httpToken: REDACTED_SECRET }),
  };
}

function buildExplicitConfig(
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  cwd: string,
  accessDbPath: string,
): OperationResult<DysflowConfig> {
  const timeoutMs = resolveTimeout(input.timeoutMs);
  return successResult({
    configSource: "explicit-request",
    allowWrites: false,
    accessDbPath,
    backendPath: stringValue(input.backendPath),
    destinationRoot: stringValue(input.destinationRoot) ?? cwd,
    projectRoot: stringValue(input.projectRoot) ?? cwd,
    projectId: stringValue(input.projectId) ?? stringValue(input.contextId),
    timeoutMs,
    accessPassword: resolvePassword(
      input.accessPassword,
      env.DYSFLOW_ACCESS_PASSWORD ?? env[ALT_ACCESS_PASSWORD_ENV],
    ),
    backendPassword: resolvePassword(
      input.backendPassword,
      env.DYSFLOW_BACKEND_PASSWORD ?? env[ALT_ACCESS_PASSWORD_ENV],
    ),
    httpToken: resolvePassword(input.httpToken, env.DYSFLOW_HTTP_TOKEN),
    httpTokenEnv: undefined,
  });
}

/**
 * Pure transformation: given a parsed project config object and the resolved
 * file path it was loaded from, produce the full DysflowConfig.
 *
 * This helper is shared by the sync and async loader variants so that the
 * transformation logic lives in exactly one place (#195).
 */
function buildProjectConfig(
  raw: DysflowProjectConfig,
  opts: {
    resolvedPath: string;
    configSource: DysflowConfigSource;
    projectIdOverride: string | undefined;
    input: DysflowConfigInput;
    env: Record<string, string | undefined>;
  },
): OperationResult<DysflowConfig> {
  const { resolvedPath, configSource, projectIdOverride, input, env } = opts;
  const configDir = dirname(resolvedPath);
  const projectRoot = resolveProjectRoot(raw, configDir, input.projectRoot);
  const timeoutMs = resolveTimeout(input.timeoutMs ?? raw.timeoutMs);
  const accessDbPath = resolveProjectPath(raw.accessPath ?? input.accessDbPath, projectRoot);
  if (accessDbPath === undefined) {
    return failureResult(
      createDysflowError(
        "CONFIG_MISSING_ACCESS_PATH",
        `Project config ${resolvedPath} is missing accessPath.`,
      ),
    );
  }

  const backendPath = resolveProjectPath(input.backendPath ?? raw.backendPath, projectRoot);
  // #13228 — an explicit caller override MUST win over the discovered repo config.
  // The discovered config is a DEFAULT, not an authority over what the caller asked
  // for. This matches buildExplicitConfig and resolveProjectRoot, which already let
  // the explicit value win; the old `raw.* ?? input.*` order let a startup project's
  // src/ overwrite a worktree export target (186-file incident).
  const destinationRoot =
    resolveProjectPath(input.destinationRoot ?? raw.destinationRoot ?? "src", projectRoot) ??
    projectRoot;
  const accessPasswordEnv = resolvePasswordEnv(raw);
  const backendPasswordEnv = resolveBackendPasswordEnv(raw);
  const accessPassword = resolvePassword(
    input.accessPassword,
    pickFirstDefined(
      accessPasswordEnv === undefined ? undefined : env[accessPasswordEnv],
      env.DYSFLOW_ACCESS_PASSWORD,
      env.DYSFLOW_ACCESS_PWD,
      env[ALT_ACCESS_PASSWORD_ENV],
    ),
  );
  const backendPassword = resolvePassword(
    input.backendPassword,
    pickFirstDefined(
      backendPasswordEnv === undefined ? undefined : env[backendPasswordEnv],
      env.DYSFLOW_BACKEND_PASSWORD,
      env[ALT_ACCESS_PASSWORD_ENV],
    ),
  );

  const httpTokenEnv = resolveHttpTokenEnv(raw);
  const httpToken = resolvePassword(
    input.httpToken,
    pickFirstDefined(
      httpTokenEnv === undefined ? undefined : env[httpTokenEnv],
      env.DYSFLOW_HTTP_TOKEN,
    ),
  );

  return successResult({
    configSource,
    allowWrites: raw.allowWrites === true,
    allowedProcedures: Array.isArray(raw.allowedProcedures) ? raw.allowedProcedures : undefined,
    accessDbPath,
    backendPath,
    destinationRoot,
    projectRoot,
    projectId: projectIdOverride ?? stringValue(raw.id),
    timeoutMs,
    accessPassword,
    backendPassword,
    accessPasswordEnv,
    backendPasswordEnv,
    configPath: resolvedPath,
    httpToken,
    httpTokenEnv,
  });
}

function loadProjectConfigFromPath(
  configPath: string,
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  cwd: string,
  configSource: DysflowConfigSource,
  projectId?: string,
): OperationResult<DysflowConfig> {
  const resolvedPath = resolvePathMaybeRelative(configPath, cwd);
  if (!existsSync(resolvedPath)) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_NOT_FOUND",
        `Project config file not found: ${resolvedPath}`,
      ),
    );
  }

  let raw: DysflowProjectConfig;
  try {
    raw = readJsonFileSync<DysflowProjectConfig>(resolvedPath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_INVALID",
        `Project config file is not valid JSON: ${resolvedPath}. ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  return loadProjectConfigCore(resolvedPath, raw, input, env, configSource, projectId);
}

async function loadProjectConfigFromPathAsync(
  configPath: string,
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  cwd: string,
  configSource: DysflowConfigSource,
  projectId?: string,
): Promise<OperationResult<DysflowConfig>> {
  const resolvedPath = resolvePathMaybeRelative(configPath, cwd);
  if (!(await pathExists(resolvedPath))) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_NOT_FOUND",
        `Project config file not found: ${resolvedPath}`,
      ),
    );
  }

  let raw: DysflowProjectConfig;
  try {
    raw = await readJsonFileAsync<DysflowProjectConfig>(resolvedPath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_INVALID",
        `Project config file is not valid JSON: ${resolvedPath}. ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  return loadProjectConfigCore(resolvedPath, raw, input, env, configSource, projectId);
}

export function loadProjectConfigCore(
  resolvedPath: string,
  raw: DysflowProjectConfig,
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  configSource: DysflowConfigSource,
  projectId: string | undefined,
): OperationResult<DysflowConfig> {
  const requestedProjectId = stringValue(projectId);
  const configuredProjectId = stringValue(raw.id);
  if (
    requestedProjectId !== undefined &&
    configuredProjectId !== undefined &&
    requestedProjectId !== configuredProjectId
  ) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_ID_MISMATCH",
        `Requested projectId '${requestedProjectId}' does not match repo config id '${configuredProjectId}' in ${resolvedPath}.`,
        { retryable: false },
      ),
    );
  }

  return buildProjectConfig(raw, {
    resolvedPath,
    configSource,
    projectIdOverride: projectId,
    input,
    env,
  });
}

function resolveProjectRoot(
  config: DysflowProjectConfig,
  configDir: string,
  explicitProjectRoot?: string,
): string {
  const baseProjectRoot =
    basename(configDir).toLowerCase() === ".dysflow" ? dirname(configDir) : configDir;
  const rootValue = stringValue(explicitProjectRoot) ?? stringValue(config.projectRoot);

  return rootValue === undefined
    ? baseProjectRoot
    : (resolveProjectPath(rootValue, baseProjectRoot) ?? baseProjectRoot);
}

function resolveProjectPath(value: string | undefined, projectRoot: string): string | undefined {
  const normalized = stringValue(value);
  if (normalized === undefined) return undefined;
  // Already-absolute paths (POSIX, Windows drive-letter, or UNC) must be kept verbatim:
  // node:path.resolve() is host-platform-specific and would wrongly prefix cwd to a
  // Windows-style path when running on POSIX (e.g. Linux CI).
  return isAbsolutePath(normalized) ? normalized : resolve(projectRoot, normalized);
}

function resolvePathMaybeRelative(value: string, cwd: string): string {
  return isAbsolutePath(value) ? value : resolve(cwd, value);
}

async function findRepoProjectConfigPathAsync(
  cwd: string,
): Promise<
  | { found: "none" }
  | { found: "compat" | "standard"; path: string }
  | { found: "ambiguous"; paths: [string, string] }
> {
  // Walk up the directory tree from cwd looking for .dysflow/project.json
  // (or the legacy dysflow.project.json). This matches the behavior of
  // git discovering .git/, npm discovering package.json, etc. The MCP
  // server's process cwd is not always the project cwd (it can be the
  // cwd of the opencode/Claude host that spawned it), so a single-level
  // lookup misses the project and the runner silently falls back to the
  // CurrentDb (frontend), which is the bug issue 18 reproduced.
  let dir = resolve(cwd);
  const visited: string[] = [];
  while (true) {
    visited.push(dir);
    const standard = resolve(dir, DEFAULT_PROJECT_CONFIG_PATH);
    const compat = resolve(dir, OLD_PROJECT_CONFIG_PATH);
    const standardExists = await pathExists(standard);
    const compatExists = await pathExists(compat);

    if (standardExists && compatExists) {
      return { found: "ambiguous", paths: [standard, compat] };
    }
    if (standardExists) {
      return { found: "standard", path: standard };
    }
    if (compatExists) {
      return { found: "compat", path: compat };
    }
    const parent = dirname(dir);
    if (parent === dir || visited.length > 64) {
      return { found: "none" };
    }
    dir = parent;
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function findRepoProjectConfigPath(
  cwd: string,
):
  | { found: "none" }
  | { found: "compat" | "standard"; path: string }
  | { found: "ambiguous"; paths: [string, string] } {
  // Walk up the directory tree from cwd looking for .dysflow/project.json
  // (or the legacy dysflow.project.json). This matches the behavior of
  // git discovering .git/, npm discovering package.json, etc. The MCP
  // server's process cwd is not always the project cwd (it can be the
  // cwd of the opencode/Claude host that spawned it), so a single-level
  // lookup misses the project and the runner silently falls back to the
  // CurrentDb (frontend), which is the bug issue 18 reproduced.
  let dir = resolve(cwd);
  const visited: string[] = [];
  while (true) {
    visited.push(dir);
    const standard = resolve(dir, DEFAULT_PROJECT_CONFIG_PATH);
    const compat = resolve(dir, OLD_PROJECT_CONFIG_PATH);
    const standardExists = existsSync(standard);
    const compatExists = existsSync(compat);

    if (standardExists && compatExists) {
      return { found: "ambiguous", paths: [standard, compat] };
    }
    if (standardExists) {
      return { found: "standard", path: standard };
    }
    if (compatExists) {
      return { found: "compat", path: compat };
    }
    const parent = dirname(dir);
    if (parent === dir || visited.length > 64) {
      return { found: "none" };
    }
    dir = parent;
  }
}

function resolveTimeout(explicitTimeoutMs: number | undefined): number {
  if (explicitTimeoutMs !== undefined) {
    return Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > 0
      ? explicitTimeoutMs
      : DEFAULT_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

function resolvePassword(
  explicitPassword: string | undefined,
  envPassword: string | undefined,
): string | undefined {
  return stringValue(explicitPassword) ?? stringValue(envPassword);
}

function resolvePasswordEnv(config: DysflowProjectConfig): string | undefined {
  return (
    stringValue(config.accessPasswordEnv) ??
    stringValue(config.frontendPasswordEnv) ??
    stringValue(config.passwordEnv)
  );
}

function resolveBackendPasswordEnv(config: DysflowProjectConfig): string | undefined {
  return stringValue(config.backendPasswordEnv);
}

function resolveHttpTokenEnv(config: DysflowProjectConfig): string | undefined {
  return stringValue(config.httpTokenEnv);
}

function pickFirstDefined<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

/**
 * Exported ONLY for the test suite `dysflow-config-discovery.test.ts`.
 * The MCP server's process cwd is not always the project cwd (it can
 * be the cwd of the opencode/Claude host that spawned it), so
 * `findRepoProjectConfigPath` walks up the directory tree looking
 * for `.dysflow/project.json` (or the legacy `dysflow.project.json`).
 * Issue 18 caught a class of bugs where the runner silently fell
 * back to the frontend's CurrentDb and returned only the two local
 * tables instead of the backend's 40+. These tests lock the
 * walk-up behavior down.
 */
export const findRepoProjectConfigPathForTesting = findRepoProjectConfigPath;
