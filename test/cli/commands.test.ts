import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";
import { handleDoctorCommand } from "../../src/cli/commands/doctor";
import { handleServeCommand } from "../../src/cli/commands/serve";

const plannedCommandCases = [
  ["mcp", "mcp stdio adapter is planned; MCP wiring is not implemented yet."],
  ["setup", "setup is planned; configuration file creation is not implemented yet."],
  ["doctor", "doctor checks are planned; core diagnostics are not wired yet."],
  ["tui", "tui is planned; terminal UI is not implemented yet."],
] as const;

describe("dysflow command modules", () => {
  it.each(plannedCommandCases)("dispatches %s through a dedicated planned handler", async (command, stdout) => {
    const result = await runCli([command]);

    expect(result).toEqual({ exitCode: 0, stdout, stderr: "" });
  });

  it("keeps serve explicit as a planned HTTP adapter instead of starting anything", async () => {
    const result = await runCli(["serve"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("dysflow serve is planned for the HTTP adapter phase.");
    expect(result.stderr).toContain("Usage: dysflow serve [--host 127.0.0.1] [--port 17321]");
  });

  it("exports command handlers as small modules", async () => {
    await expect(handleDoctorCommand([])).resolves.toEqual({
      exitCode: 0,
      stdout: "doctor checks are planned; core diagnostics are not wired yet.",
      stderr: "",
    });

    await expect(handleServeCommand(["--help"])).resolves.toEqual({
      exitCode: 0,
      stdout: "Usage: dysflow serve [--host 127.0.0.1] [--port 17321]",
      stderr: "",
    });
  });
});
