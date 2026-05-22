import { describe, expect, it } from "vitest";
import { parseUninstallArgs, handleUninstallCommand } from "../../src/cli/commands/uninstall";
import { runCli } from "../../src/cli/index";

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
