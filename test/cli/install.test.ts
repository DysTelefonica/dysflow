import {
	mkdtemp,
	readFile,
	rm,
	writeFile,
	mkdir,
	access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	handleInstallCommand,
	handleUpdateCommand,
	createGitHubReleaseRequestHeaders,
	parseAgentList,
	parseInstallArgs,
	parseUpdateArgs,
	replaceCodexMcpSection,
	resolvePackageRoot,
	hasDysflowMcpConfig,
	removeDysflowMcpConfig,
	applyIntegrationSelection,
} from "../../src/cli/commands/install";
import { compareVersions } from "../../src/core/utils/version";

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

async function createPackageRoot(
	root: string,
	version: string,
	marker: string,
): Promise<string> {
	const packageRoot = join(root, `package-${version}`);
	const distCli = join(packageRoot, "dist", "cli");
	await mkdir(distCli, { recursive: true });
	await writeFile(join(distCli, "index.js"), marker, "utf8");
	await writeFile(
		join(packageRoot, "package.json"),
		JSON.stringify({ name: "dysflow", version, type: "module" }, null, 2),
		"utf8",
	);
	return packageRoot;
}

describe("install arg parsing", () => {
	it("adds GitHub authorization headers for release lookup when a token is available", () => {
		expect(
			createGitHubReleaseRequestHeaders({ GH_TOKEN: "secret-token" }),
		).toEqual({
			Accept: "application/vnd.github+json",
			Authorization: "Bearer secret-token",
			"User-Agent": "dysflow-updater",
		});
	});

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

describe("Dysflow MCP config state", () => {
	it("detects and removes only Dysflow MCP entries while preserving unrelated config", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-config-state-"));
		try {
			const codexConfig = join(root, "codex.toml");
			await writeFile(
				codexConfig,
				[
					"[mcp_servers.other]",
					"command = 'other'",
					"",
					"[mcp_servers.dysflow]",
					"command = 'C:/dysflow/bin/dysflow.cmd'",
					'args = ["mcp"]',
					"startup_timeout_sec = 60.0",
					"",
				].join("\n"),
				"utf8",
			);

			const jsonConfig = join(root, "opencode.json");
			await writeFile(
				jsonConfig,
				`${JSON.stringify({ mcp: { other: { type: "remote", url: "https://example.test" }, dysflow: { enabled: true, type: "local", command: ["C:/dysflow/bin/dysflow.cmd", "mcp"] } } }, null, 2)}\n`,
				"utf8",
			);

			expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(true);
			expect(await hasDysflowMcpConfig("opencode", jsonConfig)).toBe(true);

			await removeDysflowMcpConfig("codex", codexConfig);
			await removeDysflowMcpConfig("opencode", jsonConfig);

			expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(false);
			expect(await readFile(codexConfig, "utf8")).toContain(
				"[mcp_servers.other]",
			);

			const updatedJson = await readJson(jsonConfig);
			expect((updatedJson.mcp as Record<string, unknown>).other).toEqual({
				type: "remote",
				url: "https://example.test",
			});
			expect(
				(updatedJson.mcp as Record<string, unknown>).dysflow,
			).toBeUndefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not create config files when removing absent Dysflow entries", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-config-absent-"));
		try {
			const missingCodex = join(root, "missing-codex.toml");
			const missingOpenCode = join(root, "missing-opencode.json");

			await removeDysflowMcpConfig("codex", missingCodex);
			await removeDysflowMcpConfig("opencode", missingOpenCode);

			await expect(access(missingCodex)).rejects.toThrow();
			await expect(access(missingOpenCode)).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("removes nested Codex Dysflow tables with the parent section", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-codex-nested-"));
		try {
			const codexConfig = join(root, "config.toml");
			await writeFile(
				codexConfig,
				[
					"[mcp_servers.dysflow]",
					"command = 'C:/dysflow/bin/dysflow.cmd'",
					"[mcp_servers.dysflow.env]",
					"DYSFLOW_HOME = 'C:/Users/me/AppData/Local/dysflow'",
					"[mcp_servers.other]",
					"command = 'other'",
					"",
				].join("\n"),
				"utf8",
			);

			await removeDysflowMcpConfig("codex", codexConfig);

			const updated = await readFile(codexConfig, "utf8");
			expect(updated).not.toContain("mcp_servers.dysflow");
			expect(updated).toContain("[mcp_servers.other]");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("applies selected integrations and removes unselected Dysflow entries", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-apply-selection-"));
		const home = join(root, "home");
		const runtimeDir = join(root, "runtime");
		const packageRoot = join(root, "package");
		const distCli = join(packageRoot, "dist", "cli");
		const codexConfig = join(home, ".codex", "config.toml");
		const opencodeConfig = join(home, ".config", "opencode", "opencode.json");
		const claudeDesktopConfig = join(
			home,
			"AppData",
			"Roaming",
			"Claude",
			"claude_desktop_config.json",
		);

		try {
			await mkdir(distCli, { recursive: true });
			await writeFile(join(distCli, "index.js"), "runCli", "utf8");
			await writeFile(
				join(packageRoot, "package.json"),
				'{"name":"dysflow","version":"0.2.0"}\n',
				"utf8",
			);
			await mkdir(join(home, ".codex"), { recursive: true });
			await writeFile(
				codexConfig,
				"[mcp_servers.dysflow]\ncommand = 'old'\n",
				"utf8",
			);
			await mkdir(join(home, ".config", "opencode"), { recursive: true });
			await writeFile(
				opencodeConfig,
				`${JSON.stringify({ mcp: { other: { type: "remote", url: "https://example.test" } } }, null, 2)}\n`,
				"utf8",
			);
			await mkdir(join(home, "AppData", "Roaming", "Claude"), {
				recursive: true,
			});
			await writeFile(
				claudeDesktopConfig,
				`${JSON.stringify({ mcpServers: { other: { command: "other" }, dysflow: { command: "old", args: ["mcp"] } } }, null, 2)}\n`,
				"utf8",
			);

			const result = await applyIntegrationSelection(["opencode"], {
				env: { USERPROFILE: home },
				runtimeDir,
				packageRoot,
			});

			expect(result.exitCode).toBe(0);
			expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(false);
			expect(await hasDysflowMcpConfig("opencode", opencodeConfig)).toBe(true);
			expect(
				await hasDysflowMcpConfig("claude", claudeDesktopConfig),
			).toBe(false);
			const updatedClaude = await readJson(claudeDesktopConfig);
			expect((updatedClaude.mcpServers as Record<string, unknown>).other).toEqual({
				command: "other",
			});
			const updatedOpenCode = await readJson(opencodeConfig);
			expect((updatedOpenCode.mcp as Record<string, unknown>).other).toEqual({
				type: "remote",
				url: "https://example.test",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
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
			await writeFile(
				join(installedApp, "package.json"),
				'{"name":"dysflow"}\n',
				"utf8",
			);

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
			await writeFile(
				join(appDir, "package.json"),
				'{"name":"dysflow","version":"0.1.3"}\n',
				"utf8",
			);

			const result = await handleInstallCommand(
				["--runtime-dir", runtimeDir, "--agents", "opencode", "--no-tui"],
				{ env: { USERPROFILE: home }, packageRoot: appDir },
			);

			expect(result.stderr).toBe("");
			expect(result.exitCode).toBe(0);
			expect(await readFile(join(appCli, "index.js"), "utf8")).toBe(
				"SELF_RUNTIME",
			);
			const opencode = await readJson(
				join(home, ".config", "opencode", "opencode.json"),
			);
			expect(
				(
					(opencode.mcp as Record<string, unknown>).dysflow as Record<
						string,
						unknown
					>
				).type,
			).toBe("local");
			expect(
				await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8"),
			).toContain("%DYSFLOW_HOME%\\app\\dist\\cli\\index.js");
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

		const cmdLauncher = await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8");
		expect(cmdLauncher).toContain("%DYSFLOW_HOME%\\app\\dist\\cli\\index.js");
		const ps1Launcher = await readFile(join(runtimeDir, "bin", "dysflow.ps1"), "utf8");
		expect(ps1Launcher).toContain(
			`$env:DYSFLOW_HOME = "${runtimeDir.replaceAll("\\", "\\\\")}"`,
		);
		expect(ps1Launcher).not.toContain("$env:LOCALAPPDATA\\dysflow");

		await rm(root, { recursive: true, force: true });
	});
});

describe("handleUpdateCommand end-to-end", () => {
	it("updates runtime from a newer GitHub release package provider", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-release-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const installedPackageJson = join(appDir, "package.json");
		const releasePackageRoot = await createPackageRoot(
			root,
			"9.9.9",
			"RELEASE_RUNTIME",
		);
		await mkdir(appDir, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify({ name: "dysflow", version: "1.0.0", type: "module" }, null, 2),
			"utf8",
		);

		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
			releaseUpdateProvider: {
				resolveLatestRelease: async () => ({ version: "9.9.9" }),
				preparePackage: async () => ({
					packageRoot: releasePackageRoot,
				}),
			},
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dysflow runtime update:");
		expect(result.stdout).toContain("1.0.0 -> 9.9.9");
		expect(await readFile(installedPackageJson, "utf8")).toContain(
			`"version": "9.9.9"`,
		);
		expect(
			await readFile(join(appDir, "dist", "cli", "index.js"), "utf8"),
		).toBe("RELEASE_RUNTIME");

		await rm(root, { recursive: true, force: true });
	});

	it("skips GitHub release reinstall when installed runtime matches latest", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-current-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const appCli = join(appDir, "dist", "cli");
		const installedPackageJson = join(appDir, "package.json");
		const releasePackageRoot = await createPackageRoot(
			root,
			"9.9.9",
			"NEW_RUNTIME",
		);
		await mkdir(appCli, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify({ name: "dysflow", version: "9.9.9", type: "module" }, null, 2),
			"utf8",
		);
		await writeFile(join(appCli, "index.js"), "OLD_RUNTIME", "utf8");

		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
			releaseUpdateProvider: {
				resolveLatestRelease: async () => ({ version: "9.9.9" }),
				preparePackage: async () => ({
					packageRoot: releasePackageRoot,
				}),
			},
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Dysflow runtime is up to date");
		expect(await readFile(join(appCli, "index.js"), "utf8")).toBe("OLD_RUNTIME");

		await rm(root, { recursive: true, force: true });
	});

	it("forces GitHub release reinstall when latest version is already installed", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-force-release-"));
		const runtimeDir = join(root, "runtime");
		const appDir = join(runtimeDir, "app");
		const appCli = join(appDir, "dist", "cli");
		const installedPackageJson = join(appDir, "package.json");
		const releasePackageRoot = await createPackageRoot(
			root,
			"9.9.9",
			"REINSTALLED_RUNTIME",
		);
		await mkdir(appCli, { recursive: true });
		await writeFile(
			installedPackageJson,
			JSON.stringify({ name: "dysflow", version: "9.9.9", type: "module" }, null, 2),
			"utf8",
		);
		await writeFile(join(appCli, "index.js"), "OLD_RUNTIME", "utf8");

		const result = await handleUpdateCommand(
			["--runtime-dir", runtimeDir, "--force"],
			{
				releaseUpdateProvider: {
					resolveLatestRelease: async () => ({ version: "9.9.9" }),
					preparePackage: async () => ({
						packageRoot: releasePackageRoot,
					}),
				},
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("9.9.9 -> 9.9.9");
		expect(await readFile(join(appCli, "index.js"), "utf8")).toBe(
			"REINSTALLED_RUNTIME",
		);

		await rm(root, { recursive: true, force: true });
	});

	it("returns an actionable error when GitHub release update resolution fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-update-fail-"));
		const runtimeDir = join(root, "runtime");

		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
			releaseUpdateProvider: {
				resolveLatestRelease: async () => {
					throw new Error("GitHub release lookup failed");
				},
				preparePackage: async () => ({ packageRoot: root }),
			},
		});

		expect(result).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: "Failed to update Dysflow runtime: GitHub release lookup failed",
		});

		await rm(root, { recursive: true, force: true });
	});

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
		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
			releaseUpdateProvider: {
				resolveLatestRelease: async () => ({ version: localVersion }),
				preparePackage: async () => ({ packageRoot: process.cwd() }),
			},
		});

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

		const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
			releaseUpdateProvider: {
				resolveLatestRelease: async () => ({ version: localVersion }),
				preparePackage: async () => ({ packageRoot: process.cwd() }),
			},
		});

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

		const result = await handleUpdateCommand(
			["--runtime-dir", runtimeDir, "--force"],
			{
				releaseUpdateProvider: {
					resolveLatestRelease: async () => ({ version: localVersion }),
					preparePackage: async () => ({ packageRoot: process.cwd() }),
				},
			},
		);
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
