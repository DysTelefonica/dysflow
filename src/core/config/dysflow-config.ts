import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const REDACTED_SECRET = "[REDACTED]";
const DEFAULT_PROJECT_CONFIG_FILENAMES = [".dysflow/project.json", "dysflow.project.json"] as const;
const DEFAULT_LEGACY_ACCESS_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

export type DysflowConfigSource = "explicit-request" | "project-registry" | "worktree-config" | "legacy-env";

export type DysflowProjectConfig = {
  id?: string;
  name?: string;
  accessPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  timeoutMs?: number;
  accessPasswordEnv?: string;
  backendPasswordEnv?: string;
  frontendPasswordEnv?: string;
  passwordEnv?: string;
};

export type DysflowProjectRegistry = {
  projects?: Record<string, string | { configPath?: string; path?: string; projectRoot?: string }>;
};

export type DysflowConfig = {
  configSource: DysflowConfigSource;
  accessDbPath: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  projectId?: string;
  timeoutMs: number;
  processTimeoutMs: number;
  accessPassword?: string;
  backendPassword?: string;
  accessPasswordEnv?: string;
  backendPasswordEnv?: string;
  configPath?: string;
};

export type RedactedDysflowConfig = Omit<DysflowConfig, "accessPassword" | "backendPassword"> & {
  accessPassword?: typeof REDACTED_SECRET;
  backendPassword?: typeof REDACTED_SECRET;
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
  projectRegistryPath?: string;
  accessPassword?: string;
  backendPassword?: string;
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export function loadDysflowConfig(input: DysflowConfigInput = {}): OperationResult<DysflowConfig> {
  const env = input.env ?? process.env;
  const cwd = resolve(input.cwd ?? process.cwd());

  const explicitAccessDbPath = normalizePathValue(input.accessDbPath);
  if (explicitAccessDbPath !== undefined) {
    return buildExplicitConfig(input, env, cwd, explicitAccessDbPath);
  }

  const projectId = normalizePathValue(input.projectId)
    ?? normalizePathValue(input.contextId)
    ?? normalizePathValue(env.DYSFLOW_PROJECT_ID)
    ?? normalizePathValue(env.DYSFLOW_CONTEXT_ID);
  if (projectId !== undefined) {
    return loadProjectIdConfig(projectId, input, env, cwd);
  }

  const projectConfigPath = normalizePathValue(input.projectConfigPath) ?? normalizePathValue(env.DYSFLOW_PROJECT_CONFIG_PATH);
  if (projectConfigPath !== undefined) {
    return loadProjectConfigFromPath(projectConfigPath, input, env, cwd, "project-registry");
  }

  const worktreeConfigPath = findWorktreeProjectConfigPath(cwd);
  if (worktreeConfigPath !== undefined) {
    return loadProjectConfigFromPath(worktreeConfigPath, input, env, cwd, "worktree-config");
  }

  const legacyAccessDbPath = normalizePathValue(env.DYSFLOW_ACCESS_DB_PATH);
  if (legacyAccessDbPath !== undefined) {
    return buildLegacyEnvConfig(input, env, cwd, legacyAccessDbPath);
  }

  return failureResult(
    createDysflowError(
      "CONFIG_MISSING_ACCESS_PATH",
      "Access database path is required. Set DYSFLOW_ACCESS_DB_PATH, define .dysflow/project.json, or pass accessDbPath/projectId.",
    ),
  );
}

export function redactDysflowConfig(config: DysflowConfig): RedactedDysflowConfig {
  const base = {
    configSource: config.configSource,
    accessDbPath: config.accessDbPath,
    backendPath: config.backendPath,
    destinationRoot: config.destinationRoot,
    projectRoot: config.projectRoot,
    projectId: config.projectId,
    timeoutMs: config.timeoutMs,
    processTimeoutMs: config.processTimeoutMs,
    accessPasswordEnv: config.accessPasswordEnv,
    backendPasswordEnv: config.backendPasswordEnv,
    configPath: config.configPath,
  };

  return {
    ...base,
    ...(config.accessPassword !== undefined ? { accessPassword: REDACTED_SECRET } : {}),
    ...(config.backendPassword !== undefined ? { backendPassword: REDACTED_SECRET } : {}),
  };
}

function buildExplicitConfig(input: DysflowConfigInput, env: Record<string, string | undefined>, cwd: string, accessDbPath: string): OperationResult<DysflowConfig> {
  const timeoutMs = resolveTimeout(input.timeoutMs, env.DYSFLOW_TIMEOUT_MS);
  return successResult({
    configSource: "explicit-request",
    accessDbPath,
    backendPath: normalizePathValue(input.backendPath) ?? normalizePathValue(env.DYSFLOW_BACKEND_PATH) ?? normalizePathValue(env.DYSFLOW_BACKEND_DB_PATH),
    destinationRoot: normalizePathValue(input.destinationRoot) ?? normalizePathValue(env.DYSFLOW_DESTINATION_ROOT) ?? cwd,
    projectRoot: normalizePathValue(input.projectRoot) ?? normalizePathValue(env.DYSFLOW_PROJECT_ROOT) ?? cwd,
    projectId: normalizePathValue(input.projectId) ?? normalizePathValue(input.contextId) ?? normalizePathValue(env.DYSFLOW_PROJECT_ID) ?? normalizePathValue(env.DYSFLOW_CONTEXT_ID),
    timeoutMs,
    processTimeoutMs: timeoutMs,
    accessPassword: resolvePassword(input.accessPassword, env.DYSFLOW_ACCESS_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV]),
    backendPassword: resolvePassword(input.backendPassword, env.DYSFLOW_BACKEND_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV]),
  });
}

function buildLegacyEnvConfig(input: DysflowConfigInput, env: Record<string, string | undefined>, cwd: string, accessDbPath: string): OperationResult<DysflowConfig> {
  const timeoutMs = resolveTimeout(input.timeoutMs, env.DYSFLOW_TIMEOUT_MS);
  return successResult({
    configSource: "legacy-env",
    accessDbPath,
    backendPath: normalizePathValue(input.backendPath) ?? normalizePathValue(env.DYSFLOW_BACKEND_PATH) ?? normalizePathValue(env.DYSFLOW_BACKEND_DB_PATH),
    destinationRoot: normalizePathValue(input.destinationRoot) ?? normalizePathValue(env.DYSFLOW_DESTINATION_ROOT) ?? cwd,
    projectRoot: normalizePathValue(input.projectRoot) ?? normalizePathValue(env.DYSFLOW_PROJECT_ROOT) ?? cwd,
    projectId: normalizePathValue(input.projectId) ?? normalizePathValue(input.contextId) ?? normalizePathValue(env.DYSFLOW_PROJECT_ID) ?? normalizePathValue(env.DYSFLOW_CONTEXT_ID),
    timeoutMs,
    processTimeoutMs: timeoutMs,
    accessPassword: resolvePassword(input.accessPassword, env.DYSFLOW_ACCESS_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV]),
    backendPassword: resolvePassword(input.backendPassword, env.DYSFLOW_BACKEND_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV]),
  });
}

function loadProjectIdConfig(projectId: string, input: DysflowConfigInput, env: Record<string, string | undefined>, cwd: string): OperationResult<DysflowConfig> {
  const registryPath = resolveRegistryPath(input.projectRegistryPath ?? env.DYSFLOW_PROJECTS_REGISTRY_PATH, cwd, env);
  if (registryPath === undefined) {
    return failureResult(createDysflowError("CONFIG_PROJECT_REGISTRY_MISSING", "Project registry not found. Set DYSFLOW_PROJECTS_REGISTRY_PATH or create %APPDATA%/dysflow/projects.json."));
  }

  const registry = readJsonFile<DysflowProjectRegistry>(registryPath);
  const entry = registry.projects?.[projectId];
  if (entry === undefined) {
    return failureResult(createDysflowError("CONFIG_PROJECT_NOT_FOUND", `Project '${projectId}' was not found in ${registryPath}.`));
  }

  const projectConfigPath = resolveProjectConfigPathFromRegistryEntry(entry, registryPath);
  if (projectConfigPath === undefined) {
    return failureResult(createDysflowError("CONFIG_PROJECT_PATH_MISSING", `Project '${projectId}' has no config path in registry.`));
  }

  return loadProjectConfigFromPath(projectConfigPath, { ...input, projectId }, env, cwd, "project-registry", projectId);
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
    return failureResult(createDysflowError("CONFIG_PROJECT_FILE_NOT_FOUND", `Project config file not found: ${resolvedPath}`));
  }

  const config = readJsonFile<DysflowProjectConfig>(resolvedPath);
  const configDir = dirname(resolvedPath);
  const projectRoot = resolveProjectRoot(config, configDir, input.projectRoot);
  const timeoutMs = resolveTimeout(input.timeoutMs ?? config.timeoutMs, env.DYSFLOW_TIMEOUT_MS);
  const accessDbPath = resolveProjectPath(config.accessPath ?? input.accessDbPath, projectRoot);
  if (accessDbPath === undefined) {
    return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH", `Project config ${resolvedPath} is missing accessPath.`));
  }

  const backendPath = resolveProjectPath(config.backendPath ?? input.backendPath, projectRoot);
  const destinationRoot = resolveProjectPath(config.destinationRoot ?? input.destinationRoot ?? "src", projectRoot) ?? projectRoot;
  const accessPasswordEnv = resolvePasswordEnv(config);
  const backendPasswordEnv = resolveBackendPasswordEnv(config);
  const accessPassword = resolvePassword(
    input.accessPassword,
    pickFirstDefined(
      accessPasswordEnv !== undefined ? env[accessPasswordEnv] : undefined,
      env.DYSFLOW_ACCESS_PASSWORD,
      env.DYSFLOW_ACCESS_PWD,
      env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV],
    ),
  );
  const backendPassword = resolvePassword(
    input.backendPassword,
    pickFirstDefined(
      backendPasswordEnv !== undefined ? env[backendPasswordEnv] : undefined,
      env.DYSFLOW_BACKEND_PASSWORD,
      env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV],
    ),
  );

  return successResult({
    configSource,
    accessDbPath,
    backendPath,
    destinationRoot,
    projectRoot,
    projectId: projectId ?? normalizeNameValue(config.id),
    timeoutMs,
    processTimeoutMs: timeoutMs,
    accessPassword,
    backendPassword,
    accessPasswordEnv,
    backendPasswordEnv,
    configPath: resolvedPath,
  });
}

function resolveProjectRoot(config: DysflowProjectConfig, configDir: string, explicitProjectRoot?: string): string {
  const baseProjectRoot = basename(configDir).toLowerCase() === ".dysflow" ? dirname(configDir) : configDir;
  const rootValue = normalizePathValue(explicitProjectRoot) ?? normalizePathValue(config.projectRoot);

  return rootValue !== undefined ? resolveProjectPath(rootValue, baseProjectRoot) ?? baseProjectRoot : baseProjectRoot;
}

function resolveProjectPath(value: string | undefined, projectRoot: string): string | undefined {
  const normalized = normalizePathValue(value);
  if (normalized === undefined) return undefined;
  return isAbsolute(normalized) ? resolve(normalized) : resolve(projectRoot, normalized);
}

function resolvePathMaybeRelative(value: string, cwd: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

function resolveRegistryPath(explicitPath: string | undefined, cwd: string, env: Record<string, string | undefined>): string | undefined {
  const direct = normalizePathValue(explicitPath);
  if (direct !== undefined) return isAbsolute(direct) ? resolve(direct) : resolve(cwd, direct);

  const appData = normalizePathValue(env.APPDATA)
    ?? (normalizePathValue(env.USERPROFILE) !== undefined ? resolve(env.USERPROFILE, "AppData", "Roaming") : undefined);
  if (appData === undefined) return undefined;
  return resolve(appData, "dysflow", "projects.json");
}

function resolveProjectConfigPathFromRegistryEntry(entry: string | { configPath?: string; path?: string; projectRoot?: string }, registryPath: string): string | undefined {
  if (typeof entry === "string") {
    return resolvePathRelativeToRegistry(entry, registryPath);
  }

  if (!isRecord(entry)) return undefined;

  const entryPath = normalizeNameValue(entry.configPath) ?? normalizeNameValue(entry.path);
  if (entryPath === undefined) return undefined;
  return resolvePathRelativeToRegistry(entryPath, registryPath);
}

function resolvePathRelativeToRegistry(value: string, registryPath: string): string {
  const normalized = normalizePathValue(value);
  if (normalized === undefined) return value;
  return isAbsolute(normalized) ? resolve(normalized) : resolve(dirname(registryPath), normalized);
}

function findWorktreeProjectConfigPath(cwd: string): string | undefined {
  const candidates = DEFAULT_PROJECT_CONFIG_FILENAMES
    .map((relative) => resolve(cwd, relative))
    .filter((path) => existsSync(path));
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1 && resolve(candidates[0]) !== resolve(candidates[1])) {
    throw new Error(`Ambiguous project config in ${cwd}: ${candidates.join(", ")}`);
  }
  return candidates[0];
}

function resolveTimeout(explicitTimeoutMs: number | undefined, envTimeoutMs: string | undefined): number {
  if (explicitTimeoutMs !== undefined) {
    return Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > 0 ? explicitTimeoutMs : DEFAULT_TIMEOUT_MS;
  }
  return parseTimeout(envTimeoutMs);
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function resolvePassword(explicitPassword: string | undefined, envPassword: string | undefined): string | undefined {
  return normalizeNameValue(explicitPassword) ?? normalizeNameValue(envPassword);
}

function normalizePathValue(value: string | undefined): string | undefined {
  return normalizeNameValue(value);
}

function normalizeNameValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolvePasswordEnv(config: DysflowProjectConfig): string | undefined {
  return normalizeNameValue(config.passwordEnv)
    ?? normalizeNameValue(config.accessPasswordEnv)
    ?? normalizeNameValue(config.frontendPasswordEnv)
    ?? normalizeNameValue(config.backendPasswordEnv);
}

function resolveBackendPasswordEnv(config: DysflowProjectConfig): string | undefined {
  return normalizeNameValue(config.backendPasswordEnv)
    ?? normalizeNameValue(config.passwordEnv)
    ?? normalizeNameValue(config.accessPasswordEnv)
    ?? normalizeNameValue(config.frontendPasswordEnv);
}

function pickFirstDefined<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}
