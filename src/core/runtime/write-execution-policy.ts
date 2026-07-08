/**
 * Issue #779 — risk-based write execution policy (v2.1.0).
 *
 * Replaces the blanket `dryRun: true` default for every write-class tool
 * with a per-tool risk classification × a per-project policy mode. The
 * `safe-by-default` mode preserves the current contract; the `developer`
 * mode is opt-in and skips `dryRun:false` ceremony for routine dev-loop
 * tools (import_modules, test_vba, link_tables, etc.).
 *
 * ## Design goals
 *
 * 1. **Single source of truth.** Every consumer (MCP capabilities,
 *    dispatch guard, schema validation) goes through `resolveWriteExecutionPolicy`.
 * 2. **Pure.** No I/O, no Access, no PowerShell. The resolver is a
 *    structural function on (policyMode, risk, inputOverride).
 * 3. **Additive.** The new `risk` field lives alongside — not on top of —
 *    the existing `mutatesBinary` / `mutatesFilesystem` route metadata.
 *    Consumers that never look at `risk` see no behavior change.
 * 4. **Backwards-compatible.** When `writeExecutionPolicy` is absent
 *    (the default for every project without the new capabilities field)
 *    the resolver reports `safe-by-default`. Every write-class tool still
 *    defaults to `dryRun: true`.
 *
 * ## Risk taxonomy (the blueprint from issue #779)
 *
 * - `read-only`            — never mutates state; effectively a no-op
 *                            (`access: "read-only"` route).
 * - `routine-dev-write`    — normal dev loop (import_modules, test_vba,
 *                            link_tables, generate_form, seed_fixture...).
 *                            In `developer` mode these execute by default.
 * - `protected-write`      — always requires explicit apply/dryRun=false
 *                            (fix_encoding, create_table, compact_repair).
 * - `destructive-write`    — permanent removal (delete_module, drop_table,
 *                            export_modules/export_all, teardown_fixture).
 *                            Special case: exports may also need
 *                            `confirmOverwriteSource: true` when the
 *                            destination overlaps the active source root.
 * - `arbitrary-write`      — arbitrary side effects (exec_sql, run_script,
 *                            query_execute write mode, vba_inline_execution).
 * - `process-control`      — can kill a process (cleanup_access_operation
 *                            with force=true, access_force_cleanup_orphaned
 *                            with confirmPid).
 *
 * ## Truth table (effectiveDryRunDefault)
 *
 * `safe-by-default`: every write risk → `true` (current contract).
 *
 * `developer`:        `read-only`            → n/a (read-only)
 *                     `routine-dev-write`    → `false` (executes)
 *                     `protected-write`      → `true`
 *                     `destructive-write`    → `true`
 *                     `arbitrary-write`      → `true`
 *                     `process-control`      → `true`
 */

import {
  buildOverlapCandidates,
  DEFAULT_MANAGED_SOURCE_FOLDERS,
  pathOverlapsSourceRoot,
} from "../utils/path-overlap.js";

/**
 * Policy modes supported by issue #779.
 *
 * `safe-by-default` is the historical contract — every write-class tool
 * defaults to plan mode (`dryRun: true`) and the caller must explicitly
 * opt-in to commit with `dryRun: false` or `apply: true`.
 *
 * `developer` is opt-in via `.dysflow/project.json` `capabilities.writeExecutionPolicy`.
 * Routine dev-loop tools (`routine-dev-write`) skip the dry-run ceremony
 * and commit by default. Destructive / arbitrary / process-control tools
 * stay gated — the operator still has to confirm them explicitly.
 */
export const WRITE_EXECUTION_POLICIES = ["safe-by-default", "developer"] as const;

export type WriteExecutionPolicy = (typeof WRITE_EXECUTION_POLICIES)[number];

/**
 * Risk classification for an MCP tool. Mirrors the blueprint in issue #779
 * and lives in `core/runtime` so the MCP adapter, the dispatch guard,
 * and any future consumers (HTTP server, CLI planner) share one vocabulary.
 *
 * The closed union is intentional: every route `MCP_TOOL_ROUTES` entry must
 * declare exactly one risk (TypeScript enforces it), and an unknown risk is
 * a compile error rather than a silent fall-through.
 */
export const TOOL_RISKS = [
  "read-only",
  "routine-dev-write",
  "protected-write",
  "destructive-write",
  "arbitrary-write",
  "process-control",
] as const;

export type ToolRisk = (typeof TOOL_RISKS)[number];

/**
 * Default dry-run policy per (mode, risk). Encoded as a const object so the
 * keys stay exhaustive against the unions — TypeScript flags any unknown
 * combo at compile time.
 *
 * `read-only` × * is `n/a` (the route has `access: "read-only"` and never
 * writes; we leave it `true` so the snapshot field is uniform).
 */
/**
 * Default dry-run policy per (mode, risk). Encoded as a const object so the
 * keys stay exhaustive against the unions — TypeScript flags any unknown
 * combo at compile time. Exported so consumers (tests, future consumers)
 * can re-derive the rows from the source of truth.
 *
 * `read-only` × * is `n/a` (the route has `access: "read-only"` and never
 * writes; we leave it `true` so the snapshot field is uniform).
 */
export const DEFAULT_DRY_RUN_TABLE: Readonly<
  Record<WriteExecutionPolicy, Record<ToolRisk, boolean>>
> = {
  "safe-by-default": {
    "read-only": true,
    "routine-dev-write": true,
    "protected-write": true,
    "destructive-write": true,
    "arbitrary-write": true,
    "process-control": true,
  },
  developer: {
    "read-only": true,
    "routine-dev-write": false,
    "protected-write": true,
    "destructive-write": true,
    "arbitrary-write": true,
    "process-control": true,
  },
};

/**
 * Structured outcome of resolving a single (policy, risk) pair.
 *
 * - `effectiveDryRunDefault`:
 *     - `true`  — caller must pass `dryRun: false` or `apply: true` to commit.
 *     - `false` — caller can commit without explicit dry-run/apply flags.
 * - `requiresConfirmOverwriteSource`:
 *     - `true` for `destructive-write` tools in `developer` mode ONLY.
 *     - The check fires on top of the existing dry-run/apply gate, so the
 *       caller still must have opted in to commit BEFORE the source-overlap
 *       confirmation is even consulted. In `safe-by-default` mode the gate
 *       never fires (the call is always dry-run by default).
 *
 * Future policies can introduce more structured outcomes here without
 * touching consumers — the resolver is the single source of truth.
 */
export type ResolvedWriteExecution = {
  mode: WriteExecutionPolicy;
  risk: ToolRisk;
  effectiveDryRunDefault: boolean;
  /**
   * `true` for destructive-write tools in `developer` mode only. When the
   * resolver carries this flag, the dispatch guard treats an executed
   * export (`dryRun: false` / `apply: true`) whose destination overlaps
   * the active source root as a request that needs an additional
   * `confirmOverwriteSource: true` confirmation.
   */
  requiresConfirmOverwriteSource: boolean;
};

/**
 * Pure resolver. Stateless, dependency-free. Tests live in
 * `test/core/runtime/write-execution-policy.test.ts` and pin both the
 * default `safe-by-default` behavior and the explicit `developer` flips.
 *
 * No I/O, no fallback to a global config — the consumer passes the
 * policy it resolved from the project's `.dysflow/project.json`
 * `capabilities.writeExecutionPolicy` (or the default `safe-by-default`
 * when the field is absent).
 */
export function resolveWriteExecutionPolicy(input: {
  mode: WriteExecutionPolicy;
  risk: ToolRisk;
}): ResolvedWriteExecution {
  const { mode, risk } = input;
  const effectiveDryRunDefault = DEFAULT_DRY_RUN_TABLE[mode][risk];
  const requiresConfirmOverwriteSource = mode === "developer" && risk === "destructive-write";
  return {
    mode,
    risk,
    effectiveDryRunDefault,
    requiresConfirmOverwriteSource,
  };
}

/**
 * Defensive guard used by `DysflowProjectCapabilities` parsing. Returns
 * `undefined` for unknown / absent values so the caller can decide
 * (the resolution layer defaults to `safe-by-default`).
 */
export function parseWriteExecutionPolicyValue(value: unknown): WriteExecutionPolicy | undefined {
  if (typeof value !== "string") return undefined;
  return WRITE_EXECUTION_POLICIES.find((candidate) => candidate === value);
}

/**
 * Surface helper for the dispatch layer. Returns `true` when the
 * input explicitly opts in to execute (`dryRun === false` or
 * `apply === true`), `false` when the input is in plan mode
 * (`dryRun === true` or both flags absent). Mirrors the behavior of
 * `resolveIsDryRun` in `core/mapping/access-query-request-mapper.ts`
 * so the two gates stay in lockstep.
 *
 * The MCP adapter layer is the right home for the boolean truthiness
 * helper, but the resolver carries the (mode, risk) → execution semantics
 * already. Centralizing it here keeps the dispatch call sites thin.
 */
export function inputOptsIntoExecution(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const record = input as Record<string, unknown>;
  if (record.dryRun === false) return true;
  if (record.apply === true) return true;
  return false;
}

// Re-export the overlap helpers so a single import carries the policy +
// the source-overlap check. The dispatcher wires the union.
export { buildOverlapCandidates, DEFAULT_MANAGED_SOURCE_FOLDERS, pathOverlapsSourceRoot };
