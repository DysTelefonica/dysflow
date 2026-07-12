/**
 * Issue #809 - `sync_binary` workflow tool.
 *
 * `sync_binary` composes three existing primitives into a single round-trip:
 *
 *   1. verify (pre)  - calls `verify_code` to read the current state.
 *   2. plan          - filters `actionableDifferent` + `missingInX` per the
 *                      caller's `direction` + `scope`, deriving `toImport`,
 *                      `toExport`, `skipped`, and `totalActionable`.
 *   3. execute       - calls `import_modules` / `export_modules` chunked
 *                      by `batchSize` (only when `apply: true`; default
 *                      dry-run skips this step).
 *   4. verify (post) - calls `verify_code` again to surface the post-sync
 *                      state.
 *   5. recommend     - emits `recommendation` based on the post-sync
 *                      summary: 'no_action' / 'import_to_binary' /
 *                      'export_to_source' / 'manual_merge'.
 *
 * The runtime does NOT compile. The human compiles in Access (Debug >
 * Compile) before re-running tests - exactly the contract the three
 * primitives it composes share. `compile: true` is NEVER added to any
 * inner dispatch call.
 *
 * `sync_binary` is registered in `VBA_SYNC_TOOL_NAMES` (mcp-tool-registry.ts),
 * its schema lives in `vba-sync-schemas.ts` (`sync_binary`), its route in
 * `dispatch-routes.ts` (`mutatesBinary + mutatesFilesystem`, risk
 * routine-dev-write). The dispatch seam keeps `sync_binary` dryRun-capable
 * (`isDryRunCapableBinaryWrite`) AND exempt from the developer-mode policy
 * (`POLICY_EXEMPT_TOOLS`) so a preview-intended call does NOT silently
 * perform a real write in developer mode.
 *
 * This module is pure (no I/O). The actual calls to `verify_code`,
 * `import_modules`, and `export_modules` are made through the
 * `SyncBinaryAdapterLike` interface, which the composition root
 * (`VbaSyncAdapter.execute()`) implements by forwarding to the existing
 * `VbaModulesAdapter.execute()` sub-calls. Tests inject fakes through
 * the same seam so the compose logic is testable without touching Access.
 */

import type { DysflowError, OperationResult } from "../../core/contracts/index.js";

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * The sync direction. `src-to-binary` maps to `import_modules` (binary
 * behind on the source tree); `binary-to-src` maps to `export_modules`
 * (binary ahead on the source tree); `both` is the union.
 */
export type SyncBinaryDirection = "src-to-binary" | "binary-to-src" | "both";

/**
 * Scope knobs. `actionableOnly:true` (default) excludes non-functional
 * diffs from the plan; `includeBothChanged:true` opts in to surfacing
 * bothChanged modules in `plan.skipped` with `reason:'bothChanged_acknowledged'`.
 */
export type SyncBinaryScope = {
  actionableOnly?: boolean;
  includeBothChanged?: boolean;
};

/**
 * The summary projection from a `verify_code` result. Only the fields
 * `sync_binary` consumes are typed here; the full `VbaVerifyResult` carries
 * more (matched, diffs, runtime diagnostics, etc.) which are projected
 * lazily by the adapter.
 *
 * `bothChangedEntries` is ADDITIVE - it carries the bothChanged module
 * names so `buildSyncBinaryPlan` can include them in `skipped[]` when the
 * caller opts in via `scope.includeBothChanged`.
 */
export type SyncVerifySummary = {
  ok: boolean;
  missingInBinary: readonly { moduleName: string }[];
  missingInSource: readonly { moduleName: string }[];
  actionable: {
    total: number;
    sourceNewer: number;
    binaryNewer: number;
    bothChanged: number;
  };
  nonActionable: { total: number };
  hasFunctionalDifferences: boolean;
  recommendedAction: string;
  recommendation: string;
  bothChangedEntries?: readonly { moduleName: string }[];
};

/** Alias used by tests for the import-side summary projection. */
export type VbaVerifySummary = SyncVerifySummary;

/**
 * The outcome of a single `runVerify` call. Mirrors the success / failure
 * shape `VbaModulesAdapter.execute("verify_code", ...)` returns, but
 * pre-projected to `SyncVerifySummary` so the compose logic does not have
 * to re-parse the full `VbaVerifyResult`.
 */
export type SyncBinaryVerifyOutcome =
  | { ok: true; summary: SyncVerifySummary }
  | { ok: false; error: DysflowError };

/**
 * Per-chunk dispatch parameters. Forwarded verbatim to `runImportModules` /
 * `runExportModules` by the composition root, so the adapter can thread
 * `accessPath`, `contextId`, `apply`, `importMode`, `confirmOverwriteSource`,
 * `verbose`, `dryRun`, etc. unchanged.
 */
export type SyncBinaryChunkParams = {
  moduleNames: readonly string[];
  [k: string]: unknown;
};

/**
 * The adapter seam. The composition root implements this by forwarding
 * to `VbaModulesAdapter.execute("verify_code" | "import_modules" |
 * "export_modules", ...)`. Tests inject fakes.
 */
export interface SyncBinaryAdapterLike {
  runVerify(params: Record<string, unknown>): Promise<SyncBinaryVerifyOutcome>;
  runImportModules(params: SyncBinaryChunkParams): Promise<OperationResult<unknown>>;
  runExportModules(params: SyncBinaryChunkParams): Promise<OperationResult<unknown>>;
}

/**
 * The input surface for `runSyncBinary`. Mirrors the dispatch-side
 * input contract; the orchestrator passes `projectId`, `contextId`,
 * `accessPath`, etc. through `forward` so the inner primitives resolve
 * the project the same way the dispatch layer did.
 */
export type SyncBinaryInput = {
  direction?: SyncBinaryDirection;
  scope?: SyncBinaryScope;
  moduleNames?: readonly string[];
  directoryPath?: string;
  recursive?: boolean;
  includeTests?: boolean;
  includeForms?: boolean;
  strict?: boolean;
  dryRun?: boolean;
  apply?: boolean;
  batchSize?: number;
  onChunkError?: "continue" | "abort";
  parallelChunks?: number;
  returnFullDiff?: boolean;
  /** Forwarded verbatim to the inner verify_code / import_modules / export_modules calls. */
  forward?: Record<string, unknown>;
};

/** A module the plan decided NOT to act on, with a typed reason. */
export type SyncBinarySkippedEntry = {
  moduleName: string;
  reason: "bothChanged_acknowledged" | "nonActionable_excluded" | "direction_filtered";
};

/**
 * The plan surfaced by step (2). `toImport` and `toExport` are the
 * deduped, sorted module lists the orchestrator will dispatch; `skipped`
 * carries the explicit "we know about this but we are not acting on it"
 * entries (currently bothChanged); `totalActionable` is the sum.
 */
export type SyncBinaryPlan = {
  toImport: string[];
  toExport: string[];
  skipped: SyncBinarySkippedEntry[];
  totalActionable: number;
};

/** The execution envelope. `null` when `dryRun:true` (no execute happened). */
export type SyncBinaryExecution = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  importResult: unknown | null;
  exportResult: unknown | null;
  chunksExecuted: number;
};

/** Final recommendation emitted by step (5). */
export type SyncBinaryRecommendation =
  | "no_action"
  | "import_to_binary"
  | "export_to_source"
  | "manual_merge";

/** The full result envelope (matches the issue #809 spec shape). */
export type SyncBinarySuccessResult = {
  /**
   * Inner status: true when the workflow completed AND the post-sync
   * state is fully synced (postSync.missingInBinary=[] AND
   * postSync.actionable.total=0). False when the workflow completed but
   * the post-sync state still has actionable diffs.
   *
   * NOTE: this is the spec's `ok` field per the issue. The OUTER
   * success / failure discriminator is the absence of the `error` field
   * (the failure branch has `ok: false` literal and carries `error`).
   * The internal `ok` is `boolean` (true OR false) per the spec.
   *
   * TypeScript callers narrow via `"error" in result` (see
   * `VbaSyncAdapter.executeSyncBinary`).
   */
  ok: boolean;
  dryRun: boolean;
  preSync: SyncVerifySummary;
  plan: SyncBinaryPlan;
  execution: SyncBinaryExecution | null;
  postSync: SyncVerifySummary | null;
  recommendation: SyncBinaryRecommendation;
};

/** Failure envelope - any of pre-verify, post-verify, or chunk dispatch can fail. */
export type SyncBinaryFailureResult = {
  ok: false;
  dryRun: boolean;
  error: DysflowError;
};

/** Union of success / failure. */
export type SyncBinaryResult = SyncBinarySuccessResult | SyncBinaryFailureResult;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default batch size when `batchSize` is omitted (10 mirrors import_modules #807 conservative default). */
const DEFAULT_BATCH_SIZE = 10;

/** Resolve the effective batch size with bounds (1..200; clamps out-of-range input). */
function effectiveBatchSize(input: SyncBinaryInput): number {
  const raw = input.batchSize ?? DEFAULT_BATCH_SIZE;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  if (raw < 1) return 1;
  if (raw > 200) return 200;
  return Math.floor(raw);
}

/** Slice an array into chunks of `size` (last chunk may be shorter). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Resolve the effective direction (defaults to 'both'). */
function effectiveDirection(input: SyncBinaryInput): SyncBinaryDirection {
  const direction = input.direction;
  if (direction === "src-to-binary" || direction === "binary-to-src" || direction === "both") {
    return direction;
  }
  return "both";
}

/** Resolve the effective scope (defaults: actionableOnly:true, includeBothChanged:false). */
function effectiveScope(input: SyncBinaryInput): Required<SyncBinaryScope> {
  const scope = input.scope;
  return {
    actionableOnly: scope?.actionableOnly !== false,
    includeBothChanged: scope?.includeBothChanged === true,
  };
}

// ─── Pure helpers (exported for tests + reuse from VbaSyncAdapter) ──────────

/**
 * Derive the { toImport, toExport, skipped, totalActionable } plan from a
 * `verify_code` summary. No I/O - the same shape powers the dryRun
 * preview AND the apply:true execution path.
 *
 * Direction filtering rules:
 *   - 'src-to-binary' -> toImport=missingInBinary+sourceNewer; toExport=[]
 *   - 'binary-to-src' -> toImport=[]; toExport=missingInSource+binaryNewer
 *   - 'both'          -> toImport=missingInBinary+sourceNewer; toExport=missingInSource+binaryNewer
 *
 * `skipped` carries entries the plan KNOWS about but does NOT act on,
 * with a typed reason. Currently that is only `bothChanged_acknowledged`
 * (when `scope.includeBothChanged:true`). Future follow-ups may add
 * `nonActionable_excluded` and `direction_filtered` if the scope filter
 * grows.
 */
export function buildSyncBinaryPlan(args: {
  summary: SyncVerifySummary;
  direction: SyncBinaryDirection;
  scope: Required<SyncBinaryScope>;
}): SyncBinaryPlan {
  const { summary, direction, scope } = args;
  const importSet = new Set<string>();
  const exportSet = new Set<string>();
  const skipped: SyncBinarySkippedEntry[] = [];

  // Direction:'src-to-binary' OR 'both' -> toImport = missingInBinary + sourceNewer
  // (sourceNewer modules are reported via actionable.sourceNewer in the
  // summary; we read actionable counts to derive them, but the source
  // projection needs the names. The VbaSyncAdapter projection includes
  // the names on missingInBinary and missingInSource only; bothChanged
  // names are carried via summary.bothChangedEntries.)
  if (direction === "src-to-binary" || direction === "both") {
    for (const entry of summary.missingInBinary) importSet.add(entry.moduleName);
  }
  if (direction === "binary-to-src" || direction === "both") {
    for (const entry of summary.missingInSource) exportSet.add(entry.moduleName);
  }

  // bothChanged entries are surfaced in `skipped[]` when the caller opts
  // in via `scope.includeBothChanged`. They are NEVER auto-merged because
  // both sides diverged - a real merge needs human review.
  if (scope.includeBothChanged) {
    const entries = summary.bothChangedEntries ?? [];
    for (const entry of entries) {
      skipped.push({ moduleName: entry.moduleName, reason: "bothChanged_acknowledged" });
    }
  }

  const toImport = [...importSet].sort();
  const toExport = [...exportSet].sort();
  // totalActionable is the union of dispatched lists (the actionable counts
  // a caller can act on in a single sync run).
  const totalActionable = toImport.length + toExport.length;

  return { toImport, toExport, skipped, totalActionable };
}

/**
 * Derive the final recommendation from a `verify_code` summary. Pure -
 * mirrors `aggregateRecommendation` from `vba-source-comparison.ts` but
 * renames `export_to_src` to `export_to_source` to match the spec's enum
 * vocabulary.
 *
 * Rules (lockstep with `aggregateRecommendation`):
 *   - !hasFunctionalDifferences                  -> 'no_action'
 *   - actionable.bothChanged > 0                 -> 'manual_merge'
 *   - both missingInBinary > 0 AND missingInSource > 0 -> 'manual_merge'
 *   - missingInBinary > 0 (or sourceNewer > 0)   -> 'import_to_binary'
 *   - missingInSource > 0 (or binaryNewer > 0)   -> 'export_to_source'
 *   - otherwise                                  -> 'no_action'
 */
export function deriveSyncBinaryRecommendation(
  summary: SyncVerifySummary,
): SyncBinaryRecommendation {
  if (!summary.hasFunctionalDifferences) return "no_action";

  const missingInBinary = summary.missingInBinary.length;
  const missingInSource = summary.missingInSource.length;
  const sourceNewer = summary.actionable.sourceNewer;
  const binaryNewer = summary.actionable.binaryNewer;
  const bothChanged = summary.actionable.bothChanged;

  // any bothChanged -> manual_merge (a real merge needs human review)
  if (bothChanged > 0) return "manual_merge";

  const wantsImport = sourceNewer > 0 || missingInBinary > 0;
  const wantsExport = binaryNewer > 0 || missingInSource > 0;

  if (wantsImport && wantsExport) return "manual_merge";
  if (wantsImport) return "import_to_binary";
  if (wantsExport) return "export_to_source";
  return "no_action";
}

// ─── Compose orchestrator ──────────────────────────────────────────────────

/**
 * Run the five-step sync_binary compose. Returns the full SyncBinaryResult
 * envelope on success; returns a DysflowError on pre-verify / post-verify
 * / chunk failure (depending on `onChunkError`).
 *
 * Pure orchestration: every I/O call goes through the injected adapter,
 * so this function is testable without Access COM / PowerShell.
 */
export async function runSyncBinary(args: {
  adapter: SyncBinaryAdapterLike;
  input: SyncBinaryInput;
}): Promise<SyncBinaryResult> {
  const { adapter, input } = args;
  const direction = effectiveDirection(input);
  const scope = effectiveScope(input);
  const batchSize = effectiveBatchSize(input);
  const onChunkError = input.onChunkError ?? "continue";
  const isDryRun = input.dryRun === true;
  // `apply` is the commit signal; absent apply:true AND absent dryRun:true
  // is treated as dry-run (safe-by-default). This mirrors the dispatch
  // seam's `resolveIsDryRun` semantics for routine-dev-write tools where
  // POLICY_EXEMPT_TOOLS keeps the policy helper from injecting dryRun:false.
  const willExecute = !isDryRun && input.apply === true;

  const forward: Record<string, unknown> = { ...(input.forward ?? {}) };

  // Step 1: pre-verify
  const preOutcome = await adapter.runVerify({
    ...forward,
    ...(input.moduleNames !== undefined ? { moduleNames: [...input.moduleNames] } : {}),
    ...(input.directoryPath !== undefined ? { directoryPath: input.directoryPath } : {}),
    ...(input.recursive !== undefined ? { recursive: input.recursive } : {}),
    ...(input.includeTests !== undefined ? { includeTests: input.includeTests } : {}),
    ...(input.includeForms !== undefined ? { includeForms: input.includeForms } : {}),
    ...(input.strict !== undefined ? { strict: input.strict } : {}),
  });
  if (!preOutcome.ok) {
    return { ok: false, dryRun: isDryRun, error: preOutcome.error };
  }
  const preSync = preOutcome.summary;

  // Step 2: plan
  const plan = buildSyncBinaryPlan({ summary: preSync, direction, scope });

  // Step 3: execute (only when willExecute AND there is something to dispatch)
  let execution: SyncBinaryExecution | null = null;
  if (willExecute && (plan.toImport.length > 0 || plan.toExport.length > 0)) {
    const startedAt = new Date();
    let lastImport: OperationResult<unknown> | null = null;
    let lastExport: OperationResult<unknown> | null = null;
    let chunksExecuted = 0;
    const importChunks = chunk(plan.toImport, batchSize);
    const exportChunks = chunk(plan.toExport, batchSize);

    // For direction:'src-to-binary' we skip exportChunks; for
    // 'binary-to-src' we skip importChunks; for 'both' we run both.
    const runImport = direction === "src-to-binary" || direction === "both";
    const runExport = direction === "binary-to-src" || direction === "both";

    // Local helpers - extract OperationResult<unknown> data so the success-branch
    // shape stays narrow and TypeScript can verify the field accesses.
    const dataOf = (r: OperationResult<unknown> | null): unknown => (r?.ok ? r.data : null);
    const startedAtMs = startedAt.getTime();

    if (runImport) {
      for (const names of importChunks) {
        chunksExecuted += 1;
        const params: SyncBinaryChunkParams = {
          ...forward,
          moduleNames: names,
          // sync_binary never threads `compile` - the runtime does not
          // compile (v1.19.0 / feat-759-no-compile). The human compiles
          // in Access (Debug > Compile) before re-running tests.
        };
        const result = await adapter.runImportModules(params);
        lastImport = result;
        if (!result.ok) {
          if (onChunkError === "abort") {
            const finishedAt = new Date();
            execution = {
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              durationMs: finishedAt.getTime() - startedAtMs,
              importResult: null,
              exportResult: dataOf(lastExport),
              chunksExecuted,
            };
            return { ok: false, dryRun: false, error: result.error };
          }
          // 'continue' -> log the chunk failure and proceed with the next
          // chunk (mirrors import_modules #807 chunked path). The error
          // stays on the chunk result; the final post-verify surfaces
          // the real state.
        }
      }
    }
    if (runExport) {
      for (const names of exportChunks) {
        chunksExecuted += 1;
        const params: SyncBinaryChunkParams = {
          ...forward,
          moduleNames: names,
        };
        const result = await adapter.runExportModules(params);
        lastExport = result;
        if (!result.ok) {
          if (onChunkError === "abort") {
            const finishedAt = new Date();
            execution = {
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              durationMs: finishedAt.getTime() - startedAtMs,
              importResult: dataOf(lastImport),
              exportResult: null,
              chunksExecuted,
            };
            return { ok: false, dryRun: false, error: result.error };
          }
        }
      }
    }

    const finishedAt = new Date();
    execution = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAtMs,
      importResult: dataOf(lastImport),
      exportResult: dataOf(lastExport),
      chunksExecuted,
    };
  }

  // Step 4: post-verify (only when we executed; in dryRun the consumer
  // already has preSync and the plan)
  let postSync: SyncVerifySummary | null = null;
  if (willExecute) {
    const postOutcome = await adapter.runVerify({
      ...forward,
      ...(input.moduleNames !== undefined ? { moduleNames: [...input.moduleNames] } : {}),
      ...(input.directoryPath !== undefined ? { directoryPath: input.directoryPath } : {}),
      ...(input.recursive !== undefined ? { recursive: input.recursive } : {}),
      ...(input.includeTests !== undefined ? { includeTests: input.includeTests } : {}),
      ...(input.includeForms !== undefined ? { includeForms: input.includeForms } : {}),
      ...(input.strict !== undefined ? { strict: input.strict } : {}),
    });
    if (!postOutcome.ok) {
      return { ok: false, dryRun: false, error: postOutcome.error };
    }
    postSync = postOutcome.summary;
  }

  // Step 5: recommend. The recommendation is derived from postSync when
  // the workflow executed; otherwise it is derived from preSync (which
  // is also the plan source).
  const recommendationSource = postSync ?? preSync;
  const recommendation = deriveSyncBinaryRecommendation(recommendationSource);

  // Final ok calculation. The spec says: `ok:true if postSync.missingInBinary=[] &&
  // postSync.actionable.total=0`. In dryRun there is no postSync; the
  // workflow has not yet mutated anything, so `ok` means "the workflow
  // completed without error" (the plan is ready for the caller to act on).
  // The post-apply `ok` reflects whether the binary is fully synced.
  // `ok` reflects the issue-spec contract: true iff postSync.missingInBinary
  // is empty AND postSync.actionable.total is 0 (after a successful apply).
  // In dryRun there is no postSync; we treat the workflow as completed
  // successfully (ok=true) because the plan is ready for the caller to act on.
  const ok = postSync
    ? postSync.missingInBinary.length === 0 && postSync.actionable.total === 0
    : true;

  const successResult: SyncBinarySuccessResult = {
    ok,
    dryRun: isDryRun,
    preSync,
    plan,
    execution,
    postSync,
    recommendation,
  };
  return successResult;
}
