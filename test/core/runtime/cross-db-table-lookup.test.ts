/**
 * v1.20.0 (issues #763 + #764) — `cross-db-table-lookup` is the
 * cross-DB table lookup primitive that resolves which configured
 * database contains a given table by probing the configured backend
 * first, then the frontend. Returns which one (or both, or neither)
 * had the table.
 *
 * The lookup is independent of `target` semantics — it always tries
 * both databases regardless of what the caller wants. Callers compose
 * with `target` separately: `target: "auto"` means "use the cross-DB
 * lookup to decide"; the lookup itself is the engine.
 *
 * This file is the RED unit-test suite that drives the implementation
 * of `lookupTableAcrossDatabases` in `src/core/runtime/cross-db-table-lookup.ts`.
 * It MUST stay behavior-only: assertions pin the outcome of the
 * primitive (which DB was chosen, what error was raised, what
 * candidates surfaced), not the internal call sequence of the runner.
 *
 * Test discipline (web-tdd-philosophy):
 *  - Fixture gate: each test uses a fresh `mkdtempSync` directory for the
 *    runner's accessPath / backendPath. No shared state.
 *  - DI: the runner's PowerShell executor is replaced with a small fake
 *    that returns success/not-found for whichever `databasePath` was
 *    requested. The fake is per-test so the "which DBs have the table"
 *    matrix is fully controlled.
 *  - Cardinality: each test asserts the call count (e.g., 2 calls for
 *    ambiguous, 1 for single) so the runner is forced to consult both
 *    DBs when needed.
 *  - Three paths per slice: happy + sad + edge.
 *  - No humo: assert exact error codes + message substrings + result
 *    content.
 *  - Refactor-safety: assert on outcome (which DB was chosen, what
 *    error was raised), not on which call paths the implementation
 *    uses internally.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import {
  type CrossDbTableProbeExecutor,
  type CrossDbTableResult,
  lookupTableAcrossDatabases,
} from "../../../src/core/runtime/cross-db-table-lookup";

/**
 * Minimal in-test stub of `AccessRunner` so we can drive the lookup
 * without depending on the real runner + PowerShell executor. The lookup
 * only needs `runProbe` (the cross-DB lookup seam added in PR-2 of
 * v1.20.0); the rest of the runner port is irrelevant.
 */
type FakeRunner = {
  runProbe: CrossDbTableProbeExecutor;
};

let tmpRoot = "";
let frontendPath = "";
let backendPath = "";
let bothDbConfig: DysflowConfig;
let frontendOnlyConfig: DysflowConfig;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "cross-db-lookup-suite-"));
  frontendPath = join(tmpRoot, "frontend.accdb");
  backendPath = join(tmpRoot, "backend.accdb");
  // The lookup doesn't open the .accdb files itself — it only passes
  // them through to the runner port. We create them so the
  // CONFIG_TARGET_NOT_FOUND / existsSync guards that may run upstream
  // (in AccessPowerShellRunner.runLockedOperation) never trip when
  // tests reuse a stub of that guard. The lookup module is independent
  // of this concern — but we keep the files real so the integration
  // story is faithful.
  writeFileSync(frontendPath, "");
  writeFileSync(backendPath, "");
  bothDbConfig = {
    configSource: "explicit-request",
    allowWrites: false,
    accessDbPath: frontendPath,
    backendPath: backendPath,
    timeoutMs: 1_500,
  };
  frontendOnlyConfig = {
    ...bothDbConfig,
    backendPath: undefined,
  };
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

/** Convenience: a runner whose executor reports `hits` per-database. */
function fakeRunnerWith(hits: Partial<Record<"frontend" | "backend", boolean>>): {
  runner: FakeRunner;
  calls: { databasePath: string; table: string }[];
} {
  const calls: { databasePath: string; table: string }[] = [];
  const runProbe: CrossDbTableProbeExecutor = async (request, _config) => {
    calls.push({ databasePath: request.databasePath ?? "", table: request.tableName ?? "" });
    const path = request.databasePath ?? "";
    const hit = path === backendPath ? hits.backend : hits.frontend;
    if (hit === true) {
      // Match the PowerShell runner's `Invoke-GetSchemaAction` shape:
      // `{ "schema": [<columns...>] }` for a found table.
      return {
        ok: true as const,
        data: {
          schema: [
            { name: "id", type: 4, size: null, required: true, allowZeroLength: false },
            { name: "name", type: 10, size: 255, required: false, allowZeroLength: true },
          ],
        },
        diagnostics: [],
        durationMs: 1,
      };
    }
    // Match the PowerShell runner's `get_schema` for a non-existent
    // table: `{ "schema": [] }`. The lookup treats this as "not found".
    return {
      ok: true as const,
      data: { schema: [] },
      diagnostics: [],
      durationMs: 1,
    };
  };
  return { runner: { runProbe }, calls };
}

describe("cross-db-table-lookup (#763 + #764) — happy paths", () => {
  it("returns the backend result when the table exists in backend but not frontend", async () => {
    const { runner, calls } = fakeRunnerWith({ backend: true, frontend: false });
    const result = await lookupTableAcrossDatabases(bothDbConfig, "TbPeople", runner);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.databaseRole).toBe("backend");
    expect(result.databasePath).toBe(backendPath);
    expect(result.schema).toEqual({
      schema: [
        { name: "id", type: 4, size: null, required: true, allowZeroLength: false },
        { name: "name", type: 10, size: 255, required: false, allowZeroLength: true },
      ],
    });
    // Cardinality: both DBs are consulted (we always probe both so the
    // lookup can distinguish "single-DB" from "ambiguous"). The frontend
    // probe comes back negative, so the result is the backend answer.
    expect(calls).toHaveLength(2);
    const queriedPaths = calls.map((c) => c.databasePath).sort();
    expect(queriedPaths).toEqual([backendPath, frontendPath].sort());
  });

  it("returns the frontend result when the table exists in frontend but not backend", async () => {
    const { runner, calls } = fakeRunnerWith({ backend: false, frontend: true });
    const result = await lookupTableAcrossDatabases(bothDbConfig, "TbConfiguracion", runner);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.databaseRole).toBe("frontend");
    expect(result.databasePath).toBe(frontendPath);
    // Cardinality: both DBs are consulted (same as the backend-only case).
    expect(calls).toHaveLength(2);
    const queriedPaths = calls.map((c) => c.databasePath).sort();
    expect(queriedPaths).toEqual([backendPath, frontendPath].sort());
  });
});

describe("cross-db-table-lookup (#764) — sad path: ambiguous table", () => {
  it("returns ACCESS_TABLE_AMBIGUOUS with both candidates when the table exists in both DBs", async () => {
    const { runner, calls } = fakeRunnerWith({ backend: true, frontend: true });
    const result: CrossDbTableResult = await lookupTableAcrossDatabases(
      bothDbConfig,
      "TbShared",
      runner,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error).toBe("ACCESS_TABLE_AMBIGUOUS");
    // Narrow: the union type only has `details` on the AMBIGUOUS branch.
    if (result.error !== "ACCESS_TABLE_AMBIGUOUS") {
      throw new Error("narrowing failed");
    }
    expect(result.details.roles).toEqual(["backend", "frontend"]);
    // Order of roles does not matter to consumers — sort before asserting.
    expect([...result.details.roles].sort()).toEqual(["backend", "frontend"]);
    expect(result.details.candidates).toEqual(
      expect.arrayContaining([
        { role: "backend", path: backendPath },
        { role: "frontend", path: frontendPath },
      ]),
    );
    // Cardinality: both DBs must have been consulted.
    expect(calls).toHaveLength(2);
    const queriedPaths = calls.map((c) => c.databasePath).sort();
    expect(queriedPaths).toEqual([backendPath, frontendPath].sort());
  });
});

describe("cross-db-table-lookup (#763) — edge paths", () => {
  it("returns ACCESS_TABLE_NOT_FOUND when neither DB has the table", async () => {
    const { runner, calls } = fakeRunnerWith({ backend: false, frontend: false });
    const result = await lookupTableAcrossDatabases(bothDbConfig, "TbMissing", runner);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error).toBe("ACCESS_TABLE_NOT_FOUND");
    // Cardinality: both DBs consulted before giving up.
    expect(calls).toHaveLength(2);
  });

  it("skips the backend probe when only the frontend is configured", async () => {
    const { runner, calls } = fakeRunnerWith({ frontend: true });
    const result = await lookupTableAcrossDatabases(frontendOnlyConfig, "TbFrontendOnly", runner);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.databaseRole).toBe("frontend");
    expect(result.databasePath).toBe(frontendPath);
    // Cardinality: only the frontend is consulted when no backend is configured.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ databasePath: frontendPath });
  });

  it("returns ACCESS_TABLE_NOT_FOUND when only the frontend is configured and the table is absent", async () => {
    const { runner, calls } = fakeRunnerWith({ frontend: false });
    const result = await lookupTableAcrossDatabases(frontendOnlyConfig, "TbMissing", runner);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error).toBe("ACCESS_TABLE_NOT_FOUND");
    expect(calls).toHaveLength(1);
  });
});
