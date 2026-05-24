import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
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
const LEGACY_PROJECT_CONFIG_PATH = "dysflow.project.json";
const DEFAULT_LEGACY_ACCESS_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

export type DysflowConfigSource = "explicit-request" | "repo-config" | "runtime-default";

export type DysflowProjectConfig = {
	id?: string;
	name?: string;
	allowWrites?: boolean;
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

export type DysflowConfig = {
	configSource: DysflowConfigSource;
	allowWrites: boolean;
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
	accessPassword?: string;
	backendPassword?: string;
	timeoutMs?: number;
	cwd?: string;
	env?: Record<string, string | undefined>;
};

export function loadDysflowConfigShared<
	T extends OperationResult<DysflowConfig> | Promise<OperationResult<DysflowConfig>>,
>(
	input: DysflowConfigInput,
	repoConfig:
		| { found: "none" }
		| { found: "legacy" | "standard"; path: string }
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
	if (repoConfig.found === "standard" || repoConfig.found === "legacy") {
		return loadFromPath(repoConfig.path);
	}
	if (requestedProjectId !== undefined) {
		// Global registry is deprecated. projectId must resolve via per-repo .dysflow/project.json.
		// TODO(v0.9.0): remove this error path after confirming no users on global projects.json
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

export function loadDysflowConfig(
	input: DysflowConfigInput = {},
): OperationResult<DysflowConfig> {
	const cwd = resolve(input.cwd ?? process.cwd());
	const repoConfig = findRepoProjectConfigPath(cwd);

	const env = input.env ?? process.env;
	const requestedProjectId = stringValue(input.projectId) ?? stringValue(input.contextId);

	return loadDysflowConfigShared(input, repoConfig, (path) =>
		loadProjectConfigFromPath(
			path,
			input,
			env,
			cwd,
			"repo-config",
			requestedProjectId,
		),
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
		loadProjectConfigFromPathAsync(
			path,
			input,
			env,
			cwd,
			"repo-config",
			requestedProjectId,
		),
	);
}

export function redactDysflowConfig(
	config: DysflowConfig,
): RedactedDysflowConfig {
	const base = {
		configSource: config.configSource,
		allowWrites: config.allowWrites,
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
		allowWrites: false,
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
		allowWrites: raw.allowWrites === true,
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

	return loadProjectConfigCore(
		resolvedPath,
		raw,
		input,
		env,
		configSource,
		projectId,
	);
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

	return loadProjectConfigCore(
		resolvedPath,
		raw,
		input,
		env,
		configSource,
		projectId,
	);
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
	if (requestedProjectId !== undefined && configuredProjectId !== undefined && requestedProjectId !== configuredProjectId) {
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

async function findRepoProjectConfigPathAsync(cwd: string): Promise<{ found: "none" } | { found: "legacy" | "standard", path: string } | { found: "ambiguous", paths: [string, string] }> {
	const standard = resolve(cwd, DEFAULT_PROJECT_CONFIG_PATH);
	const legacy = resolve(cwd, LEGACY_PROJECT_CONFIG_PATH);
	const standardExists = await pathExists(standard);
	const legacyExists = await pathExists(legacy);

	if (standardExists && legacyExists) {
		return { found: "ambiguous", paths: [standard, legacy] };
	}
	if (standardExists) {
		return { found: "standard", path: standard };
	}
	if (legacyExists) {
		return { found: "legacy", path: legacy };
	}
	return { found: "none" };
}

async function pathExists(candidate: string): Promise<boolean> {
	try {
		await access(candidate);
		return true;
	} catch {
		return false;
	}
}

function findRepoProjectConfigPath(cwd: string): { found: "none" } | { found: "legacy" | "standard", path: string } | { found: "ambiguous", paths: [string, string] } {
	const standard = resolve(cwd, DEFAULT_PROJECT_CONFIG_PATH);
	const legacy = resolve(cwd, LEGACY_PROJECT_CONFIG_PATH);
	const standardExists = existsSync(standard);
	const legacyExists = existsSync(legacy);

	if (standardExists && legacyExists) {
		return { found: "ambiguous", paths: [standard, legacy] };
	}
	if (standardExists) {
		return { found: "standard", path: standard };
	}
	if (legacyExists) {
		return { found: "legacy", path: legacy };
	}
	return { found: "none" };
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
