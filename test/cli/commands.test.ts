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


  it("returns a clean MCP configuration error when Access path is missing", async () => {
    const result = await runCli(["mcp"], {
      env: {},
    });

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "CONFIG_MISSING_ACCESS_PATH: Access database path is required. Set DYSFLOW_ACCESS_DB_PATH or pass accessDbPath.",
    });
  });

  it("wires setup to core configuration and prints only redacted configuration", async () => {
    const result = await runCli(["setup"], {
      env: {
        DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb",
        ACCESS_VBA_PASSWORD: "super-secret",
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
        run: async () => successResult({ checks: [{ name: "access-db-path", ok: true, message: "configuredAccessPath=C:/data/app.accdb" }] }),
      },
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "✓ access-db-path: configuredAccessPath=C:/data/app.accdb",
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

  it("wires serve to the HTTP adapter with safe defaults", async () => {
    const starts: unknown[] = [];
    const result = await runCli(["serve", "--port", "0"], {
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
      startHttpAdapter: async (options) => {
        starts.push(options);
        return { url: "http://127.0.0.1:17321", host: "127.0.0.1", port: 17321, writesEnabled: false };
      },
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Dysflow HTTP API listening on http://127.0.0.1:17321 (writes disabled)",
      stderr: "",
    });
    expect(starts).toEqual([{ host: "127.0.0.1", port: 0, writesEnabled: false, env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" } }]);
  });

  it("requires an explicit flag before serve enables write routes", async () => {
    const starts: unknown[] = [];
    const result = await runCli(["serve", "--host", "127.0.0.1", "--port", "0", "--enable-writes"], {
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
      startHttpAdapter: async (options) => {
        starts.push(options);
        return { url: "http://127.0.0.1:17321", host: "127.0.0.1", port: 17321, writesEnabled: true };
      },
    });

    expect(result.stdout).toBe("Dysflow HTTP API listening on http://127.0.0.1:17321 (writes enabled)");
    expect(starts).toEqual([{ host: "127.0.0.1", port: 0, writesEnabled: true, env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" } }]);
  });

  it("exports command handlers as small modules", async () => {
    await expect(handleDoctorCommand([], {
      diagnosticsService: {
          run: async () => successResult({ checks: [{ name: "access-db-path", ok: true, message: "configuredAccessPath=C:/data/app.accdb" }] }),
      },
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/data/app.accdb" },
    })).resolves.toEqual({
      exitCode: 0,
      stdout: "✓ access-db-path: configuredAccessPath=C:/data/app.accdb",
      stderr: "",
    });

    await expect(handleServeCommand(["--help"])).resolves.toEqual({
      exitCode: 0,
      stdout: "Usage: dysflow serve [--host 127.0.0.1] [--port 17321] [--enable-writes]",
      stderr: "",
    });
  });
});
