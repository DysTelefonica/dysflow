import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";

function getPackageVersion(): string {
	const packageJson = JSON.parse(
		readFileSync(join(process.cwd(), "package.json"), "utf8"),
	) as { version?: string };
	return packageJson.version ?? "0.0.0";
}

describe("dysflow CLI help", () => {
	it("prints the available command surface for --help", async () => {
		const result = await runCli(["--help"]);

		expect(result).toEqual({
			exitCode: 0,
			stdout: [
				"Usage: dysflow [command]",
				"",
				"Default:",
				"  dysflow Open the Dysflow terminal UI dashboard",
				"",
				"Commands:",
				"  mcp     Start the MCP stdio adapter",
				"  setup   Prepare local Dysflow configuration",
				"  doctor  Check local Dysflow requirements",
				"  install Run Dysflow installer (interactive MCP wiring + runtime copy)",
				"  update  Reinstall runtime when source version is newer",
				"  tui     Open the Dysflow terminal UI",
				"  serve   Start local HTTP API",
			].join("\n"),
			stderr: "",
		});
	});

	it.each([
		["--version"],
		["-v"],
	])("prints the package version for %s", async (flag) => {
		const result = await runCli([flag]);

		expect(result).toEqual({
			exitCode: 0,
			stdout: getPackageVersion(),
			stderr: "",
		});
	});

	it("returns usage guidance for unsupported commands", async () => {
		const result = await runCli(["unknown"]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Unsupported command: unknown");
		expect(result.stderr).toContain("Usage: dysflow [command]");
	});
});
