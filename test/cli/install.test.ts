import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	handleInstallCommand,
	parseAgentList,
	parseInstallArgs,
	replaceCodexMcpSection,
} from "../../src/cli/commands/install";

const readJson = async (path: string): Promise<Record<string, unknown>> => {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw) as Record<string, unknown>;
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

describe("handleInstallCommand end-to-end", () => {
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
		expect(opencodeDysflow.command).toBe(expectedCmd);
		expect(opencodeDysflow.args).toEqual(["mcp"]);

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
