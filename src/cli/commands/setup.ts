import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import {
	loadDysflowConfig,
	redactDysflowConfig,
	resolveProjectRegistryPath,
	type DysflowConfig,
	type DysflowProjectRegistry,
} from "../../core/config/dysflow-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

const HELP_TEXT =
	"Usage: dysflow setup [--write-project --access-path <path> [--backend-path <path>] [--project-id <id>]] [--set-project-id <id>] [--help]";

type SetupOptions = {
	writeProject: boolean;
	accessPath?: string;
	backendPath?: string;
	projectId?: string;
	setProjectId?: string;
};

export async function handleSetupCommand(
	args: readonly string[],
	context: CliCommandContext = {},
): Promise<CliResult> {
	if (args.includes("--help") || args.includes("-h")) {
		return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
	}

	const parsed = parseSetupArgs(args);
	if (!parsed.ok) {
		return { exitCode: 1, stdout: "", stderr: parsed.message };
	}

	if (parsed.options.setProjectId !== undefined) {
		try {
			return {
				exitCode: 0,
				stdout: await updateProjectConfigId(parsed.options.setProjectId, context),
				stderr: "",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to update project id.";
			return { exitCode: 1, stdout: "", stderr: message };
		}
	}

	const configResult = loadDysflowConfig({
		env: context.env,
		cwd: context.cwd,
		accessDbPath: parsed.options.accessPath,
		backendPath: parsed.options.backendPath,
		projectId: parsed.options.projectId,
	});
	if (!configResult.ok) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: `${configResult.error.code}: ${configResult.error.message}`,
		};
	}

	const redacted = redactDysflowConfig(configResult.data);
	let extraOutput: string[] = [];
	if (parsed.options.writeProject) {
		const writeResult = await writeRelativeProjectConfig(configResult.data, context.cwd);
		const registerResult = await registerProjectConfig(
			configResult.data.projectId ?? basename(context.cwd ?? process.cwd()),
			writeResult.projectPath,
			context,
		);
		extraOutput = [writeResult.message, registerResult];
	}

	return {
		exitCode: 0,
		stdout: [
			"Dysflow core configuration resolved.",
			`Access database: ${redacted.accessDbPath}`,
			`Timeout: ${redacted.timeoutMs}ms`,
			`Password: ${redacted.accessPassword ?? "(not configured)"}`,
			...extraOutput,
		].join("\n"),
		stderr: "",
	};
}

function parseSetupArgs(
	args: readonly string[],
): { ok: true; options: SetupOptions } | { ok: false; message: string } {
	const options: SetupOptions = { writeProject: false };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--write-project") {
			options.writeProject = true;
			continue;
		}
		if (arg === "--access-path") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { ok: false, message: "Missing value for --access-path." };
			}
			options.accessPath = value;
			index += 1;
			continue;
		}
		if (arg === "--backend-path") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { ok: false, message: "Missing value for --backend-path." };
			}
			options.backendPath = value;
			index += 1;
			continue;
		}
		if (arg === "--project-id") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { ok: false, message: "Missing value for --project-id." };
			}
			options.projectId = value;
			index += 1;
			continue;
		}
		if (arg === "--set-project-id") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { ok: false, message: "Missing value for --set-project-id." };
			}
			options.setProjectId = value;
			index += 1;
			continue;
		}
		return { ok: false, message: `Unsupported setup option: ${arg}` };
	}

	return { ok: true, options };
}

function toPortableProjectPath(
	value: string | undefined,
	projectRoot: string,
): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const absolutePath = isAbsolute(value)
		? resolve(value)
		: resolve(projectRoot, value);
	const projectRelative = relative(projectRoot, absolutePath);
	return projectRelative.length === 0
		? basename(absolutePath)
		: projectRelative.replaceAll("\\", "/");
}

async function updateProjectConfigId(
	projectId: string,
	context: Pick<CliCommandContext, "cwd" | "env">,
): Promise<string> {
	const projectRoot = context.cwd ?? process.cwd();
	const projectPath = join(projectRoot, ".dysflow", "project.json");
	const raw = await readFile(projectPath, "utf8").catch(() => "{}");
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error(`Invalid .dysflow/project.json: ${projectPath}`);
	}
	parsed.id = projectId;
	await mkdir(dirname(projectPath), { recursive: true });
	await writeFile(projectPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
	const registerResult = await registerProjectConfig(projectId, projectPath, context);
	return [`Updated project id in .dysflow/project.json: ${projectId}`, registerResult].join("\n");
}

async function registerProjectConfig(
	projectId: string,
	projectPath: string,
	context: Pick<CliCommandContext, "cwd" | "env">,
): Promise<string> {
	const registryPath = resolveProjectRegistryPath({}, context.env, context.cwd);
	const raw = await readFile(registryPath, "utf8").catch(() => "{}");
	const registry = JSON.parse(raw) as DysflowProjectRegistry;
	registry.projects = { ...(registry.projects ?? {}), [projectId]: { configPath: projectPath } };
	await mkdir(dirname(registryPath), { recursive: true });
	await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
	return `Registered project id ${projectId} in ${registryPath}`;
}

async function writeRelativeProjectConfig(
	config: DysflowConfig,
	cwd?: string,
): Promise<{ message: string; projectPath: string }> {
	const projectRoot = cwd ?? process.cwd();
	const projectPath = join(projectRoot, ".dysflow", "project.json");
	const projectId = config.projectId ?? basename(projectRoot);
	const projectJson = {
		id: projectId,
		accessPath: toPortableProjectPath(config.accessDbPath, projectRoot),
		...(config.backendPath === undefined
			? {}
			: {
					backendPath: toPortableProjectPath(config.backendPath, projectRoot),
				}),
		destinationRoot: "src",
	};

	await mkdir(dirname(projectPath), { recursive: true });
	await writeFile(
		projectPath,
		`${JSON.stringify(projectJson, null, 2)}\n`,
		"utf8",
	);
	return { message: `Wrote portable project config to ${projectPath}`, projectPath };
}
