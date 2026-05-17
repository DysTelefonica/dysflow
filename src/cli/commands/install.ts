import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CliResult } from "./types.js";

const INSTALL_USAGE =
	"Usage: dysflow install [--runtime-dir <dir>] [--agents <codex,opencode,claude,pi>] [--agent-all] [--no-tui]";
const UPDATE_USAGE = "Usage: dysflow update [--runtime-dir <dir>] [--force]";

export type AgentName = "codex" | "opencode" | "claude" | "pi";
const ALL_AGENTS = ["codex", "opencode", "claude", "pi"] as const;

type InstallOptions = {
	runtimeDir?: string;
	agentNames: AgentName[];
	interactive: boolean;
};

type UpdateOptions = {
	runtimeDir?: string;
	force: boolean;
};

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

	for (let depth = 0; depth < 12; depth += 1) {
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
		await installRuntime(runtimePaths, packageRoot);
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
): Promise<void> {
	await copyRuntime(runtimePaths);
	await copyDocs(runtimePaths, packageRoot);
	await writeRuntimeLaunchers(runtimePaths.binDir, runtimePaths.runtimeDir);
}

function parseVersionValue(value: string): number[] {
	const clean = value.split(/[-+]/)[0].trim();
	if (clean.length === 0) {
		return [0];
	}

	return clean
		.split(".")
		.map((part) => Number.parseInt(part, 10))
		.map((part) => (Number.isNaN(part) ? 0 : part));
}

export function compareVersions(a: string, b: string): number {
	const partsA = parseVersionValue(a);
	const partsB = parseVersionValue(b);
	const maxLength = Math.max(partsA.length, partsB.length);

	for (let index = 0; index < maxLength; index += 1) {
		const left = partsA[index] ?? 0;
		const right = partsB[index] ?? 0;
		if (left > right) {
			return 1;
		}
		if (left < right) {
			return -1;
		}
	}

	return 0;
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
	const cmdContent = [
		"@echo off",
		"setlocal",
		`set "DYSFLOW_HOME=${normalizedRuntimeDir}"`,
		'node "%DYSFLOW_HOME%\\app\\dist\\cli\\index.js" %*',
		"exit /b %ERRORLEVEL%",
		"",
	].join("\r\n");

	const ps1Content = [
		'$ErrorActionPreference = "Stop"',
		`$env:DYSFLOW_HOME = "${normalizedRuntimeDir}"`,
		`& node (Join-Path $env:DYSFLOW_HOME "app\\dist\\cli\\index.js") @args`,
		"exit $LASTEXITCODE",
		"",
	].join("\r\n");

	await writeFile(path.join(binDir, "dysflow.cmd"), cmdContent, "utf8");
	await writeFile(path.join(binDir, "dysflow.ps1"), ps1Content, "utf8");
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

		await installRuntime(runtimePaths, packageRoot);

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
	context: { env?: NodeJS.ProcessEnv } = {},
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
	const packageRoot = resolvePackageRoot();
	const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
	const localVersion = await readPackageJsonVersion(
		runtimePaths.packageJsonSource,
	);
	if (localVersion === undefined) {
		return {
			exitCode: 1,
			stdout: "",
			stderr:
				"Unable to determine local version for dysflow update. Missing package.json in CLI runtime source.",
		};
	}

	const installedVersion = await readPackageJsonVersion(
		runtimePaths.packageJsonDest,
	);
	const isUpdateNeeded =
		parsed.options.force ||
		installedVersion === undefined ||
		compareVersions(localVersion, installedVersion) > 0;

	if (!isUpdateNeeded) {
		return {
			exitCode: 0,
			stdout: createNoUpdateReport(runtimeDir, localVersion),
			stderr: "",
		};
	}

	const previousVersion = installedVersion ?? "not installed";
	try {
		await installRuntime(runtimePaths, packageRoot);
		return {
			exitCode: 0,
			stdout:
				`Dysflow runtime update: ${previousVersion} -> ${localVersion}\n` +
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
			stderr: message,
		};
	}
}

export function formatAgentsLine(agents: readonly AgentName[]): string {
	return agents.length === 0 ? "(none)" : agents.join(", ");
}
