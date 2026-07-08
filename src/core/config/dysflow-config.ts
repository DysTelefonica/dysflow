import { basename, dirname, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  parseWriteExecutionPolicyValue,
  type WriteExecutionPolicy,
} from "../runtime/write-execution-policy.js";
import { NO_DISCOVERY } from "../services/allowed-procedures-discovery.js";
import { isAbsolutePath, REDACTED_SECRET, stringValue } from "../utils/index.js";

// ---------------------------------------------------------------------------
// I/O port — owned by core, implemented by adapters (src/adapters/config).
//
// Loading config is "read a JSON file discovered by walking up the directory
// tree" — filesystem I/O. Per docs/testing/testing-philosophy.md that must sit
// behind an injected port: core stays unit-testable with an in-memory fake, and
// the node-backed default lives in the adapter layer (dysflow-config-node.ts).
// ---------------------------------------------------------------------------

export interface ConfigFileSystemPort {
  existsSync(path: string): boolean;
  existsAsync(path: string): Promise<boolean>;
  readJsonSync<T>(path: string): T;
  readJsonAsync<T>(path: string): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PROJECT_CONFIG_PATH = ".dysflow/project.json";
const OLD_PROJECT_CONFIG_PATH = "dysflow.project.json";
const ALT_ACCESS_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

export type DysflowConfigSource = "explicit-request" | "repo-config" | "runtime-default";

/**
 * Consolidated capabilities block for `.dysflow/project.json`.
 *
 * This is the new home for the write gate (`allowWrites`) and the procedure
 * allowlist / denylist (`procedures.allow` / `procedures.deny`). The top-level
 * `allowWrites` and `allowedProcedures` fields on `DysflowProjectConfig` are
 * kept as DEPRECATED read-through aliases and emit a single warning when both
 * the top-level and `capabilities` forms are present in the same file.
 *
 * Removal of the top-level aliases is reserved for v1.15.0
 * (proposal §"Backward Compatibility").
 *
 * `procedures.deny` is exposed as a project-level advisory signal only — the
 * runtime gate stays `procedures.allow`. The shape is preserved so a future
 * PR can wire the denylist without breaking `.dysflow/project.json` consumers.
 */
export type DysflowProjectCapabilities = {
  allowWrites?: boolean;
  procedures?: {
    allow?: readonly string[];
    deny?: readonly string[];
  };
  /**
   * Per-rule lint overrides (#731). Each entry maps a known rule id
   * (`option-declaration`, `identifier-safety`, `declaration-order`,
   * `arg-type-match`, `forbidden-name`) to its override. `enabled: false`
   * suppresses the rule entirely; `enabled: true` keeps the rule at its
   * default severity. The `reason` field is free-form and surfaces in the
   * `LINT_SUPPRESSED` info diagnostic so the suppression is auditable.
   */
  lint?: {
    rules?: Readonly<Partial<Record<LintRuleId, LintRuleOverride>>>;
  };
  /**
   * Issue #779 (v2.1.0) — risk-based write execution policy. Defaults to
   * `"safe-by-default"` (the historical contract: every write-class tool
   * defaults to `dryRun: true`). Switching to `"developer"` is opt-in and
   * flips `routine-dev-write` tools (import_modules, test_vba, link_tables,
   * generate_form, ...) to execute-by-default. Destructive / arbitrary /
   * process-control tools stay gated in either mode.
   *
   * Recognized values:
   *  - `"safe-by-default"` — historical, every write-class tool default
   *    dry-run, caller must pass `dryRun: false` or `apply: true` to commit.
   *  - `"developer"` — opt-in routine-dev-loop mode (skip dry-run ceremony).
   *
   * Any other string is rejected at boot with
   * `CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY` so a typo surfaces immediately
   * rather than silently falling back to `safe-by-default`.
   */
  writeExecutionPolicy?: WriteExecutionPolicy;
};

/** #731 — one of the known lint rule ids. */
export type LintRuleId =
  | "option-declaration"
  | "identifier-safety"
  | "declaration-order"
  | "arg-type-match"
  // F22 (2026-07-06) — flag identifiers that shadow VBA / Access / DAO
  // globals. Wired into the same project-config override path so a
  // legacy project can opt out with `enabled: false`.
  | "forbidden-name";

export type LintRuleOverride = {
  enabled: boolean;
  reason?: string;
};

export type DysflowProjectConfig = {
  id?: string;
  name?: string;
  /** @deprecated Use `capabilities.allowWrites`. Kept as a read-through alias until v1.15.0. */
  allowWrites?: boolean;
  /** @deprecated Use `capabilities.procedures.allow`. Kept as a read-through alias until v1.15.0. */
  allowedProcedures?: string[];
  capabilities?: DysflowProjectCapabilities;
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
  /**
   * #731 — per-rule lint overrides from `.dysflow/project.json`
   * `capabilities.lint.rules`. Surfaced into the runtime so the MCP
   * `lint_module` tool can honor operator opt-outs and trigger
   * the legacy-project auto-detection. `undefined` when the project
   * config has no `capabilities.lint` block.
   */
  lintRulesOverride?: Readonly<Partial<Record<LintRuleId, LintRuleOverride>>>;
  /**
   * Issue #779 (v2.1.0) — resolved write-execution policy from
   * `capabilities.writeExecutionPolicy`. `undefined` when the project
   * config has no value or the field is absent (back-compat with every
   * project.json before v2.1.0). Consumers that need a non-undefined value
   * resolve to `safe-by-default` via `DEFAULT_WRITE_EXECUTION_POLICY`.
   *
   * The MCP layer reads this so it can:
   *  - surface the active mode in `get_capabilities`,
   *  - compute the per-tool `effectiveDryRunDefault` map,
   *  - decide whether `export_modules` / `export_all` need
   *    `confirmOverwriteSource: true` when the destination
   *    overlaps the active source root.
   */
  writeExecutionPolicy?: WriteExecutionPolicy;
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
  /**
   * PR-3 (#658): caller-supplied procedure discovery function. The composition
   * root injects `nodeDiscoverFromSrcRoot` here so `src/core/` stays
   * adapter-free (no `node:fs`). The default `NO_DISCOVERY` returns `[]`
   * and the field stays `undefined` — explicit values in the `capabilities`
   * block always win over discovery.
   */
  discoverFromSrcRoot?: (srcRoot: string) => readonly string[];
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
    // F23 — when the caller passes an explicit accessPath AND a repo project
    // config is found, load the project config so the runtime can honor its
    // `allowedProcedures` allowlist, `allowWrites` gate, lint overrides, and
    // password-env settings. The project config loader honors the explicit
    // accessPath override internally (via the `??` chain in
    // `buildProjectConfig`), so the caller's `accessPath` still wins for the
    // path. Without this, an explicit `accessPath` in the input would silently
    // bypass the project's allowlist — a regression of the gate wired in
    // PR1b (#621 F1) and the per-input resolver wired in #757 (F7). The old
    // `buildExplicitConfig` path is kept as a fallback for the case where no
    // project config exists on disk (the resolver is the only consumer that
    // benefits from the merge; the rest of the surface still gets the
    // original explicit-only behavior because they have no project config to
    // consult).
    if (repoConfig.found === "standard" || repoConfig.found === "compat") {
      return loadFromPath(repoConfig.path);
    }
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

export function loadDysflowConfigWith(
  input: DysflowConfigInput,
  fileSystem: ConfigFileSystemPort,
): OperationResult<DysflowConfig> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const repoConfig = findRepoProjectConfigPath(cwd, fileSystem);

  const env = input.env ?? process.env;
  const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);

  return loadDysflowConfigShared(input, repoConfig, (path) =>
    loadProjectConfigFromPath(path, input, env, cwd, "repo-config", requestedProjectId, fileSystem),
  );
}

export async function loadDysflowConfigAsyncWith(
  input: DysflowConfigInput,
  fileSystem: ConfigFileSystemPort,
): Promise<OperationResult<DysflowConfig>> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const repoConfig = await findRepoProjectConfigPathAsync(cwd, fileSystem);

  const env = input.env ?? process.env;
  const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);

  return loadDysflowConfigShared(input, repoConfig, (path) =>
    loadProjectConfigFromPathAsync(
      path,
      input,
      env,
      cwd,
      "repo-config",
      requestedProjectId,
      fileSystem,
    ),
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
    // #779 — the write-execution policy carries no secrets; pass it
    // through unchanged (including `undefined`) so consumer-side
    // snapshots can surface the active mode without round-tripping
    // through the un-redacted form.
    writeExecutionPolicy: config.writeExecutionPolicy,
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
    // #779 — `writeExecutionPolicy` left undefined. The MCP layer
    // resolves it to `safe-by-default` via `DEFAULT_WRITE_EXECUTION_POLICY`
    // (see write-execution-policy.ts) so this path stays in the
    // historical contract without introducing a behavioral branch here.
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
  const projectRoot = resolveProjectRoot(raw, configDir, stringValue(input.projectRoot));

  // T18 — the top-level `allowWrites` / `allowedProcedures` aliases were
  // marked deprecated and slated for removal in v1.15.0. v1.22.0 is the
  // first release after the deadline. Refuse the request with a typed
  // error so the operator migrates the project.json to the `capabilities`
  // block. Without this gate, the legacy read-through path stays alive
  // and silently produces the wrong runtime gate (see resolveCapabilities
  // below — top-level `allowWrites: false` historically closed the gate
  // even when `capabilities.allowWrites: true` opened it).
  const hasTopLevelLegacy =
    typeof raw.allowWrites === "boolean" || Array.isArray(raw.allowedProcedures);
  if (hasTopLevelLegacy) {
    const offending = [
      typeof raw.allowWrites === "boolean" ? "allowWrites" : undefined,
      Array.isArray(raw.allowedProcedures) ? "allowedProcedures" : undefined,
    ].filter((s): s is string => typeof s === "string");
    return failureResult(
      createDysflowError(
        "CONFIG_TOP_LEVEL_FIELDS_REMOVED",
        `.dysflow/project.json sets the deprecated top-level field(s) ${offending.join(", ")}. These fields were removed in v1.15.0; migrate to the top-level "capabilities" block (capabilities.allowWrites, capabilities.procedures.allow).`,
      ),
    );
  }

  const timeoutMs = resolveTimeout(input.timeoutMs ?? raw.timeoutMs);
  // Explicit request paths are caller intent and must win over repo config defaults.
  // This mirrors backendPath/destinationRoot and lets MCP callers override a stale
  // project config by passing an absolute accessPath together with projectId.
  // #619 — wrap empty/whitespace caller overrides in stringValue() so they normalize
  // to undefined and fall through to the repo-config default, mirroring buildExplicitConfig.
  const accessDbPath = resolveProjectPath(
    stringValue(input.accessDbPath) ?? raw.accessPath,
    projectRoot,
  );
  if (accessDbPath === undefined) {
    return failureResult(
      createDysflowError(
        "CONFIG_MISSING_ACCESS_PATH",
        `Project config ${resolvedPath} is missing accessPath.`,
      ),
    );
  }

  const backendPath = resolveProjectPath(
    stringValue(input.backendPath) ?? raw.backendPath,
    projectRoot,
  );
  // #13228 — an explicit caller override MUST win over the discovered repo config.
  // The discovered config is a DEFAULT, not an authority over what the caller asked
  // for. This matches buildExplicitConfig and resolveProjectRoot, which already let
  // the explicit value win; the old `raw.* ?? input.*` order let a startup project's
  // src/ overwrite a worktree export target (186-file incident).
  // #619 — wrap empty/whitespace caller overrides in stringValue() before the ?? chain
  // so a "" or "   " destinationRoot falls through to raw.destinationRoot ?? "src".
  const destinationRoot =
    resolveProjectPath(
      stringValue(input.destinationRoot) ?? raw.destinationRoot ?? "src",
      projectRoot,
    ) ?? projectRoot;
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

  // Resolve the consolidated `capabilities` block (#657, #655). T18: the
  // top-level `allowWrites` and `allowedProcedures` aliases were removed in
  // v1.15.0; the rejection happens earlier in this function (see top-level
  // guard above) so by the time we get here, the capabilities block is
  // the only authoritative source.
  const capabilitiesResolution = resolveCapabilities(raw);
  if (!capabilitiesResolution.ok) return capabilitiesResolution;
  const {
    allowWrites,
    allowedProcedures: capabilitiesAllowedProcedures,
    lintRulesOverride,
    writeExecutionPolicy,
  } = capabilitiesResolution.data;
  const discoveryResult =
    capabilitiesAllowedProcedures === undefined
      ? (input.discoverFromSrcRoot ?? NO_DISCOVERY)(destinationRoot)
      : [];

  return successResult({
    configSource,
    allowWrites,
    allowedProcedures: resolveAllowedProceduresFallback(
      capabilitiesAllowedProcedures,
      discoveryResult,
    ),
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
    // #731 — per-rule lint overrides from `capabilities.lint.rules`.
    // Undefined when the project config has no lint block.
    ...(lintRulesOverride !== undefined ? { lintRulesOverride } : {}),
    // #779 — risk-based write-execution policy. Defaults to
    // `safe-by-default` when the field is absent.
    writeExecutionPolicy,
  });
}

function loadProjectConfigFromPath(
  configPath: string,
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  cwd: string,
  configSource: DysflowConfigSource,
  projectId: string | undefined,
  fileSystem: ConfigFileSystemPort,
): OperationResult<DysflowConfig> {
  const resolvedPath = resolvePathMaybeRelative(configPath, cwd);
  if (!fileSystem.existsSync(resolvedPath)) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_NOT_FOUND",
        `Project config file not found: ${resolvedPath}`,
      ),
    );
  }

  let raw: DysflowProjectConfig;
  try {
    raw = fileSystem.readJsonSync<DysflowProjectConfig>(resolvedPath);
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
  projectId: string | undefined,
  fileSystem: ConfigFileSystemPort,
): Promise<OperationResult<DysflowConfig>> {
  const resolvedPath = resolvePathMaybeRelative(configPath, cwd);
  if (!(await fileSystem.existsAsync(resolvedPath))) {
    return failureResult(
      createDysflowError(
        "CONFIG_PROJECT_FILE_NOT_FOUND",
        `Project config file not found: ${resolvedPath}`,
      ),
    );
  }

  let raw: DysflowProjectConfig;
  try {
    raw = await fileSystem.readJsonAsync<DysflowProjectConfig>(resolvedPath);
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
  fileSystem: ConfigFileSystemPort,
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
    const standardExists = await fileSystem.existsAsync(standard);
    const compatExists = await fileSystem.existsAsync(compat);

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

function findRepoProjectConfigPath(
  cwd: string,
  fileSystem: ConfigFileSystemPort,
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
    const standardExists = fileSystem.existsSync(standard);
    const compatExists = fileSystem.existsSync(compat);

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

/**
 * Resolve the final `allowedProcedures` allowlist for the project (#658).
 *
 * Precedence (PR-3 / #658):
 *   - Explicit (`capabilities.procedures.allow` first, then top-level
 *     `allowedProcedures`) always beats discovery.
 *   - When the explicit slot is `undefined` AND discovery returned a
 *     non-empty prefix list, the discovered list is offered (sorted
 *     alphabetically to match the discovery contract).
 *   - When both are empty/missing, the result stays `undefined` (mirrors
 *     the pre-discovery contract for "nothing to seed").
 */
function resolveAllowedProceduresFallback(
  explicit: readonly string[] | undefined,
  discovered: readonly string[],
): readonly string[] | undefined {
  if (explicit !== undefined) return explicit;
  if (discovered.length > 0) return [...discovered].sort((a, b) => a.localeCompare(b));
  return undefined;
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
 * Resolve the consolidated `capabilities` block (#657) with read-through
 * fallback to the deprecated top-level `allowWrites` / `allowedProcedures`
 * fields.
 *
 * Precedence (#657):
 *
 *   1. If `capabilities` carries any setting (allowWrites OR procedures), it
 *      is the source of truth. `capabilities.allowWrites` resolves
 *      `allowWrites`. The procedure allowlist is `capabilities.procedures.allow`
 *      when defined (including the empty-array default-deny signal); when
 *      absent, it falls through to the deprecated `allowedProcedures` slot.
 *   2. If `capabilities` is absent, the deprecated top-level fields are used
 *      verbatim (no warning — they are the only thing the user has set).
 *   3. If BOTH `capabilities` AND at least one deprecated top-level field are
 *      present, `capabilities` wins and a SINGLE deprecation warning is
 *      surfaced so the consumer can find the duplicate. The user is not
 *      pummeled with one warning per field.
 *
 * `procedures.deny` is advisory only and is NOT projected into
 * `DysflowConfig.allowedProcedures` — the runtime gate stays `allow`. The
 * shape is preserved so a future PR can wire the denylist without breaking
 * `.dysflow/project.json` consumers.
 */
function resolveCapabilities(raw: DysflowProjectConfig): OperationResult<{
  allowWrites: boolean;
  allowedProcedures: readonly string[] | undefined;
  /** #731 — per-rule lint overrides from `capabilities.lint.rules`. */
  lintRulesOverride: Readonly<Partial<Record<LintRuleId, LintRuleOverride>>> | undefined;
  /**
   * Issue #779 — risk-based write-execution policy. `undefined` when the
   * `capabilities` block does not declare one (back-compat with every
   * project.json before v2.1.0). Any declared value is validated against
   * the closed union; unparseable values surface as
   * `CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY` so a typo cannot silently flip
   * the runtime mode.
   */
  writeExecutionPolicy: WriteExecutionPolicy | undefined;
}> {
  const capabilities = raw.capabilities;
  // T18: the top-level `allowWrites` / `allowedProcedures` fields were
  // removed in v1.15.0. The caller (`buildProjectConfig`) rejects them
  // with `CONFIG_TOP_LEVEL_FIELDS_REMOVED` before we ever reach here, so
  // we can assume they are absent. The previous read-through fallback
  // path that silently produced the wrong runtime gate is gone.
  const capabilitiesAllowWrites = capabilities?.allowWrites;
  const capabilitiesAllow = capabilities?.procedures?.allow;
  const capabilitiesWriteExecutionPolicy = capabilities?.writeExecutionPolicy;

  // #779 — strict validation. The defense-in-depth wrapper
  // (`parseWriteExecutionPolicyValue`) lets through only the closed union.
  // Anything else surfaces as a typed error so the operator fixes
  // `project.json` instead of the runtime silently flipping to
  // `safe-by-default` (which would mask a typo that was supposed to opt
  // into the developer loop).
  let writeExecutionPolicy: WriteExecutionPolicy | undefined;
  if (capabilitiesWriteExecutionPolicy !== undefined) {
    if (typeof capabilitiesWriteExecutionPolicy !== "string") {
      return failureResult(
        createDysflowError(
          "CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY",
          `capabilities.writeExecutionPolicy must be a string. Received: ${JSON.stringify(capabilitiesWriteExecutionPolicy)}. Valid values: "safe-by-default", "developer".`,
        ),
      );
    }
    const parsed = parseWriteExecutionPolicyValue(capabilitiesWriteExecutionPolicy);
    if (parsed === undefined) {
      return failureResult(
        createDysflowError(
          "CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY",
          `capabilities.writeExecutionPolicy='${capabilitiesWriteExecutionPolicy}' is not a recognized policy. Valid values: "safe-by-default", "developer".`,
        ),
      );
    }
    writeExecutionPolicy = parsed;
  }

  return successResult({
    allowWrites: capabilitiesAllowWrites === true,
    allowedProcedures: capabilitiesAllow === undefined ? undefined : [...capabilitiesAllow],
    lintRulesOverride: normalizeLintRulesOverride(capabilities?.lint?.rules),
    writeExecutionPolicy,
  });
}

const KNOWN_LINT_RULE_IDS: readonly LintRuleId[] = [
  "option-declaration",
  "identifier-safety",
  "declaration-order",
  "arg-type-match",
  "forbidden-name",
];

/**
 * #731 — validates `capabilities.lint.rules`. Returns the sanitized
 * `Readonly<Partial<Record<LintRuleId, LintRuleOverride>>>` or, when an
 * unknown rule id is present, throws `DYSFLOW_CONFIG_UNKNOWN_LINT_RULE`
 * so a config typo surfaces at boot rather than as a silently-no-op
 * lint rule.
 */
function normalizeLintRulesOverride(
  raw: Readonly<Partial<Record<LintRuleId, LintRuleOverride>>> | undefined,
): Readonly<Partial<Record<LintRuleId, LintRuleOverride>>> | undefined {
  if (raw === undefined) return undefined;
  const known = new Set<string>(KNOWN_LINT_RULE_IDS);
  const sanitized: Partial<Record<LintRuleId, LintRuleOverride>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) {
      throw createDysflowError(
        "DYSFLOW_CONFIG_UNKNOWN_LINT_RULE",
        `capabilities.lint.rules.${key} is not a known lint rule id. Known ids: ${KNOWN_LINT_RULE_IDS.join(", ")}.`,
      );
    }
    if (value === undefined || typeof value !== "object") continue;
    const override = value as LintRuleOverride;
    if (typeof override.enabled !== "boolean") continue;
    sanitized[key as LintRuleId] = {
      enabled: override.enabled,
      ...(typeof override.reason === "string" ? { reason: override.reason } : {}),
    };
  }
  return sanitized;
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
