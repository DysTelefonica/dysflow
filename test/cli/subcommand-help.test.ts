import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/index";

/**
 * Contract: every subcommand MUST treat `--help` / `-h` as a side-effect-free
 * usage request. Exit code 0, stdout non-empty, stderr empty, and NO
 * operational service (PowerShell, Access COM, diagnostics, runner) invoked.
 *
 * Regression test for #591 — three subcommands regressed from this contract:
 * mcp returned exit 1 + stderr; doctor ran the full diagnostics service;
 * access treated --help as an unknown subcommand name.
 */
describe("CLI --help consistency per subcommand (#591)", () => {
  describe("mcp --help", () => {
    it.each([
      ["--help"],
      ["-h"],
    ])("exits 0 with usage on stdout and no side effects for %s", async (flag) => {
      const startMcpAdapter = vi.fn().mockResolvedValue(undefined);
      const result = await runCli(["mcp", flag], { startMcpAdapter });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain("mcp");
      expect(result.stderr).toBe("");
      expect(startMcpAdapter).not.toHaveBeenCalled();
    });
  });

  describe("doctor --help", () => {
    it.each([
      ["--help"],
      ["-h"],
    ])("exits 0 with usage on stdout and does NOT run diagnostics for %s", async (flag) => {
      const diagnosticsService = {
        run: vi.fn().mockResolvedValue({
          ok: true,
          data: { checks: [], environment: {} },
        }),
      };
      const checkMcpWiring = vi.fn().mockResolvedValue(null);
      const result = await runCli(["doctor", flag], {
        diagnosticsService,
        checkMcpWiring,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain("doctor");
      expect(result.stderr).toBe("");
      expect(diagnosticsService.run).not.toHaveBeenCalled();
      expect(checkMcpWiring).not.toHaveBeenCalled();
    });
  });

  describe("access --help", () => {
    it.each([
      ["--help"],
      ["-h"],
    ])("exits 0 with usage on stdout and does NOT instantiate a runner for %s", async (flag) => {
      const accessQueryService = { execute: vi.fn() };
      // Pass the query service as a sentinel — if access.ts tries to wire
      // a real one, this one will be picked and `execute` will be observable.
      // We assert it is NEVER used because --help must short-circuit.
      const result = await runCli(["access", flag], { accessQueryService });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain("access");
      expect(result.stderr).toBe("");
      expect(accessQueryService.execute).not.toHaveBeenCalled();
    });
  });

  it("mcp --help result equals the top-level --help result shape (deterministic)", async () => {
    const topLevel = await runCli(["--help"]);
    const subLevel = await runCli(["mcp", "--help"]);
    expect(subLevel.exitCode).toBe(topLevel.exitCode);
    expect(subLevel.stdout).toBe(topLevel.stdout);
    expect(subLevel.stderr).toBe(topLevel.stderr);
  });
});
