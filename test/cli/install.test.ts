import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	handleInstallCommand,
	handleUpdateCommand,
	parseAgentList,
	parseInstallArgs,
	parseUpdateArgs,
	compareVersions,
	replaceCodexMcpSection,
	resolvePackageRoot,
} from "../../src/cli/commands/install";

const readJson = async (path: string): Promise<Record<string, unknown>> => {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw) as Record<string, unknown>;
};

const getLocalDysflowVersion = async (): Promise<string> => {
	const sourcePackage = await readFile(
		join(process.cwd(), "package.json"),
		"utf8",
	);
	const parsed = JSON.parse(sourcePackage) as { version?: string };
	return parsed.version ?? "0.1.0";
};

describe("install arg parsing", () => {
	it("parses known agents from --agents", () => {
		expect(parseAgentList("codex,opencode")).toEqual({
			ok: true,
			agents: ["codex", "opencode"],
		});
	});

	it("deduplicates requested agents", () => {
		expect(parseAgentList("codex,codex,pi")).toEqual({
			ok: true,
			agents: ["codex", "pi"],
		});
	});

	it("rejects unknown agents", () => {
		expect(parseAgentList("codex,unknown")).toEqual({
			ok: false,
			message: "Unknown agent(s): unknown.",
		});
	});

	it("parses install arguments", () => {
		expect(
			parseInstallArgs([
				"--runtime-dir",
				"C:/tmp/runtime",
				"--agent-all",
				"--no-tui",
			]),
		).toEqual({
			ok: true,
			options: {
				runtimeDir: "C:/tmp/runtime",
				agentNames: ["codex", "opencode", "claude", "pi"],
				interactive: false,
			},
		});
	});

	it("parses update arguments", () => {
		expect(
			parseUpdateArgs(["--runtime-dir", "C:/tmp/runtime", "--force"]),
		).toEqual({
			ok: true,
			options: {
				runtimeDir: "C:/tmp/runtime",
				force: true,
			},
		});
	});

	it("compares semantic versions", () => {
		expect(compareVersions("0.1.0", "0.0.9")).toBe(1);
		expect(compareVersions("0.0.9", "0.1.0")).toBe(-1);
		expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
	});
});

describe("codex toml serialization", () => {
	it("adds dysflow MCP section when missing", () => {
		const original = '[other]\ncommand = "echo"\n';
		const updated = replaceCodexMcpSection(
			original,
			"C:/dysflow/bin/dysflow.cmd",
		);

		expect(updated).toContain("[mcp_servers.dysflow]");
		expect(updated).toContain("command = 'C:/dysflow/bin/dysflow.cmd'");
		expect(updated).toContain('args = ["mcp"]');
	});

	it("replaces existing dysflow section", () => {
		const original = [
			"[mcp_servers.dysflow]",
			"command = 'old'",
			'args = ["old"]',
			"startup_timeout_sec = 10.0",
			"",
			"[mcp_servers.other]",
			"command = 'x'",
			"",
		].join("\n");

		const updated = replaceCodexMcpSection(
			original,
			"C:/dysflow/bin/dysflow.cmd",
		);

		expect(updated).toContain("[mcp_servers.other]");
		expect(updated).toContain("command = 'C:/dysflow/bin/dysflow.cmd'");
		expect(updated).not.toContain("command = 'old'");
	});
});

describe("resolvePackageRoot", () => {
	it("uses the installed package app root even when cwd is a project subfolder", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-package-root-"));
		const installedApp = join(root, "installed", "app");
		const installedCliDir = join(installedApp, "dist", "cli", "commands");
		const projectSubfolder = join(root, "project", "E2E_testing");

		try {
			await mkdir(installedCliDir, { recursive: true });
			await mkdir(projectSubfolder, { recursive: true });
			await writeFile(join(installedApp, "package.json"), '{"name":"dysflow"}\n', "utf8");

			expect(
				resolvePackageRoot({
					moduleUrl: `file:///${join(installedCliDir, "install.js").replaceAll("\\", "/")}`,
					cwd: projectSubfolder,
				}),
			).toBe(installedApp);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("handleInstallCommand end-to-end", () => {
	it("reinstalling from the installed runtime app refreshes integrations without self-copy failure", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-self-install-"));
		const home = join(root, "home");
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const appDist = join(appDir, "dist");
		const appCli = join(appDist, "cli");
		const appScripts = join(appDir, "scripts");

		try {
			await mkdir(appCli, { recursive: true });
			await mkdir(appScripts, { recursive: true });
			await writeFile(join(appCli, "index.js"), "SELF_RUNTIME", "utf8");
			await writeFile(join(appScripts, "runner.ps1"), "SELF_SCRIPT", "utf8");
			await writeFile(join(appDir, "package.json"), '{"name":"dysflow","version":"0.1.3"}\n', "utf8");

			const result = await handleInstallCommand(
				["--runtime-dir", runtimeDir, "--agents", "opencode", "--no-tui"],
				{ env: { USERPROFILE: home }, packageRoot: appDir },
			);

			expect(result.stderr).toBe("");
			expect(result.exitCode).toBe(0);
			expect(await readFile(join(appCli, "index.js"), "utf8")).toBe("SELF_RUNTIME");
			const opencode = await readJson(join(home, ".config", "opencode", "opencode.json"));
			expect(((opencode.mcp as Record<string, unknown>).dysflow as Record<string, unknown>).type).toBe("local");
			expect(await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8")).toContain("%DYSFLOW_HOME%\\app\\dist\\cli\\index.js");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("installs runtime to requested path and configures selected agents", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-install-"));
		const home = join(root, "home");
		const runtimeDir = join(root, "runtime");
		const codexConfig = join(home, ".codex", "config.toml");
		const opencodeConfig = join(home, ".config", "opencode", "opencode.json");
		const claudeSettings = join(home, ".claude", "settings.json");
		const piConfig = join(home, ".pi", "agent", "mcp.json");

		const result = await handleInstallCommand(
			[
				"--runtime-dir",
				runtimeDir,
				"--agents",
				"codex,opencode,claude,pi",
				"--no-tui",
			],
			{
				env: {
					USERPROFILE: home,
				},
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(
			`Dysflow runtime installed at: ${runtimeDir}`,
		);
		expect(result.stdout).toContain(
			"Configured agents: codex, opencode, claude, pi",
		);

		expect(
			await readFile(
				join(runtimeDir, "app", "dist", "cli", "index.js"),
				"utf8",
			),
		).toContain("runCli");
		expect(await readFile(join(runtimeDir, "README.md"), "utf8")).toContain(
			"Dysflow",
		);
		expect(await readFile(join(runtimeDir, "CHANGELOG.md"), "utf8")).toContain(
			"# Changelog",
		);

		const codexContent = await readFile(codexConfig, "utf8");
		const expectedCmd = join(runtimeDir, "bin", "dysflow.cmd").replaceAll(
			"\\",
			"/",
		);
		expect(codexContent).toContain("[mcp_servers.dysflow]");
		expect(codexContent).toContain(`command = '${expectedCmd}'`);

		const opencode = await readJson(opencodeConfig);
		const opencodeMcp = opencode.mcp as Record<string, unknown>;
		const opencodeDysflow = opencodeMcp.dysflow as Record<string, unknown>;
		expect(opencodeDysflow.enabled).toBe(true);
		expect(opencodeDysflow.type).toBe("local");
		expect(opencodeDysflow.command).toEqual([expectedCmd, "mcp"]);
		expect(opencodeDysflow).not.toHaveProperty("args");

		const claude = await readJson(claudeSettings);
		const claudeMcpServers = claude.mcpServers as Record<string, unknown>;
		const claudeDysflow = claudeMcpServers.dysflow as Record<string, unknown>;
		expect(claudeDysflow.command).toBe(expectedCmd);
		expect(claudeDysflow.args).toEqual(["mcp"]);

		const pi = await readJson(piConfig);
		const piMcpServers = pi.mcpServers as Record<string, unknown>;
		const piDysflow = piMcpServers.dysflow as Record<string, unknown>;
		expect(piDysflow.command).toBe(expectedCmd);
		expect(piDysflow.args).toEqual(["mcp"]);

		expect(
			await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8"),
		).toContain("%DYSFLOW_HOME%\\app\\dist\\cli\\index.js");

		await rm(root, { recursive: true, force: true });
	});
});

describe("handleUpdateCommand end-to-end", () => {
	it("updates runtime when local version is newer", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const installedPackageJson = join(appDir, "package.json");
		const oldPackageJson = {
			name: "dysflow",
			version: "0.0.1",
			type: "module",
		};
		await mkdir(appDir, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify(oldPackageJson, null, 2),
			"utf8",
		);

		const localVersion = await getLocalDysflowVersion();
		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dysflow runtime update:");
		expect(result.stdout).toContain(`0.0.1 -> ${localVersion}`);
		expect(await readFile(installedPackageJson, "utf8")).toContain(
			`"version": "${localVersion}"`,
		);

		await rm(root, { recursive: true, force: true });
	});

	it("skips reinstall when runtime is up to date", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const appCli = join(appDir, "dist", "cli");
		const installedPackageJson = join(appDir, "package.json");
		const installedMarker = join(appCli, "index.js");
		const localVersion = await getLocalDysflowVersion();
		await mkdir(appCli, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify(
				{ name: "dysflow", version: localVersion, type: "module" },
				null,
				2,
			),
			"utf8",
		);
		await writeFile(installedMarker, "OLD_RUNTIME", "utf8");

		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dysflow runtime is up to date");
		expect(await readFile(installedMarker, "utf8")).toBe("OLD_RUNTIME");

		await rm(root, { recursive: true, force: true });
	});

	it("forces reinstall when --force is used", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const appCli = join(appDir, "dist", "cli");
		const installedPackageJson = join(appDir, "package.json");
		const installedMarker = join(appCli, "index.js");

		const localVersion = await getLocalDysflowVersion();
		await mkdir(appCli, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify(
				{ name: "dysflow", version: localVersion, type: "module" },
				null,
				2,
			),
			"utf8",
		);
		await writeFile(installedMarker, "OLD_RUNTIME", "utf8");

		const result = await handleUpdateCommand([
			"--runtime-dir",
			runtimeDir,
			"--force",
		]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dysflow runtime update:");
		expect(result.stdout).toContain(`${localVersion} -> ${localVersion}`);
		expect(await readFile(installedPackageJson, "utf8")).toContain(
			`"version": "${localVersion}"`,
		);
		expect(await readFile(installedMarker, "utf8")).not.toBe("OLD_RUNTIME");

		await rm(root, { recursive: true, force: true });
	});
});
