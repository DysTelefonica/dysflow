// Regression test for the stop-on-fail rule against the REAL extracted
// `record()` driver from `E2E_testing/_helpers/mcp-e2e-record.mjs`.
//
// History: the previous version of this file re-implemented the
// stop-on-fail loop in-memory and called it a regression test. That is
// not a regression test — it is a copy of the rule that drifts as soon
// as the real driver changes. The user observed MSACCESS.EXE orphans
// from `pnpm test:e2e:mcp` and the in-memory simulation happily stayed
// green, hiding the drift.
//
// This file pins the contract at the extracted helper: we IMPORT the
// real `record()` and inject fakes for its dependencies. The hard rules
// are:
//
//   H3a — `expected: "error"` + harness `isError: false` must throw
//         STOP-ON-FAIL (the tool returned `ok: true` unexpectedly).
//   H3b — `expected: "error"` + harness `isError: true` must continue
//         and push a PASS row.
//   H3c — `expected: "success"` + harness `isError: true` must throw
//         STOP-ON-FAIL (the tool returned `ok: false` unexpectedly).
//   H7  — post-tool zombie check pushes a `${tool}:zombie-check` row
//         whose pass reflects `isOwnPidAlive(result.childPid)`. A live
//         child triggers STOP-ON-FAIL; a dead child removes the PID
//         from `suiteOwnPids` so the next preflight does not wait on a
//         dead PID.

// @ts-nocheck — the imported `record` helper has no .d.mts yet; the
// runtime contract is exercised by vitest and pinned by these tests.
import { describe, expect, it } from "vitest";
import { record } from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

interface FakeOptions {
  childPid?: number;
  isError?: boolean;
  timedOut?: boolean;
  text?: string;
  stderr?: string;
  exit?: unknown;
}

function makeCtx(
  opts: {
    harness?: FakeOptions;
    preflight?: { found: boolean; pids?: number[] };
    childAlive?: boolean;
  } = {},
) {
  const harness = {
    childPid: opts.harness?.childPid ?? 0,
    timedOut: opts.harness?.timedOut ?? false,
    isError: opts.harness?.isError ?? false,
    text: opts.harness?.text ?? "{}",
    stderr: opts.harness?.stderr ?? "",
    exit: opts.harness?.exit ?? 0,
  };
  const rows: Array<{
    area: string;
    tool: string;
    pass: boolean;
    expected: string;
    ms: number;
    summary: string;
  }> = [];
  const suiteOwnPids = new Set<number>();
  const processObj = { exitCode: null as number | null };
  const logs: string[] = [];
  const errors: string[] = [];
  const preflightResult = opts.preflight ?? { found: false };
  const postToolZombie = { found: false, elapsed: 0 };

  const ctx = {
    callMcp: async () => harness,
    suiteOwnPids,
    rows,
    waitForNoOwnPids: async (_timeoutMs?: number, _pollMs?: number) => {
      // First call (preflight) returns preflightResult; subsequent calls
      // (post-tool zombie check) return found:false so the row is pushed.
      if (
        rows.filter((r) => r.tool.endsWith(":zombie-check") || r.tool.endsWith(":preflight"))
          .length === 0
      ) {
        return { found: preflightResult.found, pids: preflightResult.pids ?? [], elapsed: 0 };
      }
      return postToolZombie;
    },
    isOwnPidAlive: (_pid: number) => opts.childAlive ?? false,
    processObj,
    consoleLog: (msg: string) => {
      logs.push(String(msg));
    },
    consoleError: (msg: string) => {
      errors.push(String(msg));
    },
    DateNow: () => 0,
  };

  return { ctx, rows, suiteOwnPids, processObj, logs, errors, harness };
}

describe("mcp-e2e record() — extracted helper exercises the real driver", () => {
  it("H3a — expected:'error' + isError:false throws STOP-ON-FAIL after the tool", async () => {
    const { ctx, rows, processObj, errors } = makeCtx({
      harness: { childPid: 0, isError: false, timedOut: false, text: "ok-but-expected-error" },
    });

    await expect(
      record(ctx, {
        area: "diagnostics",
        tool: "query_sql",
        args: { sql: "DROP TABLE TbConfiguracion" },
        options: { expected: "error" },
      }),
    ).rejects.toThrow(/mcp-e2e: STOP-ON-FAIL after query_sql/);

    // The harness returned ok:true but we expected error — pass=false, STOP-ON-FAIL.
    // Two rows are pushed before the throw: the tool row + the zombie-check row.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.pass).toBe(false);
    expect(rows[0]?.tool).toBe("query_sql");
    expect(rows[0]?.expected).toBe("error");
    expect(processObj.exitCode).toBe(1);
    expect(errors.some((e) => e.includes("STOP-ON-FAIL after query_sql"))).toBe(true);
  });

  it("H3b — expected:'error' + isError:true resolves and pushes a PASS row", async () => {
    const { ctx, rows, processObj } = makeCtx({
      harness: { childPid: 0, isError: true, timedOut: false, text: "permission denied" },
    });

    const result = await record(ctx, {
      area: "diagnostics",
      tool: "query_sql",
      args: { sql: "DROP TABLE TbConfiguracion" },
      options: { expected: "error" },
    });

    // expected:error + isError:true → pass=true, the tool row is PASS, no STOP-ON-FAIL.
    expect(result.isError).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.pass).toBe(true);
    expect(rows[0]?.tool).toBe("query_sql");
    expect(rows[0]?.expected).toBe("error");
    expect(rows[1]?.tool).toBe("query_sql:zombie-check");
    expect(processObj.exitCode).toBeNull();
  });

  it("H3c — expected:'success' + isError:true throws STOP-ON-FAIL after the tool", async () => {
    const { ctx, rows, processObj } = makeCtx({
      harness: { childPid: 0, isError: true, timedOut: false, text: "unexpected error" },
    });

    await expect(
      record(ctx, {
        area: "diagnostics",
        tool: "tools/list",
        args: {},
        options: { expected: "success" },
      }),
    ).rejects.toThrow(/mcp-e2e: STOP-ON-FAIL after tools\/list|STOP-ON-FAIL/);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.pass).toBe(false);
    expect(rows[0]?.tool).toBe("tools/list");
    expect(processObj.exitCode).toBe(1);
  });

  it("H7a — child exits cleanly: pushes PASS zombie-check row and removes PID from suiteOwnPids", async () => {
    const { ctx, rows, suiteOwnPids } = makeCtx({
      harness: { childPid: 4242, isError: false, timedOut: false, text: "ok" },
      childAlive: false,
    });

    const result = await record(ctx, {
      area: "operations",
      tool: "list_access_operations",
      args: {},
      options: { expected: "success" },
    });

    expect(result.childPid).toBe(4242);
    expect(suiteOwnPids.has(4242)).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.tool).toBe("list_access_operations:zombie-check");
    expect(rows[1]?.pass).toBe(true);
  });

  it("H7b — child lingers after the tool: throws STOP-ON-FAIL and leaves PID in suiteOwnPids", async () => {
    const { ctx, rows, suiteOwnPids } = makeCtx({
      harness: { childPid: 9999, isError: false, timedOut: false, text: "ok" },
      childAlive: true,
    });

    await expect(
      record(ctx, {
        area: "operations",
        tool: "list_access_operations",
        args: {},
        options: { expected: "success" },
      }),
    ).rejects.toThrow(/STOP-ON-FAIL/);

    // The child lingered, so the zombie-check row must be FAIL and the
    // PID must remain in the watchlist (the next preflight will retry).
    expect(suiteOwnPids.has(9999)).toBe(true);
    expect(rows[1]?.tool).toBe("list_access_operations:zombie-check");
    expect(rows[1]?.pass).toBe(false);
  });

  it("H7c — leaked PID detected at preflight throws REFUSE-START before any tool runs", async () => {
    const { ctx, rows } = makeCtx({
      preflight: { found: true, pids: [4242] },
      harness: { childPid: 0, isError: false, timedOut: false, text: "ok" },
    });

    await expect(
      record(ctx, {
        area: "operations",
        tool: "list_access_operations",
        args: {},
        options: { expected: "success" },
      }),
    ).rejects.toThrow(/REFUSE-START before list_access_operations/);

    // Preflight emitted exactly one FAIL row; the tool itself never ran,
    // so the rows array has the preflight row only.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tool).toBe("list_access_operations:preflight");
    expect(rows[0]?.pass).toBe(false);
  });
});
