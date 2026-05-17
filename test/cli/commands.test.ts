import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";
import { handleDoctorCommand } from "../../src/cli/commands/doctor";
import { handleServeCommand } from "../../src/cli/commands/serve";
import { handleSetupCommand } from "../../src/cli/commands/setup";
import { successResult } from "../../src/core/contracts/index";

const plannedCommandCases = [
	["install", ""],
	["update", ""],
] as const;

const missingAccessError =
	"CONFIG_MISSING_ACCESS_PATH: Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.";

function createRepoConfigWorkspace(): { root: string; cleanup(): void } {
	const root = mkdtempSync(join(tmpdir(), "dysflow-cli-"));
	mkdirSync(join(root, ".dysflow"), { recursive: true });
	writeFileSync(
		join(root, ".dysflow", "project.json"),
		`${JSON.stringify({ accessPath: "front.accdb", passwordEnv: "DYSFLOW_ACCESS_PASSWORD" }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(join(root, "front.accdb"), "", "utf8");
	return {
		root,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

describe("dysflow command modules", () => {
	it("opens the TUI by default when no command is provided", async () => {
		const result = await runCli([], {
			runTui: async () => ({ exitCode: 0, stdout: "TUI_OPENED", stderr: "" }),
		});

		expect(result).toEqual({ exitCode: 0, stdout: "TUI_OPENED", stderr: "" });
	});

	it("applies TUI integration selection when provided by the interactive flow", async () => {
		const calls: unknown[] = [];
		const result = await runCli([], {
			tuiSelectedAgents: ["opencode"],
			runTui: async (_args, context) => {
				calls.push(context?.tuiSelectedAgents);
				return { exitCode: 0, stdout: "APPLIED", stderr: "" };
			},
		});

		expect(result).toEqual({ exitCode: 0, stdout: "APPLIED", stderr: "" });
		expect(calls).toEqual([["opencode"]]);
	});

	it.each([
		["--help"],
		["-h"],
	])("keeps explicit %s help output available", async (flag) => {
		const result = await runCli([flag], {
			runTui: async () => ({ exitCode: 0, stdout: "TUI_OPENED", stderr: "" }),
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage: dysflow [command]");
		expect(result.stdout).not.toContain("TUI_OPENED");
	});

	it.each(
		plannedCommandCases,
	)("dispatches %s through dedicated handler", async (command) => {
		const result = await runCli([command, "--help"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`Usage: dysflow ${command}`);
		expect(result.stderr).toBe("");
	});

	it("starts MCP stdio through an injected core adapter without writing stdout", async () => {
		const calls: unknown[] = [];

		const workspace = createRepoConfigWorkspace();
		try {
			const result = await runCli(["mcp"], {
				startMcpAdapter: async (...args: unknown[]) => {
					calls.push(args[0]);
				},
				cwd: workspace.root,
				env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
			});

			expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
			expect(calls).toEqual([
				expect.objectContaining({
					accessDbPath: join(workspace.root, "front.accdb"),
				}),
			]);
		} finally {
			workspace.cleanup();
		}
	});

	it("starts MCP in degraded mode when Access path is missing", async () => {
		const calls: unknown[] = [];
		const workspace = mkdtempSync(join(tmpdir(), "dysflow-missing-"));
		try {
			const result = await runCli(["mcp"], {
				env: {},
				cwd: workspace,
				startMcpAdapter: async (...args: unknown[]) => {
					calls.push(args[0]);
				},
			});

			expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
			expect(calls).toEqual([undefined]);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("wires setup to core configuration and prints only redacted configuration", async () => {
		const workspace = createRepoConfigWorkspace();
		try {
			const result = await runCli(["setup"], {
				cwd: workspace.root,
				env: { DYSFLOW_ACCESS_PASSWORD: "super-secret" },
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(
				`Access database: ${join(workspace.root, "front.accdb")}`,
			);
			expect(result.stdout).toContain("Timeout: 30000ms");
			expect(result.stdout).toContain("Password: [REDACTED]");
			expect(result.stdout).not.toContain("super-secret");
			expect(result.stderr).toBe("");
		} finally {
			workspace.cleanup();
		}
	});

	it("writes repo-relative project config with default src destination when --write-project is used", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "dysflow-setup-"));
		const projectPath = join(workspace, ".dysflow", "project.json");
		const dataDir = join(workspace, "E2E_testing");
		const accessPath = join(dataDir, "front.accdb");
		const backendPath = join(dataDir, "backend.accdb");

		try {
			mkdirSync(dataDir, { recursive: true });
			writeFileSync(accessPath, "", "utf8");
			writeFileSync(backendPath, "", "utf8");

			const result = await handleSetupCommand(
				[
					"--write-project",
					"--access-path",
					accessPath,
					"--backend-path",
					backendPath,
				],
				{ env: {}, cwd: workspace },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(
				`Wrote portable project config to ${projectPath}`,
			);
			expect(readFileSync(projectPath, "utf8")).toBe(
				`${JSON.stringify(
					{
						id: basename(workspace),
						accessPath: "E2E_testing/front.accdb",
						backendPath: "E2E_testing/backend.accdb",
						destinationRoot: "src",
					},
					null,
					2,
				)}\n`,
			);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("wires doctor to core diagnostics service", async () => {
		const result = await runCli(["doctor"], {
			diagnosticsService: {
				run: async () =>
					successResult({
						checks: [
							{ name: "access-db-path", ok: true, message: "configured" },
						],
					}),
			},
			env: {},
		});

		expect(result).toEqual({
			exitCode: 0,
			stdout: "✓ access-db-path: configured",
			stderr: "",
		});
	});

	it("returns a clean doctor error when configuration is missing", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "dysflow-missing-"));
		try {
			const result = await runCli(["doctor"], {
				env: {},
				cwd: workspace,
			});

			expect(result).toEqual({
				exitCode: 1,
				stdout: "",
				stderr: missingAccessError,
			});
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("wires serve to the HTTP adapter with safe defaults", async () => {
		const starts: unknown[] = [];
		const result = await runCli(["serve", "--port", "0"], {
			env: {},
			startHttpAdapter: async (options) => {
				starts.push(options);
				return {
					url: "http://127.0.0.1:17321",
					host: "127.0.0.1",
					port: 17321,
					writesEnabled: false,
				};
			},
		});

		expect(result).toEqual({
			exitCode: 0,
			stdout:
				"Dysflow HTTP API listening on http://127.0.0.1:17321 (writes disabled)",
			stderr: "",
		});
		expect(starts).toEqual([
			{
				host: "127.0.0.1",
				port: 0,
				writesEnabled: false,
				env: {},
			},
		]);
	});

	it("requires an explicit flag before serve enables write routes", async () => {
		const starts: unknown[] = [];
		const result = await runCli(
			["serve", "--host", "127.0.0.1", "--port", "0", "--enable-writes"],
			{
				env: {},
				startHttpAdapter: async (options) => {
					starts.push(options);
					return {
						url: "http://127.0.0.1:17321",
						host: "127.0.0.1",
						port: 17321,
						writesEnabled: true,
					};
				},
			},
		);

		expect(result.stdout).toBe(
			"Dysflow HTTP API listening on http://127.0.0.1:17321 (writes enabled)",
		);
		expect(starts).toEqual([
			{
				host: "127.0.0.1",
				port: 0,
				writesEnabled: true,
				env: {},
			},
		]);
	});

	it("exports command handlers as small modules", async () => {
		await expect(
			handleDoctorCommand([], {
				diagnosticsService: {
					run: async () =>
						successResult({
							checks: [
								{ name: "access-db-path", ok: true, message: "configured" },
							],
						}),
				},
				env: {},
			}),
		).resolves.toEqual({
			exitCode: 0,
			stdout: "✓ access-db-path: configured",
			stderr: "",
		});

		await expect(handleServeCommand(["--help"])).resolves.toEqual({
			exitCode: 0,
			stdout:
				"Usage: dysflow serve [--host 127.0.0.1] [--port 17321] [--enable-writes]",
			stderr: "",
		});
	});
});
