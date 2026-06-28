// Vitest unit test for the resolveMcpE2eCommand helper (#582).
// The helper is the only place that decides which dysflow runtime the E2E
// harness is allowed to spawn. Tests cover the four documented scenarios
// (env-override, test-runtime, refuse-production, no-runtime-anywhere) plus
// the edge cases (override points at a production path, override points at a
// missing file).

import { describe, expect, it } from "vitest";
import {
  isProductionRuntimePath,
  resolveMcpE2eCommand,
} from "../../E2E_testing/_helpers/resolve-mcp-e2e-command.mjs";

function makeFs(existing: string[]): { existsSync: (p: string) => boolean } {
  const set = new Set(existing);
  return { existsSync: (p: string) => set.has(p) };
}

describe("resolveMcpE2eCommand (#582)", () => {
  it("honors DYSFLOW_E2E_COMMAND when the override file exists", () => {
    const override = "C:/custom/bin/dysflow.cmd";
    const result = resolveMcpE2eCommand({
      env: { DYSFLOW_E2E_COMMAND: override },
      repoRoot: "C:/repo",
      fs: makeFs([override, "C:/repo/test-runtime/bin/dysflow.cmd"]),
    });
    expect(result).toEqual({ ok: true, command: override, source: "env-override" });
  });

  it("honors DYSFLOW_E2E_COMMAND even when the override path looks like production", () => {
    // The override may legitimately point at a production install on purpose
    // (debugging, cross-repo comparison). The guard only fires when no
    // override is set.
    const production = "C:/Users/runner/AppData/Local/dysflow/bin/dysflow.cmd";
    const result = resolveMcpE2eCommand({
      env: { DYSFLOW_E2E_COMMAND: production },
      repoRoot: "C:/repo",
      fs: makeFs([production]),
    });
    expect(result).toEqual({ ok: true, command: production, source: "env-override" });
  });

  it("rejects an override that points at a missing file", () => {
    const result = resolveMcpE2eCommand({
      env: { DYSFLOW_E2E_COMMAND: "C:/missing/dysflow.cmd" },
      repoRoot: "C:/repo",
      fs: makeFs([]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("MCP_E2E_OVERRIDE_NOT_FOUND");
    expect(result.candidates).toContain("C:/missing/dysflow.cmd");
  });

  it("defaults to the repo test-runtime when no override is set and it exists", () => {
    const testRuntime = "C:/repo/test-runtime/bin/dysflow.cmd";
    const result = resolveMcpE2eCommand({
      env: {},
      repoRoot: "C:/repo",
      fs: makeFs([testRuntime]),
    });
    expect(result).toEqual({ ok: true, command: testRuntime, source: "test-runtime" });
  });

  it("refuses to fall back to the production runtime by default", () => {
    const production = "C:/Users/runner/AppData/Local/dysflow/bin/dysflow.cmd";
    const result = resolveMcpE2eCommand({
      env: { LOCALAPPDATA: "C:/Users/runner/AppData/Local" },
      repoRoot: "C:/repo",
      fs: makeFs([production]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("MCP_E2E_REFUSES_PRODUCTION_RUNTIME");
    expect(result.message).toContain(production);
    expect(result.candidates).toContain(production);
  });

  it("reports no-runtime-available when nothing is on disk anywhere", () => {
    const result = resolveMcpE2eCommand({
      env: {},
      repoRoot: "C:/repo",
      fs: makeFs([]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("MCP_E2E_NO_RUNTIME_AVAILABLE");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("prefers the test-runtime over the production runtime when both exist and no override is set", () => {
    const testRuntime = "C:/repo/test-runtime/bin/dysflow.cmd";
    const production = "C:/Users/runner/AppData/Local/dysflow/bin/dysflow.cmd";
    const result = resolveMcpE2eCommand({
      env: { LOCALAPPDATA: "C:/Users/runner/AppData/Local" },
      repoRoot: "C:/repo",
      fs: makeFs([testRuntime, production]),
    });
    expect(result).toEqual({ ok: true, command: testRuntime, source: "test-runtime" });
  });
});

describe("isProductionRuntimePath (#582)", () => {
  it("flags %LOCALAPPDATA%\\dysflow paths as production", () => {
    expect(isProductionRuntimePath("C:/Users/runner/AppData/Local/dysflow/bin/dysflow.cmd")).toBe(
      true,
    );
  });

  it("flags the legacy %LOCALAPPDATA%\\dysflow path as production", () => {
    expect(
      isProductionRuntimePath("C:\\Users\\runner\\AppData\\Local\\dysflow\\bin\\dysflow.cmd"),
    ).toBe(true);
  });

  it("does not flag the repo test-runtime path", () => {
    expect(isProductionRuntimePath("C:/repo/test-runtime/bin/dysflow.cmd")).toBe(false);
  });

  it("returns false for an empty path", () => {
    expect(isProductionRuntimePath("")).toBe(false);
  });
});
