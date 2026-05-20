import {
	access,
	cp,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { accessSync, constants, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { compareVersions } from "../../core/utils/version.js";
import type { CliResult } from "./types.js";

const INSTALL_USAGE =
	"Usage: dysflow install [--runtime-dir <dir>] [--agents <codex,opencode,claude,pi>] [--agent-all] [--no-tui]";
const UPDATE_USAGE = "Usage: dysflow update [--runtime-dir <dir>] [--force]";

export type AgentName = "codex" | "opencode" | "claude" | "pi";
export const ALL_AGENTS = ["codex", "opencode", "claude", "pi"] as const;
const GITHUB_REPO_URL = "https://github.com/DysTelefonica/dysflow.git";
const GITHUB_LATEST_RELEASE_API =
	"https://api.github.com/repos/DysTelefonica/dysflow/releases/latest";
export const MAX_PACKAGE_ROOT_DEPTH = 12;
export const MAX_SUBPROCESS_BUFFER_BYTES = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export type ReleaseInfo = {
	version: string;
	tagName?: string;
};

export type PreparedReleasePackage = {
	packageRoot: string;
	commitSha?: string;
	cleanup?: () => Promise<void>;
};

export type ReleaseUpdateProvider = {
	resolveLatestRelease(): Promise<ReleaseInfo>;
	preparePackage(release: ReleaseInfo): Promise<PreparedReleasePackage>;
};

type InstallOptions = {
	runtimeDir?: string;
	agentNames: AgentName[];
	interactive: boolean;
};

type UpdateOptions = {
	runtimeDir?: string;
	force: boolean;
};

const RUNTIME_MARKER_FILE = ".dysflow-marker";
const RUNTIME_MARKER_VERSION = "1";
const RUNTIME_MARKER_PATH_ENV = "DYSFLOW_RUNTIME_MARKER_PATH";

type RuntimePaths = {
	runtimeDir: string;
	appDir: string;
	binDir: string;
	readmePath: string;
	changelogPath: string;
	distSource: string;
	scriptsSource: string;
	scriptsDest: string;
	packageJsonSource: string;
	packageJsonDest: string;
};

type AgentConfigPaths = {
	codex: string;
	opencode: string;
	claudeDesktop: string;
	claudeSettings: string;
	pi: string;
};

export function parseAgentList(
	raw: string | undefined,
): { ok: true; agents: AgentName[] } | { ok: false; message: string } {
	if (raw === undefined) {
		return { ok: true, agents: [] };
	}

	const names = raw
		.split(",")
		.map((name) => name.trim().toLowerCase())
		.filter((name) => name.length > 0);
	const unknown = names.filter(
		(name) => !ALL_AGENTS.includes(name as AgentName),
	);

	if (unknown.length > 0) {
		return { ok: false, message: `Unknown agent(s): ${unknown.join(", ")}.` };
	}

	return { ok: true, agents: Array.from(new Set(names as AgentName[])) };
}

export function parseInstallArgs(
	args: readonly string[],
): { ok: true; options: InstallOptions } | { ok: false; message: string } {
	if (args.includes("--help") || args.includes("-h")) {
		return { ok: false, message: INSTALL_USAGE };
	}

	const options: InstallOptions = {
		agentNames: [],
		interactive: true,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--runtime-dir") {
			const runtimeDir = args[index + 1];
			if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
				return { ok: false, message: "Missing value for --runtime-dir." };
			}
			options.runtimeDir = runtimeDir;
			index += 1;
			continue;
		}

		if (arg === "--agents") {
			const parsed = parseAgentList(args[index + 1]);
			if (!parsed.ok) {
				return { ok: false, message: parsed.message };
			}
			options.agentNames = parsed.agents;
			options.interactive = false;
			index += 1;
			continue;
		}

		if (arg === "--agent-all") {
			options.interactive = false;
			options.agentNames = [...ALL_AGENTS];
			continue;
		}

		if (arg === "--no-tui") {
			options.interactive = false;
			continue;
		}

		return { ok: false, message: `Unsupported install option: ${arg}` };
	}

	return { ok: true, options };
}

export function parseUpdateArgs(
	args: readonly string[],
): { ok: true; options: UpdateOptions } | { ok: false; message: string } {
	if (args.includes("--help") || args.includes("-h")) {
		return { ok: false, message: UPDATE_USAGE };
	}

	const options: UpdateOptions = {
		runtimeDir: undefined,
		force: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--runtime-dir") {
			const runtimeDir = args[index + 1];
			if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
				return { ok: false, message: "Missing value for --runtime-dir." };
			}
			options.runtimeDir = runtimeDir;
			index += 1;
			continue;
		}

		if (arg === "--force") {
			options.force = true;
			continue;
		}

		return { ok: false, message: `Unsupported update option: ${arg}` };
	}

	return { ok: true, options };
}

// Fixed machine-level marker path — the marker file itself lives at a known
// location so `dysflow update` can discover the previous explicit runtime dir
// without relying on a user-profile-derived %LOCALAPPDATA% fallback.
function getSystemMarkerPath(env: NodeJS.ProcessEnv): string {
	const explicitMarkerPath = env[RUNTIME_MARKER_PATH_ENV];
	if (explicitMarkerPath !== undefined && explicitMarkerPath.trim().length > 0) {
		return path.resolve(explicitMarkerPath);
	}

	const programData =
		env.ProgramData ?? path.join(env.SystemDrive ?? "C:", "ProgramData");
	return path.join(programData, "dysflow", RUNTIME_MARKER_FILE);
}

function parseRuntimeMarker(content: string): string | undefined {
	const lines = content
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) return undefined;
	if (lines[0] === RUNTIME_MARKER_VERSION) return lines[1];
	return lines[0];
}

function resolveRuntimeDir(
	runtimeOverride: string | undefined,
	env: NodeJS.ProcessEnv,
): string {
	if (runtimeOverride !== undefined) {
		return path.resolve(runtimeOverride);
	}

	if (env.DYSFLOW_HOME !== undefined && env.DYSFLOW_HOME.trim().length > 0) {
		return path.resolve(env.DYSFLOW_HOME);
	}

	// Try to read the marker file written by a previous --runtime-dir install.
	// This lets dysflow update work without DYSFLOW_HOME being set, as long
	// as the same machine has had a prior install with explicit --runtime-dir.
	const markerPath = getSystemMarkerPath(env);
	try {
		const markedRuntimeDir = parseRuntimeMarker(readFileSync(markerPath, "utf8"));
		if (markedRuntimeDir !== undefined) {
			return path.resolve(markedRuntimeDir);
		}
	} catch {
		// Marker not found or unreadable — fall through to default
	}

	const localAppData =
		env.LOCALAPPDATA ??
		path.join(env.USERPROFILE ?? env.HOME ?? "", "AppData", "Local");

	return path.join(localAppData, "dysflow");
}

function getHome(env: NodeJS.ProcessEnv): string {
	return env.USERPROFILE ?? env.HOME ?? env.USER ?? "";
}

export function resolvePackageRoot(
	options: { moduleUrl?: string; cwd?: string } = {},
): string {
	const commandPath = fileURLToPath(options.moduleUrl ?? import.meta.url);
	let currentDir = path.dirname(commandPath);

	for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
		const packageJson = path.join(currentDir, "package.json");
		const tsConfig = path.join(currentDir, "tsconfig.json");
		const distDir = path.join(currentDir, "dist");

		if (hasPath(packageJson) && (hasPath(tsConfig) || hasPath(distDir))) {
			return currentDir;
		}

		const parent = path.dirname(currentDir);
		if (parent === currentDir) {
			break;
		}
		currentDir = parent;
	}

	return path.resolve(options.cwd ?? process.cwd());
}

function hasPath(candidate: string): boolean {
	try {
		accessSync(candidate, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function resolveRuntimePaths(
	runtimeDir: string,
	packageRoot: string,
): RuntimePaths {
	const appDir = path.join(runtimeDir, "app");

	return {
		runtimeDir,
		appDir,
		binDir: path.join(runtimeDir, "bin"),
		readmePath: path.join(runtimeDir, "README.md"),
		changelogPath: path.join(runtimeDir, "CHANGELOG.md"),
		distSource: path.join(packageRoot, "dist"),
		scriptsSource: path.join(packageRoot, "scripts"),
		scriptsDest: path.join(appDir, "scripts"),
		packageJsonSource: path.join(packageRoot, "package.json"),
		packageJsonDest: path.join(appDir, "package.json"),
	};
}

function resolveAgentConfigPaths(home: string): AgentConfigPaths {
	return {
		codex: path.join(home, ".codex", "config.toml"),
		opencode: path.join(home, ".config", "opencode", "opencode.json"),
		claudeDesktop: path.join(
			home,
			"AppData",
			"Roaming",
			"Claude",
			"claude_desktop_config.json",
		),
		claudeSettings: path.join(home, ".claude", "settings.json"),
		pi: path.join(home, ".pi", "agent", "mcp.json"),
	};
}

function commandPathForConfig(runtimeDir: string): string {
	return path.join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function ensureObject(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
	const raw = await readFile(filePath, "utf8").catch(() => "{}");
	try {
		const parsed = JSON.parse(raw);
		return ensureObject(parsed);
	} catch {
		return {};
	}
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function hasDysflowMcpConfig(
	agent: AgentName,
	filePath: string,
): Promise<boolean> {
	if (agent === "codex") {
		const raw = await readFile(filePath, "utf8").catch(() => "");
		return raw
			.replace(/\r\n/g, "\n")
			.split("\n")
			.some((line) => line.trim() === "[mcp_servers.dysflow]");
	}

	const root = await readJson(filePath);
	const container =
		agent === "opencode"
			? ensureObject(root.mcp)
			: ensureObject(root.mcpServers);
	return container.dysflow !== undefined;
}

export async function removeDysflowMcpConfig(
	agent: AgentName,
	filePath: string,
): Promise<void> {
	if (!(await fileExists(filePath))) return;

	if (agent === "codex") {
		const raw = await readFile(filePath, "utf8");
		const updated = removeCodexMcpSection(raw);
		if (updated === raw) return;
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, updated, "utf8");
		return;
	}

	const root = await readJson(filePath);
	const key = agent === "opencode" ? "mcp" : "mcpServers";
	const container = ensureObject(root[key]);
	if (container.dysflow === undefined) return;
	delete container.dysflow;
	root[key] = container;
	await writeJson(filePath, root);
}

function removeCodexMcpSection(content: string): string {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const sectionHeader = "[mcp_servers.dysflow]";
	const start = lines.findIndex((line) => line.trim() === sectionHeader);
	if (start === -1) return `${lines.join("\n").trimEnd()}\n`;

	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
			const sectionName = line.slice(1, -1);
			if (!sectionName.startsWith("mcp_servers.dysflow")) {
				end = index;
				break;
			}
		}
	}

	return `${[...lines.slice(0, start), ...lines.slice(end)].join("\n").trimEnd()}\n`;
}

export function replaceCodexMcpSection(
	content: string,
	commandPath: string,
): string {
	const normalized = commandPath.replaceAll("\\", "/");
	const sectionHeader = "[mcp_servers.dysflow]";
	const replacementLines = [
		sectionHeader,
		`command = '${normalized}'`,
		`args = ["mcp"]`,
		"startup_timeout_sec = 60.0",
		"",
	];

	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((line) => line.trim() === sectionHeader);

	if (start === -1) {
		return `${lines.join("\n").trimEnd()}\n\n${replacementLines.join("\n").trimEnd()}\n`;
	}

	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
			const sectionName = line.slice(1, -1);
			if (!sectionName.startsWith("mcp_servers.dysflow")) {
				end = index;
				break;
			}
		}
	}

	const updated = [
		...lines.slice(0, start),
		...replacementLines,
		...lines.slice(end),
	];
	return `${updated.join("\n").trimEnd()}\n`;
}

async function configureCodex(
	filePath: string,
	commandPath: string,
): Promise<void> {
	const raw = await readFile(filePath, "utf8").catch(() => "");
	const updated = replaceCodexMcpSection(raw, commandPath);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, updated, "utf8");
}

async function configureOpencode(
	filePath: string,
	commandPath: string,
): Promise<void> {
	const root = await readJson(filePath);
	const mcp = ensureObject(root.mcp);
	mcp.dysflow = {
		enabled: true,
		type: "local",
		command: [commandPath, "mcp"],
	};
	root.mcp = mcp;
	await writeJson(filePath, root);
}

async function configureClaude(
	filePath: string,
	commandPath: string,
): Promise<void> {
	const root = await readJson(filePath);
	const mcpServers = ensureObject(root.mcpServers);
	mcpServers.dysflow = { command: commandPath, args: ["mcp"] };
	root.mcpServers = mcpServers;
	await writeJson(filePath, root);
}

async function configurePi(
	filePath: string,
	commandPath: string,
): Promise<void> {
	const root = await readJson(filePath);
	const mcpServers = ensureObject(root.mcpServers);
	mcpServers.dysflow = {
		command: commandPath,
		args: ["mcp"],
		directTools: true,
		type: "local",
		lifecycle: "lazy",
	};
	root.mcpServers = mcpServers;
	await writeJson(filePath, root);
}

export async function applyIntegrationSelection(
	selectedAgents: readonly AgentName[],
	options: {
		env?: NodeJS.ProcessEnv;
		runtimeDir?: string;
		packageRoot?: string;
	} = {},
): Promise<CliResult> {
	const env = options.env ?? process.env;
	const runtimeDir = resolveRuntimeDir(options.runtimeDir, env);
	const packageRoot = options.packageRoot ?? resolvePackageRoot();
	const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
	const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
	const commandPath = commandPathForConfig(runtimeDir);
	const selected = new Set(selectedAgents);

	try {
		await installRuntime(runtimePaths, packageRoot, env);
		for (const agent of ALL_AGENTS) {
			if (selected.has(agent)) {
				await configureAgent(agent, agentConfigPaths, commandPath);
				continue;
			}
			await removeAgentConfig(agent, agentConfigPaths);
		}
		return {
			exitCode: 0,
			stdout: createInstallReport(runtimeDir, [...selected]),
			stderr: "",
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to apply Dysflow integrations.";
		return { exitCode: 1, stdout: "", stderr: message };
	}
}

async function configureAgent(
	agent: AgentName,
	agentConfigPaths: AgentConfigPaths,
	commandPath: string,
): Promise<void> {
	if (agent === "codex")
		return configureCodex(agentConfigPaths.codex, commandPath);
	if (agent === "opencode")
		return configureOpencode(agentConfigPaths.opencode, commandPath);
	if (agent === "claude")
		return configureClaude(
			await resolveClaudeConfigPath(agentConfigPaths),
			commandPath,
		);
	return configurePi(agentConfigPaths.pi, commandPath);
}

async function removeAgentConfig(
	agent: AgentName,
	agentConfigPaths: AgentConfigPaths,
): Promise<void> {
	if (agent === "codex") {
		await removeDysflowMcpConfig(agent, agentConfigPaths.codex);
		return;
	}
	if (agent === "opencode") {
		await removeDysflowMcpConfig(agent, agentConfigPaths.opencode);
		return;
	}
	if (agent === "claude") {
		await removeDysflowMcpConfig(agent, agentConfigPaths.claudeSettings);
		await removeDysflowMcpConfig(agent, agentConfigPaths.claudeDesktop);
		return;
	}
	await removeDysflowMcpConfig(agent, agentConfigPaths.pi);
}

async function copyRuntime(runtimePaths: RuntimePaths): Promise<void> {
	await mkdir(runtimePaths.appDir, { recursive: true });
	await mkdir(runtimePaths.binDir, { recursive: true });

	if (!(await fileExists(runtimePaths.distSource))) {
		throw new Error(
			`Cannot install: runtime distribution not found at ${runtimePaths.distSource}.`,
		);
	}

	await copyIfDifferent(
		runtimePaths.distSource,
		path.join(runtimePaths.appDir, "dist"),
		{
			recursive: true,
			force: true,
		},
	);

	// Scripts are required by MCP/Access/VBA tools at runtime.
	await mkdir(runtimePaths.scriptsDest, { recursive: true });
	if (await fileExists(runtimePaths.scriptsSource)) {
		await copyIfDifferent(
			runtimePaths.scriptsSource,
			runtimePaths.scriptsDest,
			{
				recursive: true,
				force: true,
			},
		);
	}

	if (await fileExists(runtimePaths.packageJsonSource)) {
		await copyIfDifferent(
			runtimePaths.packageJsonSource,
			runtimePaths.packageJsonDest,
			{
				force: true,
			},
		);
	}
}

async function copyIfDifferent(
	source: string,
	destination: string,
	options: Parameters<typeof cp>[2],
): Promise<void> {
	if (path.resolve(source) === path.resolve(destination)) return;
	await cp(source, destination, options);
}

async function copyDocs(
	runtimePaths: RuntimePaths,
	packageRoot: string,
): Promise<void> {
	const sourceReadme = path.join(packageRoot, "README.md");
	const sourceChangelog = path.join(packageRoot, "CHANGELOG.md");

	if (await fileExists(sourceReadme)) {
		await cp(sourceReadme, runtimePaths.readmePath, { force: true });
	}

	if (await fileExists(sourceChangelog)) {
		await cp(sourceChangelog, runtimePaths.changelogPath, { force: true });
	}
}

async function installRuntime(
	runtimePaths: RuntimePaths,
	packageRoot: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	await copyRuntime(runtimePaths);
	await copyDocs(runtimePaths, packageRoot);
	await writeRuntimeLaunchers(runtimePaths.binDir, runtimePaths.runtimeDir);
	await writeRuntimeMarker(getSystemMarkerPath(env), runtimePaths.runtimeDir);
}

async function writeRuntimeMarker(
	markerPath: string,
	runtimeDir: string,
): Promise<void> {
	const markerDir = path.dirname(markerPath);
	await mkdir(markerDir, { recursive: true });
	// Write marker with version + runtime dir, so future versions can evolve the format
	const markerContent = `${RUNTIME_MARKER_VERSION}\n${runtimeDir}\n`;
	await writeFile(markerPath, markerContent, "utf8");
}

function createInstallReport(
	runtimeDir: string,
	configuredAgents: readonly AgentName[],
): string {
	return [
		`Dysflow runtime installed at: ${runtimeDir}`,
		`Configured agents: ${configuredAgents.length === 0 ? "(none)" : configuredAgents.join(", ")}`,
		"",
		"Note:",
		"- Runtime docs were copied to INSTALL_DIR: README.md and CHANGELOG.md.",
		"- MCP server command used in integrations: " +
			path.join(runtimeDir, "bin", "dysflow.cmd"),
		"- Re-run `dysflow install` to refresh runtime + integrations.",
	].join("\n");
}

function createNoUpdateReport(
	runtimeDir: string,
	localVersion: string,
): string {
	return `Dysflow runtime is up to date in ${runtimeDir} (v${localVersion}).`;
}

async function readPackageJsonVersion(
	packagePath: string,
): Promise<string | undefined> {
	const raw = await readFile(packagePath, "utf8").catch(() => undefined);
	if (raw === undefined) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(raw) as { version?: string };
		if (typeof parsed.version === "string" && parsed.version.length > 0) {
			return parsed.version;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

type GitHubLatestReleaseResponse = {
	tag_name?: unknown;
	name?: unknown;
};

function normalizeReleaseVersion(value: string): string {
	return value.startsWith("v") ? value.slice(1) : value;
}

export function validateReleaseTagName(tagName: string): string {
	if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
		throw new Error(`Invalid Dysflow release tag: ${tagName}`);
	}
	return tagName;
}

export function createGitHubReleaseRequestHeaders(
	env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
	const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
	return {
		Accept: "application/vnd.github+json",
		...(token !== undefined && token.length > 0
			? { Authorization: `Bearer ${token}` }
			: {}),
		"User-Agent": "dysflow-updater",
	};
}

function createCommandError(command: string, error: unknown): Error {
	if (error instanceof Error) {
		return new Error(`${command} failed: ${error.message}`);
	}
	return new Error(`${command} failed.`);
}

async function runCommand(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<void> {
	try {
		await execFileAsync(command, [...args], {
			cwd,
			windowsHide: true,
			maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
		});
	} catch (error) {
		throw createCommandError(`${command} ${args.join(" ")}`, error);
	}
}

async function runCommandOutput(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<string> {
	try {
		const { stdout } = await execFileAsync(command, [...args], {
			cwd,
			windowsHide: true,
			maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
		});
		return String(stdout).trim();
	} catch (error) {
		throw createCommandError(`${command} ${args.join(" ")}`, error);
	}
}

async function resolveLatestReleaseWithGh(): Promise<ReleaseInfo> {
	const tagName = await runCommandOutput(
		"gh",
		["release", "view", "--repo", "DysTelefonica/dysflow", "--json", "tagName", "--jq", ".tagName"],
		process.cwd(),
	);
	if (tagName.length === 0) {
		throw new Error("gh release view did not return a tagName.");
	}
	validateReleaseTagName(tagName);
	return {
		tagName,
		version: normalizeReleaseVersion(tagName),
	};
}

async function tryResolveGitCommitSha(cwd: string): Promise<string | undefined> {
	try {
		const sha = await runCommandOutput("git", ["rev-parse", "HEAD"], cwd);
		return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
	} catch {
		return undefined;
	}
}

function createGitHubReleaseUpdateProvider(): ReleaseUpdateProvider {
	return {
		async resolveLatestRelease(): Promise<ReleaseInfo> {
			const response = await fetch(GITHUB_LATEST_RELEASE_API, {
				headers: createGitHubReleaseRequestHeaders(),
			});
			if (!response.ok) {
				try {
					return await resolveLatestReleaseWithGh();
				} catch {
					throw new Error(
						`GitHub latest release lookup failed with HTTP ${response.status}.`,
					);
				}
			}

			const body = (await response.json()) as GitHubLatestReleaseResponse;
			if (typeof body.tag_name !== "string" || body.tag_name.length === 0) {
				throw new Error("GitHub latest release response did not include tag_name.");
			}
			validateReleaseTagName(body.tag_name);

			return {
				tagName: body.tag_name,
				version: normalizeReleaseVersion(body.tag_name),
			};
		},

		async preparePackage(
			release: ReleaseInfo,
		): Promise<PreparedReleasePackage> {
			const tagName = validateReleaseTagName(release.tagName ?? `v${release.version}`);
			const tempRoot = await mkdtemp(path.join(tmpdir(), "dysflow-update-"));
			const packageRoot = path.join(tempRoot, "source");
			const cleanup = async (): Promise<void> => {
				await rm(tempRoot, { recursive: true, force: true });
			};

			try {
				await runCommand(
					"git",
					["clone", "--depth", "1", "--branch", tagName, GITHUB_REPO_URL, packageRoot],
					tempRoot,
				);
				const commitSha = await tryResolveGitCommitSha(packageRoot);
				await runCommand("pnpm", ["install", "--frozen-lockfile"], packageRoot);
				await runCommand("pnpm", ["build"], packageRoot);
				return { packageRoot, commitSha, cleanup };
			} catch (error) {
				await cleanup();
				throw error;
			}
		},
	};
}

async function resolveClaudeConfigPath(
	paths: Pick<AgentConfigPaths, "claudeDesktop" | "claudeSettings">,
): Promise<string> {
	if (await fileExists(paths.claudeSettings)) {
		return paths.claudeSettings;
	}

	if (await fileExists(paths.claudeDesktop)) {
		return paths.claudeDesktop;
	}

	return paths.claudeSettings;
}

async function selectAgentsInteractive(
	allowList: readonly AgentName[],
): Promise<AgentName[]> {
	const prompt = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	try {
		const selected: AgentName[] = [];
		for (const agent of allowList) {
			const answer = await prompt.question(
				`[${agent}] Install MCP integration? [y/N] `,
			);
			if (answer.trim().toLowerCase().startsWith("y")) {
				selected.push(agent);
			}
		}
		return selected;
	} finally {
		prompt.close();
	}
}

export async function writeRuntimeLaunchers(
	binDir: string,
	runtimeDir: string,
): Promise<void> {
	const normalizedRuntimeDir = runtimeDir.replaceAll("\\", "\\\\");
	const cmdRuntimeDir = escapeCmdSetValue(normalizedRuntimeDir);
	const psRuntimeDir = escapePowerShellDoubleQuotedString(normalizedRuntimeDir);
	const cmdContent = [
		"@echo off",
		"setlocal",
		`set "DYSFLOW_HOME=${cmdRuntimeDir}"`,
		// Prepend Node pnpm/npm path so child processes (pnpm install during update)
		// can find the package manager even when launched without a full PATH.
		`set "PATH=%ProgramFiles%\\nodejs;%PATH%"`,
		`node "%DYSFLOW_HOME%\\app\\dist\\cli\\index.js" %*`,
		"exit /b %ERRORLEVEL%",
		"",
	].join("\r\n");

	const ps1Content = [
		'$ErrorActionPreference = "Stop"',
		`$env:DYSFLOW_HOME = "${psRuntimeDir}"`,
		`$env:PATH = "$env:ProgramFiles\\nodejs;$env:PATH"`,
		`& node (Join-Path $env:DYSFLOW_HOME "app\\dist\\cli\\index.js") @args`,
		"exit $LASTEXITCODE",
		"",
	].join("\r\n");

	await writeFile(path.join(binDir, "dysflow.cmd"), cmdContent, "utf8");
	await writeFile(path.join(binDir, "dysflow.ps1"), ps1Content, "utf8");
}

function escapeCmdSetValue(value: string): string {
	return value.replaceAll("%", "%%").replaceAll('"', '^"');
}

function escapePowerShellDoubleQuotedString(value: string): string {
	return value.replaceAll("`", "``").replaceAll("$", "`$").replaceAll('"', '`"');
}

export async function handleInstallCommand(
	args: readonly string[],
	context: { env?: NodeJS.ProcessEnv; packageRoot?: string } = {},
): Promise<CliResult> {
	const parsed = parseInstallArgs(args);
	if (!parsed.ok) {
		const isUsage = parsed.message === INSTALL_USAGE;
		return {
			exitCode: isUsage ? 0 : 1,
			stdout: isUsage ? INSTALL_USAGE : "",
			stderr: isUsage ? "" : parsed.message,
		};
	}

	const env = context.env ?? process.env;
	const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
	const packageRoot = context.packageRoot ?? resolvePackageRoot();
	const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
	const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
	const commandPath = commandPathForConfig(runtimeDir);

	try {
		let agents = parsed.options.agentNames;
		if (
			agents.length === 0 &&
			parsed.options.interactive &&
			process.stdin.isTTY
		) {
			agents = await selectAgentsInteractive(ALL_AGENTS);
		}

		await installRuntime(runtimePaths, packageRoot, env);

		for (const agent of agents) {
			if (agent === "codex") {
				await configureCodex(agentConfigPaths.codex, commandPath);
				continue;
			}

			if (agent === "opencode") {
				await configureOpencode(agentConfigPaths.opencode, commandPath);
				continue;
			}

			if (agent === "claude") {
				const pathToUse = await resolveClaudeConfigPath(agentConfigPaths);
				await configureClaude(pathToUse, commandPath);
				continue;
			}

			await configurePi(agentConfigPaths.pi, commandPath);
		}

		return {
			exitCode: 0,
			stdout: createInstallReport(runtimeDir, agents),
			stderr: "",
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to install Dysflow runtime.";
		return {
			exitCode: 1,
			stdout: "",
			stderr: message,
		};
	}
}

export async function handleUpdateCommand(
	args: readonly string[],
	context: {
		env?: NodeJS.ProcessEnv;
		releaseUpdateProvider?: ReleaseUpdateProvider;
		packageRoot?: string;
	} = {},
): Promise<CliResult> {
	const parsed = parseUpdateArgs(args);
	if (!parsed.ok) {
		const isUsage = parsed.message === UPDATE_USAGE;
		return {
			exitCode: isUsage ? 0 : 1,
			stdout: isUsage ? UPDATE_USAGE : "",
			stderr: isUsage ? "" : parsed.message,
		};
	}

	const env = context.env ?? process.env;
	const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
	const localPackageRoot = context.packageRoot ?? resolvePackageRoot();
	const runtimePaths = resolveRuntimePaths(runtimeDir, localPackageRoot);

	const installedVersion = await readPackageJsonVersion(
		runtimePaths.packageJsonDest,
	);
	const provider =
		context.releaseUpdateProvider ?? createGitHubReleaseUpdateProvider();

	let latestRelease: ReleaseInfo;
	try {
		latestRelease = await provider.resolveLatestRelease();
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to resolve latest release.";
		return {
			exitCode: 1,
			stdout: "",
			stderr: `Failed to update Dysflow runtime: ${message}`,
		};
	}

	const isUpdateNeeded =
		parsed.options.force ||
		installedVersion === undefined ||
		compareVersions(latestRelease.version, installedVersion) > 0;

	if (!isUpdateNeeded) {
		// Even when up to date, persist the marker so that future update calls
		// (without --runtime-dir) can still discover this runtime directory.
		await writeRuntimeMarker(getSystemMarkerPath(env), runtimeDir);
		return {
			exitCode: 0,
			stdout: createNoUpdateReport(runtimeDir, latestRelease.version),
			stderr: "",
		};
	}

	const previousVersion = installedVersion ?? "not installed";
	let preparedPackage: PreparedReleasePackage | undefined;
	try {
		preparedPackage = await provider.preparePackage(latestRelease);
		const releaseRuntimePaths = resolveRuntimePaths(
			runtimeDir,
			preparedPackage.packageRoot,
		);
		await installRuntime(releaseRuntimePaths, preparedPackage.packageRoot, env);
		return {
			exitCode: 0,
			stdout:
				`Dysflow runtime update: ${previousVersion} -> ${latestRelease.version}\n` +
				(preparedPackage.commitSha === undefined
					? ""
					: `Installed release commit: ${preparedPackage.commitSha}\n`) +
				createInstallReport(runtimeDir, []),
			stderr: "",
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to update Dysflow runtime.";
		return {
			exitCode: 1,
			stdout: "",
			stderr: `Failed to update Dysflow runtime: ${message}`,
		};
	} finally {
		await preparedPackage?.cleanup?.();
	}
}

export function formatAgentsLine(agents: readonly AgentName[]): string {
	return agents.length === 0 ? "(none)" : agents.join(", ");
}
