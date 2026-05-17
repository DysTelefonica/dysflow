import { mkdir, writeFile } from "node:fs/promises";
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
	type DysflowConfig,
} from "../../core/config/dysflow-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

const HELP_TEXT =
	"Usage: dysflow setup [--write-project --access-path <path> [--backend-path <path>] [--project-id <id>]] [--help]";

type SetupOptions = {
	writeProject: boolean;
	accessPath?: string;
	backendPath?: string;
	projectId?: string;
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
		extraOutput = [
			await writeRelativeProjectConfig(configResult.data, context.cwd),
		];
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

async function writeRelativeProjectConfig(
	config: DysflowConfig,
	cwd?: string,
): Promise<string> {
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
	return `Wrote portable project config to ${projectPath}`;
}
