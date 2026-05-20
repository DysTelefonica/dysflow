import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
	createDysflowError,
	failureResult,
	successResult,
	type OperationResult,
} from "../contracts/index.js";
import {
	REDACTED_SECRET,
	stringValue,
	readJsonFileAsync,
	readJsonFileSync,
} from "../utils/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PROJECT_CONFIG_PATH = ".dysflow/project.json";
const DEFAULT_LEGACY_ACCESS_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

export type DysflowConfigSource = "explicit-request" | "repo-config" | "global-registry" | "runtime-default";

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
	projects?: Record<
		string,
		string | { configPath?: string; path?: string; projectRoot?: string }
	>;
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

export type RedactedDysflowConfig = Omit<
	DysflowConfig,
	"accessPassword" | "backendPassword"
> & {
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

export function loadDysflowConfig(
	input: DysflowConfigInput = {},
): OperationResult<DysflowConfig> {
	const env = input.env ?? process.env;
	const cwd = resolve(input.cwd ?? process.cwd());

	const explicitAccessDbPath = stringValue(input.accessDbPath);
	if (explicitAccessDbPath !== undefined) {
		return buildExplicitConfig(input, env, cwd, explicitAccessDbPath);
	}

	const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);
	if (requestedProjectId !== undefined) {
		const registeredConfigPath = resolveRegisteredProjectConfigPath(
			requestedProjectId,
			input,
			env,
			cwd,
		);
		if (registeredConfigPath === undefined) {
			return failureResult(
				createDysflowError(
					"CONFIG_PROJECT_NOT_REGISTERED",
					`Project '${requestedProjectId}' is not registered. Refusing to fall back to cwd.`,
				),
			);
		}
		return loadProjectConfigFromPath(
			registeredConfigPath,
			input,
			env,
			cwd,
			"global-registry",
			requestedProjectId,
		);
	}

	const repoConfigPath = findRepoProjectConfigPath(cwd);
	if (repoConfigPath !== undefined) {
		return loadProjectConfigFromPath(
			repoConfigPath,
			input,
			env,
			cwd,
			"repo-config",
		);
	}

	return failureResult(
		createDysflowError(
			"CONFIG_MISSING_ACCESS_PATH",
			"Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
		),
	);
}


export async function loadDysflowConfigAsync(
	input: DysflowConfigInput = {},
): Promise<OperationResult<DysflowConfig>> {
	const env = input.env ?? process.env;
	const cwd = resolve(input.cwd ?? process.cwd());

	const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);
	const explicitAccessDbPath = stringValue(input.accessDbPath);

	// Prioritize repo config when called from the same directory as the project.
	// This preserves project.json timeoutMs and other settings when accessPath is
	// supplied without going through the global registry path (#timeout-fix).
	if (explicitAccessDbPath !== undefined) {
		return buildExplicitConfig(input, env, cwd, explicitAccessDbPath);
	}

	if (requestedProjectId !== undefined) {
		const registeredConfigPath = await resolveRegisteredProjectConfigPathAsync(
			requestedProjectId,
			input,
			env,
			cwd,
		);
		if (registeredConfigPath === undefined) {
			return failureResult(
				createDysflowError(
					"CONFIG_PROJECT_NOT_REGISTERED",
					`Project '${requestedProjectId}' is not registered. Refusing to fall back to cwd.`,
				),
			);
		}
		return loadProjectConfigFromPathAsync(
			registeredConfigPath,
			input,
			env,
			cwd,
			"global-registry",
			requestedProjectId,
		);
	}

	const repoConfigPath = await findRepoProjectConfigPathAsync(cwd);
	if (repoConfigPath !== undefined) {
		return loadProjectConfigFromPathAsync(
			repoConfigPath,
			input,
			env,
			cwd,
			"repo-config",
		);
	}

	return failureResult(
		createDysflowError(
			"CONFIG_MISSING_ACCESS_PATH",
			"Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
		),
	);
}

export function redactDysflowConfig(
	config: DysflowConfig,
): RedactedDysflowConfig {
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
		...(config.accessPassword === undefined
			? {}
			: { accessPassword: REDACTED_SECRET }),
		...(config.backendPassword === undefined
			? {}
			: { backendPassword: REDACTED_SECRET }),
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
		accessDbPath,
		backendPath: stringValue(input.backendPath),
		destinationRoot: stringValue(input.destinationRoot) ?? cwd,
		projectRoot: stringValue(input.projectRoot) ?? cwd,
		projectId: stringValue(input.projectId) ?? stringValue(input.contextId),
		timeoutMs,
		processTimeoutMs: timeoutMs,
		accessPassword: resolvePassword(
			input.accessPassword,
			env.DYSFLOW_ACCESS_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV],
		),
		backendPassword: resolvePassword(
			input.backendPassword,
			env.DYSFLOW_BACKEND_PASSWORD ?? env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV],
		),
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
	const accessDbPath = resolveProjectPath(
		raw.accessPath ?? input.accessDbPath,
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
		raw.backendPath ?? input.backendPath,
		projectRoot,
	);
	const destinationRoot =
		resolveProjectPath(
			raw.destinationRoot ?? input.destinationRoot ?? "src",
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
			env[DEFAULT_LEGACY_ACCESS_PASSWORD_ENV],
		),
	);
	const backendPassword = resolvePassword(
		input.backendPassword,
		pickFirstDefined(
			backendPasswordEnv === undefined ? undefined : env[backendPasswordEnv],
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
		projectId: projectIdOverride ?? stringValue(raw.id),
		timeoutMs,
		processTimeoutMs: timeoutMs,
		accessPassword,
		backendPassword,
		accessPasswordEnv,
		backendPasswordEnv,
		configPath: resolvedPath,
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

	return buildProjectConfig(raw, {
		resolvedPath,
		configSource,
		projectIdOverride: projectId,
		input,
		env,
	});
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
		basename(configDir).toLowerCase() === ".dysflow"
			? dirname(configDir)
			: configDir;
	const rootValue =
		stringValue(explicitProjectRoot) ?? stringValue(config.projectRoot);

	return rootValue === undefined
		? baseProjectRoot
		: (resolveProjectPath(rootValue, baseProjectRoot) ?? baseProjectRoot);
}

function resolveProjectPath(
	value: string | undefined,
	projectRoot: string,
): string | undefined {
	const normalized = stringValue(value);
	if (normalized === undefined) return undefined;
	return isAbsolute(normalized)
		? resolve(normalized)
		: resolve(projectRoot, normalized);
}

function resolvePathMaybeRelative(value: string, cwd: string): string {
	return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

/**
 * Pure transformation: given a registry entry and the directory that contains
 * the registry file, resolve the absolute path to the project config file.
 *
 * This helper is shared by the sync and async registry-resolution variants so
 * that the lookup logic lives in exactly one place (#195).
 */
function resolveRegistryEntry(
	entry: string | { configPath?: string; path?: string; projectRoot?: string },
	registryDir: string,
): string | undefined {
	if (typeof entry === "string") return resolveRegisteredPath(entry, registryDir);
	const configPath = stringValue(entry.configPath);
	if (configPath !== undefined) return resolveRegisteredPath(configPath, registryDir);
	const projectRoot = stringValue(entry.projectRoot) ?? stringValue(entry.path);
	if (projectRoot !== undefined) {
		const resolvedProjectRoot = resolveRegisteredPath(projectRoot, registryDir);
		return resolvedProjectRoot === undefined
			? undefined
			: resolve(resolvedProjectRoot, DEFAULT_PROJECT_CONFIG_PATH);
	}
	return undefined;
}

function resolveRegisteredProjectConfigPath(
	projectId: string,
	input: DysflowConfigInput,
	env: Record<string, string | undefined>,
	cwd: string,
): string | undefined {
	const registryPath = resolveProjectRegistryPath(input, env, cwd);
	if (!existsSync(registryPath)) return undefined;
	let registry: DysflowProjectRegistry;
	try {
		registry = readJsonFileSync<DysflowProjectRegistry>(registryPath);
	} catch (err) {
		console.warn(`[dysflow] Project registry file is not valid JSON: ${registryPath}. ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
	const entry = registry.projects?.[projectId];
	if (entry === undefined) return undefined;
	return resolveRegistryEntry(entry, dirname(registryPath));
}


async function resolveRegisteredProjectConfigPathAsync(
	projectId: string,
	input: DysflowConfigInput,
	env: Record<string, string | undefined>,
	cwd: string,
): Promise<string | undefined> {
	const registryPath = resolveProjectRegistryPath(input, env, cwd);
	if (!(await pathExists(registryPath))) return undefined;
	let registry: DysflowProjectRegistry;
	try {
		registry = await readJsonFileAsync<DysflowProjectRegistry>(registryPath);
	} catch (err) {
		console.warn(`[dysflow] Project registry file is not valid JSON: ${registryPath}. ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
	const entry = registry.projects?.[projectId];
	if (entry === undefined) return undefined;
	return resolveRegistryEntry(entry, dirname(registryPath));
}

async function findRepoProjectConfigPathAsync(cwd: string): Promise<string | undefined> {
	const candidate = resolve(cwd, DEFAULT_PROJECT_CONFIG_PATH);
	return (await pathExists(candidate)) ? candidate : undefined;
}

async function pathExists(candidate: string): Promise<boolean> {
	try {
		await access(candidate);
		return true;
	} catch {
		return false;
	}
}

function resolveRegisteredPath(value: string, registryDir: string): string | undefined {
	const resolved = resolvePathMaybeRelative(value, registryDir);
	if (isAbsolute(value)) {
		if (!isPathInside(resolved, registryDir)) {
			// ADR-7: warn-only (back-compat). Future versions may hard-block this.
			console.warn(
				`[dysflow] registry entry uses absolute path outside registry directory — consider using a relative path: ${resolved}`,
			);
		}
		return resolved;
	}
	return isPathInside(resolved, registryDir) ? resolved : undefined;
}

function isPathInside(candidate: string, base: string): boolean {
	const relativePath = relative(resolve(base), resolve(candidate));
	return relativePath.length === 0 || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function resolveProjectRegistryPath(
	input: Pick<DysflowConfigInput, "projectRegistryPath"> = {},
	env: Record<string, string | undefined> = process.env,
	cwd: string = process.cwd(),
): string {
	const explicit = stringValue(input.projectRegistryPath) ?? stringValue(env.DYSFLOW_PROJECT_REGISTRY_PATH);
	if (explicit !== undefined) return resolvePathMaybeRelative(explicit, cwd);
	const home = stringValue(env.LOCALAPPDATA) ?? stringValue(env.HOME) ?? cwd;
	return join(home, "dysflow", "projects.json");
}

function findRepoProjectConfigPath(cwd: string): string | undefined {
	const candidate = resolve(cwd, DEFAULT_PROJECT_CONFIG_PATH);
	return existsSync(candidate) ? candidate : undefined;
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

function resolveBackendPasswordEnv(
	config: DysflowProjectConfig,
): string | undefined {
	return stringValue(config.backendPasswordEnv);
}

function pickFirstDefined<T>(...values: (T | undefined)[]): T | undefined {
	return values.find((value) => value !== undefined);
}
