/**
 * v1.20.0 (issues #763 + #764) — cross-DB table lookup primitive.
 *
 * Given a `tableName` + the project config (with optional `backendPath`
 * and a guaranteed `accessDbPath` for the frontend) + an injected runner
 * port, this module answers: "which configured database contains the
 * table?".
 *
 * The lookup is independent of the `target` semantics — it always tries
 * both databases regardless of what the caller wants. Callers compose
 * with `target` separately: `target: "auto"` means "use the cross-DB
 * lookup to decide"; the lookup itself is the engine. `target: undefined`
 * (the no-target case) ALSO routes through the lookup so ambiguity can
 * be surfaced (issue #764); when the lookup returns a single-DB answer,
 * the runner sets `databasePath` on the resolved request and clears
 * `target`. When the lookup returns ambiguous, the runner forwards the
 * typed `ACCESS_TABLE_AMBIGUOUS` error.
 *
 * Why a dedicated module (not inlined in the runner):
 *   - Keeps `AccessPowerShellRunner.runLockedOperation` from growing
 *     another nested branch.
 *   - Makes the lookup trivially unit-testable without standing up the
 *     PowerShell executor + lock plumbing — the test suite uses a small
 *     fake for the runner port.
 *   - The lookup is the engine; the runner is the seam. Both compose.
 *
 * Why `runProbe` (not `run`):
 *   - Calling `runner.run()` from within `runLockedOperation` would
 *     deadlock on the cross-process file lock (the lock is keyed by
 *     `config.accessDbPath` and the parent call already holds it).
 *   - `runProbe` is a documented seam added on the runner port that
 *     skips the cross-process lock — it MUST only be called from within
 *     an already-locked `run()` invocation. The seam is intentionally
 *     minimal: same `runLockedOperation` body, just without the lock
 *     wrapper. Production code never calls it directly.
 *
 * v1.19.0 contract: this module does NOT compile. The lookup is pure
 * orchestration over a runner port.
 */

import type { DysflowConfig } from "../config/dysflow-config.js";
import type {
  AccessQueryRequest,
  OperationResult,
} from "../contracts/index.js";

/**
 * Semantic role of a configured database. `frontend` is the project's
 * `accessDbPath` (the binary that owns VBA / forms / linked table defs);
 * `backend` is the split data file referenced via `backendPath` in
 * `.dysflow/project.json`.
 */
export type DatabaseRole = "frontend" | "backend";

/**
 * Outcome of `lookupTableAcrossDatabases`.
 *
 * Three branches:
 *   - `ok: true` — the table was found in exactly ONE configured
 *     database. `databaseRole` + `databasePath` + `schema` carry the
 *     resolved answer + the probe result.
 *   - `ok: false, error: "ACCESS_TABLE_NOT_FOUND"` — the table is not in
 *     either configured DB. The caller surfaces this as a typed error
 *     upstream.
 *   - `ok: false, error: "ACCESS_TABLE_AMBIGUOUS"` — the table exists
 *     in BOTH configured databases. `details.roles` + `details.candidates`
 *     carry the conflict for the caller to surface; the caller cannot
 *     proceed without an explicit disambiguation.
 */
export type CrossDbTableResult =
  | {
      ok: true;
      databaseRole: DatabaseRole;
      databasePath: string;
      schema: unknown;
    }
  | {
      ok: false;
      error: "ACCESS_TABLE_NOT_FOUND";
      message: string;
    }
  | {
      ok: false;
      error: "ACCESS_TABLE_AMBIGUOUS";
      message: string;
      details: {
        roles: DatabaseRole[];
        candidates: { role: DatabaseRole; path: string }[];
      };
    };

/**
 * Minimal runner port the lookup depends on. The real `AccessRunner`
 * (`src/core/runner/access-runner.ts`) implements this with the full
 * `runLockedOperation` body; tests substitute a fake. The lookup NEVER
 * calls the public `run` because that would re-enter the cross-process
 * file lock (the parent caller already holds it).
 *
 * `runProbe` MUST NOT acquire the cross-process lock. It runs the
 * resolved query and returns the structured `OperationResult`. The
 * runner's implementation runs the same code path that `run()` does
 * minus the lock acquisition.
 */
export type CrossDbTableProbeExecutor = (
  request: AccessQueryRequest,
) => Promise<OperationResult<unknown>>;

export type CrossDbTableRunner = {
  runProbe: CrossDbTableProbeExecutor;
};

/**
 * Build a probe request for a single database. The probe MUST be a
 * read-only `get_schema` for the given table — that's the cheapest way
 * to test "is the table here?". The `mode: "read"` is a domain
 * invariant (issue #716) and `action: "get_schema"` is the canonical
 * table-existence probe.
 */
function buildProbeRequest(
  databasePath: string,
  tableName: string,
): AccessQueryRequest {
  return {
    action: "get_schema",
    mode: "read",
    sql: "",
    tableName,
    databasePath,
    // The probe MUST NOT carry a `target` field. The auto-mode branch
    // in the runner is keyed on `target === "auto"`; leaving it
    // undefined guarantees the probe recurses through `runLockedOperation`
    // without re-entering the auto-mode resolver.
    target: undefined,
  };
}

function probeOk(
  result: OperationResult<unknown>,
): boolean {
  // The probe succeeds when the runner returned `ok: true`. Defensive:
  // `result.data === undefined` is treated as "not found" — we never
  // want to claim a databaseRole when the runner reports a malformed
  // empty envelope.
  if (!result.ok) return false;
  if (result.data === undefined) return false;
  return true;
}

/**
 * Run the cross-DB table lookup. Returns one of three shapes:
 *
 *   - `{ ok: true, databaseRole, databasePath, schema }` when the table
 *     was found in exactly one configured database.
 *   - `{ ok: false, error: "ACCESS_TABLE_AMBIGUOUS", details }` when the
 *     table exists in BOTH configured databases.
 *   - `{ ok: false, error: "ACCESS_TABLE_NOT_FOUND" }` when the table
 *     is not in either.
 *
 * Strategy:
 *   1. Probe `config.backendPath` (when configured).
 *   2. Probe `config.accessDbPath` (frontend).
 *   3. If both succeeded → return `ACCESS_TABLE_AMBIGUOUS`.
 *   4. If exactly one succeeded → return the single-DB answer (the
 *      caller can disambiguate later via `target: "frontend"|"backend"`).
 *   5. Otherwise → return `ACCESS_TABLE_NOT_FOUND`.
 *
 * Edge cases:
 *   - No `backendPath` configured → step 1 is skipped.
 *   - No `accessDbPath` → step 2 is skipped (cannot happen in practice:
 *     `DysflowConfig.accessDbPath` is required by `loadDysflowConfigWith`).
 *     Defensive: treat as `ACCESS_TABLE_NOT_FOUND`.
 *   - Both undefined → `ACCESS_TABLE_NOT_FOUND`.
 *   - Probe returns `ok: true` with `data === undefined` → treated as
 *     not-found (defensive against malformed envelopes).
 *
 * @param config - the resolved project config (must carry `accessDbPath`;
 *   may carry `backendPath`).
 * @param tableName - the table to look up across databases. Required.
 * @param runner - the runner port (in production: `AccessPowerShellRunner`;
 *   in tests: a small fake). The lookup calls `runner.runProbe` once
 *   per configured database.
 */
export async function lookupTableAcrossDatabases(
  config: DysflowConfig,
  tableName: string,
  runner: CrossDbTableRunner,
): Promise<CrossDbTableResult> {
  if (tableName === undefined || tableName.length === 0) {
    // Defensive: the auto-mode branch in the runner only enters the
    // lookup when the request carries a tableName, but a direct caller
    // could pass undefined. Treat as not-found instead of crashing.
    return {
      ok: false,
      error: "ACCESS_TABLE_NOT_FOUND",
      message: "lookupTableAcrossDatabases requires a non-empty tableName",
    };
  }
  const frontend = config.accessDbPath;
  const backend = config.backendPath;
  if (frontend === undefined || frontend.length === 0) {
    return {
      ok: false,
      error: "ACCESS_TABLE_NOT_FOUND",
      message: "lookupTableAcrossDatabases requires config.accessDbPath to be defined",
    };
  }
  if (backend === undefined) {
    // Only the frontend is configured. Single-DB project.
    const frontendResult = await runner.runProbe(buildProbeRequest(frontend, tableName));
    if (probeOk(frontendResult)) {
      return {
        ok: true,
        databaseRole: "frontend",
        databasePath: frontend,
        schema: frontendResult.data,
      };
    }
    return {
      ok: false,
      error: "ACCESS_TABLE_NOT_FOUND",
      message: `Table '${tableName}' not found in the configured frontend (${frontend}).`,
    };
  }

  // Both DBs are configured. Probe backend first, then frontend.
  const backendResult = await runner.runProbe(buildProbeRequest(backend, tableName));
  const backendHit = probeOk(backendResult);

  const frontendResult = await runner.runProbe(buildProbeRequest(frontend, tableName));
  const frontendHit = probeOk(frontendResult);

  if (backendHit && frontendHit) {
    return {
      ok: false,
      error: "ACCESS_TABLE_AMBIGUOUS",
      message: `Table '${tableName}' exists in BOTH the configured backend (${backend}) and frontend (${frontend}). Pass an explicit target ('frontend' | 'backend') or databasePath to disambiguate.`,
      details: {
        roles: ["backend", "frontend"],
        candidates: [
          { role: "backend", path: backend },
          { role: "frontend", path: frontend },
        ],
      },
    };
  }

  if (backendHit) {
    return {
      ok: true,
      databaseRole: "backend",
      databasePath: backend,
      schema: backendResult.data,
    };
  }
  if (frontendHit) {
    return {
      ok: true,
      databaseRole: "frontend",
      databasePath: frontend,
      schema: frontendResult.data,
    };
  }
  return {
    ok: false,
    error: "ACCESS_TABLE_NOT_FOUND",
    message: `Table '${tableName}' not found in either configured database (backend=${backend}, frontend=${frontend}).`,
  };
}