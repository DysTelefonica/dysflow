// Chunked execution plumbing for verify_code (#807 Feature 3).
//
// Architecture:
//   - The existing `compareSourceAgainstBinary` is the single-flight entry
//     point that drives preflight -> runner export -> compare -> cleanup.
//     When chunking is enabled, we wrap this same engine in a chunked driver.
//   - A `chunk` is a sub-list of `moduleNames` whose compare is scoped to
//     that sub-list via the existing compare() pipeline. The driver runs
//     chunks with bounded concurrency (`parallelChunks`, default 2) and
//     merges their per-category results.
//   - Hard invariants preserved across the chunks:
//       - `ok: true` is the default (issue #805 round-3: missing modules
//         are NEVER a call-level error — they go to `missingInBinary`).
//       - Each chunk is its own preflight + export + compare + cleanup cycle.
//       - The chunked call STILL opens Access ONCE per chunk (each chunk is
//         its own sub-verify); this is by design. With
//         `parallelChunks === 1` the chunks run sequentially through one
//         Access session, with `parallelChunks > 1` they overlap. Access
//         COM does not reliably support concurrent invocations against the
//         same .accdb so `parallelChunks` is bounded to 1..8.

import type {
  ComparisonFileSystemPort,
  ExportWarning as ExportWarningPlaceholder,
  VbaComparisonContext,
  VbaSemanticSummary,
  VbaSourceComparisonEntry,
  VbaSourceDiffEntry,
  VbaVerifyResult,
} from "./vba-source-comparison.js";

const DEFAULT_CHUNK_SIZE = 25;
const DEFAULT_PARALLELISM = 2;
const MAX_PARALLELISM = 8;

export type ChunkTimeoutBehavior = "retry" | "skip" | "fail";

export type ChunkedVerifyOptions = {
  chunkSize: number;
  parallelChunks: number;
  onChunkTimeout: ChunkTimeoutBehavior;
};

export type ChunkedVerifyChunkFailure = {
  chunkIndex: number;
  moduleNames: readonly string[];
  error: { code: string; message: string };
  retriesAttempted: number;
};

export type ChunkedVerifyResult = VbaVerifyResult & {
  chunkFailures: readonly ChunkedVerifyChunkFailure[];
  chunkTimedOut: readonly string[];
};

export type ChunkedVerifyRunInput = {
  params: Record<string, unknown>;
  ctx: VbaComparisonContext;
  fileSystem: ComparisonFileSystemPort;
  requestedModules: readonly string[];
  options: ChunkedVerifyOptions;
  /**
   * Optional dependency-injection seam for the per-chunk comparison
   * function. When omitted, the chunked driver dynamically imports
   * `compareSourceAgainstBinary` from `./vba-source-comparison.js` —
   * the production path. Tests inject a stub to assert
   * chunked-driver behavior without needing a live .accdb.
   */
  compareChunk?: (
    params: Record<string, unknown>,
    ctx: VbaComparisonContext,
    fileSystem: ComparisonFileSystemPort,
  ) => Promise<
    { ok: true; data: VbaVerifyResult } | { ok: false; error: { code: string; message: string } }
  >;
};

function isTimeoutErrorCode(code: string): boolean {
  return code === "VERIFY_CODE_PHASE_TIMEOUT" || code === "VBA_MANAGER_TIMEOUT";
}

/**
 * Splits `items` into fixed-size chunks, preserving order. Empty chunks
 * are dropped.
 */
export function splitIntoChunks<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (size <= 0) return items.length === 0 ? [] : [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    if (slice.length > 0) out.push(slice);
  }
  return out;
}

/**
 * Resolves the chunking contract from raw call params. Defaults:
 *   - chunkSize: 25
 *   - parallelChunks: 2 (range 1..8 — higher values risk Access COM contention)
 *   - onChunkTimeout: "retry"
 *
 * When none of the chunking params are present, returns `{ disabled: true }`
 * so the caller can short-circuit to the legacy single-flight path
 * (preserving the v2.3.x contract exactly).
 */
export function resolveChunkOptions(params: Record<string, unknown>): {
  disabled: boolean;
  options?: ChunkedVerifyOptions;
} {
  const csRaw = params.chunkSize;
  const pcRaw = params.parallelChunks;
  const otRaw = params.onChunkTimeout;
  const hasAny = csRaw !== undefined || pcRaw !== undefined || otRaw !== undefined;
  if (!hasAny) {
    return { disabled: true };
  }
  const chunkSize = typeof csRaw === "number" && csRaw > 0 ? Math.floor(csRaw) : DEFAULT_CHUNK_SIZE;
  const parallel = typeof pcRaw === "number" && pcRaw > 0 ? Math.floor(pcRaw) : DEFAULT_PARALLELISM;
  const parallelChunks = Math.max(1, Math.min(MAX_PARALLELISM, parallel));
  const onChunkTimeout: ChunkTimeoutBehavior =
    otRaw === "skip" || otRaw === "fail" || otRaw === "retry" ? otRaw : "retry";
  return {
    disabled: false,
    options: { chunkSize, parallelChunks, onChunkTimeout },
  };
}

type ChunkOutcome =
  | {
      kind: "ok";
      chunkIndex: number;
      moduleNames: readonly string[];
      result: VbaVerifyResult;
      retriesAttempted: number;
    }
  | {
      kind: "timed-out-skip";
      chunkIndex: number;
      moduleNames: readonly string[];
      retriesAttempted: number;
    }
  | {
      kind: "failed";
      chunkIndex: number;
      moduleNames: readonly string[];
      error: { code: string; message: string };
      timedOut: boolean;
      retriesAttempted: number;
    };

/**
 * Real chunked driver: runs up to `parallelChunks` sub-verifies
 * concurrently, each routed through `compareSourceAgainstBinary` so every
 * guarantee from the legacy pipeline is inherited.
 */
export async function runChunkedVerify(input: ChunkedVerifyRunInput): Promise<ChunkedVerifyResult> {
  const { requestedModules, params, ctx, fileSystem, options, compareChunk } = input;
  const { chunkSize, parallelChunks, onChunkTimeout } = options;
  const chunks = splitIntoChunks(requestedModules, chunkSize);
  const totalChunks = chunks.length;

  // Resolve the per-chunk compare function. Production callers omit
  // `compareChunk` and get the dynamic import; tests inject a stub.
  const compareFn =
    compareChunk ??
    (async (p: Record<string, unknown>, c: VbaComparisonContext, f: ComparisonFileSystemPort) => {
      const m = await import("./vba-source-comparison.js");
      return m.compareSourceAgainstBinary(p, c, f);
    });

  const singleFlightParams = { ...params };
  delete singleFlightParams.chunkSize;
  delete singleFlightParams.parallelChunks;
  delete singleFlightParams.onChunkTimeout;

  const runOneChunk = async (chunkIndex: number): Promise<ChunkOutcome> => {
    const slice = chunks[chunkIndex];
    if (slice === undefined) {
      return {
        kind: "failed",
        chunkIndex,
        moduleNames: [],
        error: { code: "VERIFY_CODE_CHUNK_INVALID", message: "chunk index out of bounds" },
        timedOut: false,
        retriesAttempted: 0,
      };
    }

    let attempt = 0;
    let lastResult:
      | { ok: true; data: VbaVerifyResult }
      | { ok: false; error: { code: string; message: string } }
      | undefined;
    while (attempt <= 1) {
      attempt += 1;
      const r = await compareFn(
        { ...singleFlightParams, moduleNames: [...slice] },
        ctx,
        fileSystem,
      );
      lastResult = r;
      if (r.ok) break;
      if (isTimeoutErrorCode(r.error.code) && onChunkTimeout === "retry" && attempt === 1) {
        continue;
      }
      break;
    }

    if (lastResult === undefined) {
      return {
        kind: "failed",
        chunkIndex,
        moduleNames: slice,
        error: { code: "VERIFY_CODE_CHUNK_NO_RESULT", message: "Chunk produced no result" },
        timedOut: false,
        retriesAttempted: attempt - 1,
      };
    }

    if (lastResult.ok) {
      return {
        kind: "ok",
        chunkIndex,
        moduleNames: slice,
        result: lastResult.data,
        retriesAttempted: attempt - 1,
      };
    }

    const errorCode = lastResult.error.code;
    const errorMessage = lastResult.error.message;
    const isTimeout = isTimeoutErrorCode(errorCode);

    if (isTimeout && onChunkTimeout === "skip") {
      return {
        kind: "timed-out-skip",
        chunkIndex,
        moduleNames: slice,
        retriesAttempted: attempt - 1,
      };
    }
    if (isTimeout && onChunkTimeout === "fail") {
      return {
        kind: "failed",
        chunkIndex,
        moduleNames: slice,
        error: { code: errorCode, message: errorMessage },
        timedOut: true,
        retriesAttempted: attempt - 1,
      };
    }
    // "continue" with a non-timeout failure: surface as a chunk failure.
    return {
      kind: "failed",
      chunkIndex,
      moduleNames: slice,
      error: { code: errorCode, message: errorMessage },
      timedOut: isTimeout,
      retriesAttempted: attempt - 1,
    };
  };

  // Bounded-concurrency worker pool.
  const outcomes: ChunkOutcome[] = [];
  let cursor = 0;
  let aborted: { code: string; message: string } | null = null;

  async function worker(): Promise<void> {
    while (cursor < totalChunks && aborted === null) {
      const idx = cursor;
      cursor += 1;
      const outcome = await runOneChunk(idx);
      if (outcome.kind === "failed" && onChunkTimeout === "fail") {
        aborted = outcome.error;
      }
      outcomes.push(outcome);
      if (aborted !== null) return;
    }
  }

  const workerCount = Math.max(1, Math.min(parallelChunks, totalChunks));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // If "fail" semantics aborted mid-flight, surface the abort as a
  // single-chunk failure spanning the requested list.
  if (aborted !== null) {
    return {
      operation: "verify_code",
      ok: false,
      dryRun: true,
      willModifyAccess: false,
      sourceRoot: "",
      matched: [],
      different: [],
      missingInSource: [],
      missingInBinary: [],
      vbeCacheNote:
        "verify_code compares on-disk source against the on-disk binary only; it cannot " +
        "see the user's live Access/VBE in-memory cache. If the user still hits " +
        "'method or member not found' errors after this check passes, advise File > Close " +
        "and reopen Access to clear the stale VBE cache.",
      chunkFailures: [
        {
          chunkIndex: -1,
          moduleNames: requestedModules,
          error: aborted,
          retriesAttempted: 0,
        },
      ],
      chunkTimedOut: [],
    };
  }

  // Merge chunk outcomes into a single VbaVerifyResult plus the additive
  // chunkFailures[] and chunkTimedOut[].
  const matched: VbaSourceComparisonEntry[] = [];
  const different: VbaSourceComparisonEntry[] = [];
  const missingInSource: VbaSourceComparisonEntry[] = [];
  const missingInBinary: VbaSourceComparisonEntry[] = [];
  const diffs: VbaSourceDiffEntry[] = [];
  const semanticSummary: Record<string, number> = {};
  const actionableDifferent: VbaSourceComparisonEntry[] = [];
  const nonActionableDifferent: VbaSourceComparisonEntry[] = [];
  const chunkFailures: ChunkedVerifyChunkFailure[] = [];
  const chunkTimedOut: string[] = [];
  const warnings: ExportWarningPlaceholder[] = [];
  let dysflowVersion: string | undefined;
  let classifierRules: string | undefined;
  let runtimeDiagnostics: VbaVerifyResult["runtimeDiagnostics"];
  let sourceRoot = "";

  for (const outcome of outcomes) {
    if (outcome.kind === "ok") {
      const r = outcome.result;
      matched.push(...r.matched);
      different.push(...r.different);
      missingInSource.push(...r.missingInSource);
      missingInBinary.push(...r.missingInBinary);
      if (r.diffs) diffs.push(...r.diffs);
      if (r.summary) {
        for (const [k, v] of Object.entries(r.summary)) {
          if (typeof v === "number") semanticSummary[k] = (semanticSummary[k] ?? 0) + v;
        }
      }
      if (r.actionableDifferent) actionableDifferent.push(...r.actionableDifferent);
      if (r.nonActionableDifferent) nonActionableDifferent.push(...r.nonActionableDifferent);
      if (!sourceRoot && r.sourceRoot) sourceRoot = r.sourceRoot;
      if (!dysflowVersion && r.dysflowVersion) dysflowVersion = r.dysflowVersion;
      if (!classifierRules && r.classifierRules) classifierRules = r.classifierRules;
      if (!runtimeDiagnostics && r.runtimeDiagnostics) runtimeDiagnostics = r.runtimeDiagnostics;
      if (r.warnings) warnings.push(...r.warnings);
    } else if (outcome.kind === "timed-out-skip") {
      chunkTimedOut.push(...outcome.moduleNames);
    } else {
      // failed
      chunkFailures.push({
        chunkIndex: outcome.chunkIndex,
        moduleNames: outcome.moduleNames,
        error: outcome.error,
        retriesAttempted: outcome.retriesAttempted,
      });
    }
  }

  matched.sort(compareComparisonEntries);
  different.sort(compareComparisonEntries);
  missingInSource.sort(compareComparisonEntries);
  missingInBinary.sort(compareComparisonEntries);
  diffs.sort(compareDiffEntries);
  actionableDifferent.sort(compareComparisonEntries);
  nonActionableDifferent.sort(compareComparisonEntries);

  const hasFunctionalDifferences =
    actionableDifferent.length > 0 || missingInSource.length > 0 || missingInBinary.length > 0;

  const merged: ChunkedVerifyResult = {
    operation: "verify_code",
    ok: different.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot,
    matched,
    different,
    missingInSource,
    missingInBinary,
    ...(diffs.length > 0 ? { diffs } : {}),
    ...(Object.keys(semanticSummary).length > 0
      ? { summary: semanticSummary as VbaSemanticSummary }
      : {}),
    actionableDifferent,
    nonActionableDifferent,
    hasFunctionalDifferences,
    actionableOk: !hasFunctionalDifferences,
    recommendation: hasFunctionalDifferences
      ? "Some chunks produced actionable differences; inspect chunkFailures and chunkTimedOut."
      : "All chunks agree; no sync needed.",
    recommendedAction: hasFunctionalDifferences ? "manual_merge" : "no_action",
    vbeCacheNote:
      "verify_code compares on-disk source against the on-disk binary only; it cannot " +
      "see the user's live Access/VBE in-memory cache. If the user still hits " +
      "'method or member not found' errors after this check passes, advise File > Close " +
      "and reopen Access to clear the stale VBE cache.",
    ...(dysflowVersion ? { dysflowVersion } : {}),
    ...(classifierRules ? { classifierRules } : {}),
    ...(runtimeDiagnostics ? { runtimeDiagnostics } : {}),
    warnings,
    chunkFailures,
    chunkTimedOut,
  };
  return merged;
}

function compareComparisonEntries(
  a: VbaSourceComparisonEntry,
  b: VbaSourceComparisonEntry,
): number {
  return `${a.moduleName.toLowerCase()}\0${a.fileType}`.localeCompare(
    `${b.moduleName.toLowerCase()}\0${b.fileType}`,
  );
}

function compareDiffEntries(a: VbaSourceDiffEntry, b: VbaSourceDiffEntry): number {
  return `${a.moduleName.toLowerCase()}\0${a.fileType}`.localeCompare(
    `${b.moduleName.toLowerCase()}\0${b.fileType}`,
  );
}
