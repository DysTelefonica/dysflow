import { describe, expect, it } from "vitest";
import { parseUninstallArgs, handleUninstallCommand } from "../../src/cli/commands/uninstall";
import { runCli } from "../../src/cli/index";
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	resolveAgentConfigPaths,
	getSystemMarkerPath,
	fileExists,
} from "../../src/cli/commands/install";

describe("uninstall arg parsing", () => {
	const UNINSTALL_USAGE = "Usage: dysflow uninstall [--runtime-dir <dir>]";

	it("returns usage text for --help or -h", () => {
		expect(parseUninstallArgs(["--help"])).toEqual({
			ok: false,
			message: UNINSTALL_USAGE,
		});
		expect(parseUninstallArgs(["-h"])).toEqual({
			ok: false,
			message: UNINSTALL_USAGE,
		});
	});

	it("parses valid --runtime-dir option", () => {
		expect(parseUninstallArgs(["--runtime-dir", "C:/some/path"])).toEqual({
			ok: true,
			options: {
				runtimeDir: "C:/some/path",
			},
		});
	});

	it("rejects missing value for --runtime-dir", () => {
		expect(parseUninstallArgs(["--runtime-dir"])).toEqual({
			ok: false,
			message: "Missing value for --runtime-dir.",
		});
		expect(parseUninstallArgs(["--runtime-dir", "--other-flag"])).toEqual({
			ok: false,
			message: "Missing value for --runtime-dir.",
		});
	});

	it("rejects unknown options", () => {
		expect(parseUninstallArgs(["--unknown-flag"])).toEqual({
			ok: false,
			message: "Unsupported uninstall option: --unknown-flag",
		});
	});
});

describe("uninstall CLI integration", () => {
	const UNINSTALL_USAGE = "Usage: dysflow uninstall [--runtime-dir <dir>]";

	it("prints usage and exits 0 on --help or -h via handleUninstallCommand", async () => {
		const result1 = await handleUninstallCommand(["--help"]);
		expect(result1).toEqual({
			exitCode: 0,
			stdout: UNINSTALL_USAGE,
			stderr: "",
		});

		const result2 = await handleUninstallCommand(["-h"]);
		expect(result2).toEqual({
			exitCode: 0,
			stdout: UNINSTALL_USAGE,
			stderr: "",
		});
	});

	it("rejects unknown options and exits 1 via handleUninstallCommand", async () => {
		const result = await handleUninstallCommand(["--unknown-flag"]);
		expect(result).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: "Unsupported uninstall option: --unknown-flag",
		});
	});

	it("rejects missing --runtime-dir value and exits 1 via handleUninstallCommand", async () => {
		const result = await handleUninstallCommand(["--runtime-dir"]);
		expect(result).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: "Missing value for --runtime-dir.",
		});
	});

	it("routes correctly via runCli", async () => {
		const result = await runCli(["uninstall", "--help"]);
		expect(result).toEqual({
			exitCode: 0,
			stdout: UNINSTALL_USAGE,
			stderr: "",
		});
	});
});

describe("uninstall execution side-effects", () => {
	async function setupMockEnvironment(root: string) {
		const home = join(root, "home");
		const runtimeDir = join(root, "runtime");
		const markerDir = join(root, "marker-dir");
		const markerPath = join(markerDir, ".dysflow-marker");

		await mkdir(home, { recursive: true });
		await mkdir(runtimeDir, { recursive: true });
		await mkdir(markerDir, { recursive: true });

		// Write marker
		await writeFile(markerPath, `1\n${runtimeDir}\n`, "utf8");

		// Codex
		await mkdir(join(home, ".codex"), { recursive: true });
		await writeFile(
			join(home, ".codex", "config.toml"),
			`[mcp_servers.other]\ncommand = "other"\n\n[mcp_servers.dysflow]\ncommand = "dysflow"\n`,
			"utf8",
		);

		// OpenCode
		await mkdir(join(home, ".config", "opencode"), { recursive: true });
		await writeFile(
			join(home, ".config", "opencode", "opencode.json"),
			JSON.stringify({
				mcp: {
					other: { type: "remote" },
					dysflow: { command: "dysflow" }
				}
			}, null, 2),
			"utf8",
		);

		// Claude
		await mkdir(join(home, "AppData", "Roaming", "Claude"), { recursive: true });
		await writeFile(
			join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
			JSON.stringify({
				mcpServers: {
					other: { command: "other" },
					dysflow: { command: "dysflow" }
				}
			}, null, 2),
			"utf8",
		);
		await mkdir(join(home, ".claude"), { recursive: true });
		await writeFile(
			join(home, ".claude", "settings.json"),
			JSON.stringify({
				mcpServers: {
					other: { command: "other" },
					dysflow: { command: "dysflow" }
				}
			}, null, 2),
			"utf8",
		);

		// Pi
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "mcp.json"),
			JSON.stringify({
				mcpServers: {
					other: { command: "other" },
					dysflow: { command: "dysflow" }
				}
			}, null, 2),
			"utf8",
		);

		const env = {
			USERPROFILE: home,
			DYSFLOW_HOME: runtimeDir,
			DYSFLOW_RUNTIME_MARKER_PATH: markerPath,
		};

		return { home, runtimeDir, markerDir, markerPath, env };
	}

	it("surgically removes dysflow configurations from all agents while keeping other configurations", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-uninstall-"));
		try {
			const { home, env } = await setupMockEnvironment(root);
			const context = { env };

			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);

			// Codex config
			const codexContent = await readFile(join(home, ".codex", "config.toml"), "utf8");
			expect(codexContent).toContain("[mcp_servers.other]");
			expect(codexContent).not.toContain("[mcp_servers.dysflow]");

			// OpenCode config
			const opencode = JSON.parse(await readFile(join(home, ".config", "opencode", "opencode.json"), "utf8"));
			expect(opencode.mcp.other).toBeDefined();
			expect(opencode.mcp.dysflow).toBeUndefined();

			// Claude Desktop config
			const claudeDesktop = JSON.parse(await readFile(join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"), "utf8"));
			expect(claudeDesktop.mcpServers.other).toBeDefined();
			expect(claudeDesktop.mcpServers.dysflow).toBeUndefined();

			// Claude settings config
			const claudeSettings = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
			expect(claudeSettings.mcpServers.other).toBeDefined();
			expect(claudeSettings.mcpServers.dysflow).toBeUndefined();

			// Pi config
			const pi = JSON.parse(await readFile(join(home, ".pi", "agent", "mcp.json"), "utf8"));
			expect(pi.mcpServers.other).toBeDefined();
			expect(pi.mcpServers.dysflow).toBeUndefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("is gracefully idempotent when agent configs or paths are absent", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-uninstall-idempotent-"));
		try {
			const home = join(root, "home");
			// No config files exist at all
			const env = {
				USERPROFILE: home,
				DYSFLOW_HOME: join(root, "nonexistent-runtime"),
				DYSFLOW_RUNTIME_MARKER_PATH: join(root, "nonexistent-marker"),
			};
			const context = { env };

			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("recursively deletes the runtime directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-uninstall-runtime-"));
		try {
			const { runtimeDir, env } = await setupMockEnvironment(root);
			// Write some dummy file inside runtimeDir to make sure recursive delete works
			await writeFile(join(runtimeDir, "dummy.txt"), "hello", "utf8");

			const context = { env };
			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);

			expect(await fileExists(runtimeDir)).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("deletes system marker file and deletes the parent directory if empty, but leaves parent untouched if not empty", async () => {
		// Case A: parent directory is empty after marker file deletion
		const rootA = await mkdtemp(join(tmpdir(), "dysflow-uninstall-marker-empty-"));
		try {
			const { markerDir, markerPath, env } = await setupMockEnvironment(rootA);

			const context = { env };
			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);

			expect(await fileExists(markerPath)).toBe(false);
			expect(await fileExists(markerDir)).toBe(false);
		} finally {
			await rm(rootA, { recursive: true, force: true });
		}

		// Case B: parent directory is NOT empty after marker file deletion
		const rootB = await mkdtemp(join(tmpdir(), "dysflow-uninstall-marker-notempty-"));
		try {
			const { markerDir, markerPath, env } = await setupMockEnvironment(rootB);
			// Write another file in the marker directory
			const otherFile = join(markerDir, "other.txt");
			await writeFile(otherFile, "keep me", "utf8");

			const context = { env };
			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);

			expect(await fileExists(markerPath)).toBe(false);
			expect(await fileExists(markerDir)).toBe(true);
			expect(await fileExists(otherFile)).toBe(true);
		} finally {
			await rm(rootB, { recursive: true, force: true });
		}
	});

	it("cleans up DYSFLOW_HOME and DYSFLOW_RUNTIME_MARKER_PATH from context.env", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-uninstall-env-"));
		try {
			const { env } = await setupMockEnvironment(root);
			const context = { env };

			const result = await handleUninstallCommand([], context);
			expect(result.exitCode).toBe(0);

			expect(context.env.DYSFLOW_HOME).toBeUndefined();
			expect(context.env.DYSFLOW_RUNTIME_MARKER_PATH).toBeUndefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("emits stdout warnings if environment variables remain in process.env", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-uninstall-warning-"));
		try {
			const { env } = await setupMockEnvironment(root);
			// Back up process.env
			const oldHome = process.env.DYSFLOW_HOME;
			const oldMarker = process.env.DYSFLOW_RUNTIME_MARKER_PATH;

			try {
				process.env.DYSFLOW_HOME = "dummy";
				process.env.DYSFLOW_RUNTIME_MARKER_PATH = "dummy";

				const context = { env };
				const result = await handleUninstallCommand([], context);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Warning: DYSFLOW_HOME is still set in your process environment");
				expect(result.stdout).toContain("Warning: DYSFLOW_RUNTIME_MARKER_PATH is still set in your process environment");
			} finally {
				if (oldHome === undefined) delete process.env.DYSFLOW_HOME;
				else process.env.DYSFLOW_HOME = oldHome;
				if (oldMarker === undefined) delete process.env.DYSFLOW_RUNTIME_MARKER_PATH;
				else process.env.DYSFLOW_RUNTIME_MARKER_PATH = oldMarker;
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
