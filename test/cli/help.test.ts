import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";

describe("dysflow CLI help", () => {
	it("prints the available command surface for --help", async () => {
		const result = await runCli(["--help"]);

		expect(result).toEqual({
			exitCode: 0,
			stdout: [
				"Usage: dysflow <command>",
				"",
				"Commands:",
				"  mcp     Start the MCP stdio adapter",
				"  setup   Prepare local Dysflow configuration",
				"  doctor  Check local Dysflow requirements",
				"  install Run Dysflow installer (interactive MCP wiring + runtime copy)",
				"  tui     Open the Dysflow terminal UI",
				"  serve   Start local HTTP API",
			].join("\n"),
			stderr: "",
		});
	});

	it("returns usage guidance for unsupported commands", async () => {
		const result = await runCli(["unknown"]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Unsupported command: unknown");
		expect(result.stderr).toContain("Usage: dysflow <command>");
	});
});
