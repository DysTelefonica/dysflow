import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";
import { handleDoctorCommand } from "../../src/cli/commands/doctor";
import { handleServeCommand } from "../../src/cli/commands/serve";
import { successResult } from "../../src/core/contracts/index";

const plannedCommandCases = [
  ["tui", "tui is planned; terminal UI is not implemented yet."],
] as const;

describe("dysflow command modules", () => {
  it.each(plannedCommandCases)("dispatches %s through a dedicated planned handler", async (command, stdout) => {
    const result = await runCli([command]);

    expect(result).toEqual({ exitCode: 0, stdout, stderr: "" });
  });

  it("starts MCP stdio through an injected core adapter without writing stdout", async () => {
    const calls: string[] = [];

    const result = await runCli(["mcp"], {
      startMcpAdapter: async () => {
        calls.push("started");
      },
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    });

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(calls).toEqual(["started"]);
  });


  it("fails explicitly when the real MCP stdio runtime is not implemented yet", async () => {
    const result = await runCli(["mcp"], {
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    });

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "MCP_STDIO_RUNTIME_NOT_IMPLEMENTED: dysflow mcp requires the real MCP stdio runtime before it can serve tools.",
    });
  });

  it("wires setup to core configuration and prints only redacted configuration", async () => {
    const result = await runCli(["setup"], {
      env: {
        DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb",
        DYSFLOW_ACCESS_PASSWORD: "super-secret",
        DYSFLOW_TIMEOUT_MS: "1234",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Access database: C:/data/app.accdb");
    expect(result.stdout).toContain("Timeout: 1234ms");
    expect(result.stdout).toContain("Password: [REDACTED]");
    expect(result.stdout).not.toContain("super-secret");
    expect(result.stderr).toBe("");
  });

  it("wires doctor to core diagnostics service", async () => {
    const result = await runCli(["doctor"], {
      diagnosticsService: {
        run: async () => successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }),
      },
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "✓ access-db-path: configured",
      stderr: "",
    });
  });


  it("returns a clean doctor error when configuration is missing", async () => {
    const result = await runCli(["doctor"], { env: {} });

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "CONFIG_MISSING_ACCESS_PATH: Access database path is required. Set DYSFLOW_ACCESS_DB_PATH or pass accessDbPath.",
    });
  });

  it("keeps serve explicit as a planned HTTP adapter instead of starting anything", async () => {
    const result = await runCli(["serve"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("dysflow serve is planned for the HTTP adapter phase.");
    expect(result.stderr).toContain("Usage: dysflow serve [--host 127.0.0.1] [--port 17321]");
  });

  it("exports command handlers as small modules", async () => {
    await expect(handleDoctorCommand([], {
      diagnosticsService: {
        run: async () => successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }),
      },
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    })).resolves.toEqual({
      exitCode: 0,
      stdout: "✓ access-db-path: configured",
      stderr: "",
    });

    await expect(handleServeCommand(["--help"])).resolves.toEqual({
      exitCode: 0,
      stdout: "Usage: dysflow serve [--host 127.0.0.1] [--port 17321]",
      stderr: "",
    });
  });
});
