import { extname, parse, relative, resolve } from "node:path";
import {
  createDysflowError,
  type Diagnostic,
  type DysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  type AccessOperationPreflightCleanupResult,
  diagnosticsFromPreflightCleanup,
  reapOrphanedAccessOnTimeout,
} from "../operations/access-operation-preflight.js";
import { extractResultPayload } from "../runner/ps-result-channel.js";
import { isRecord, sanitizeSecrets, truthy } from "../utils/index.js";
import { buildRuntimeDiagnostics, type RuntimeDiagnostics } from "../utils/runtime-info.js";
import {
  classifyVbaPair,
  SEMANTIC_CLASSIFIER_RULES,
  type VbaComparisonMode,
  type VbaRecommendation,
  type VbaSemanticCategory,
} from "./vba-semantic-classifier.js";
import { compareForms } from "./form-ir-compare-service.js";
import { parseFormTxt } from "./form-ir-service.js";

/** Runtime package version, resolved once. Surfaced in verify/reconcile results. */
// DYSFLOW_VERSION is now embedded in RuntimeDiagnostics via buildRuntimeDiagnostics()
// and resolved to the real package version at build time.

export type VbaSourceComparisonFile = {
  moduleName: string;
  fileType: string;
  path: string;
  relativePath: string;
};

export type VbaSourceComparisonEntry = {
  moduleName: string;
  fileType: string;
  sourcePath?: string;
  binaryPath?: string;
  // Additive semantic fields (populated in semantic mode for entries that land
  // in `actionableDifferent` or `nonActionableDifferent`). Strict-mode and
  // missing-* entries leave these undefined.
  classification?: VbaSemanticCategory;
  reason?: string;
  category?: "control-property-mismatch";
  controlName?: string;
  propertyName?: string;
  sourceValue?: string;
  binaryValue?: string;
};

export type VbaSourceDiffEntry = VbaSourceComparisonEntry & {
  sourceSnippet: string;
  binarySnippet: string;
  // Additive semantic fields (present in semantic mode)
  classification?: VbaSemanticCategory;
  reason?: string;
  srcUniqueFunctionalLines?: number;
  binaryUniqueFunctionalLines?: number;
  recommendation?: string;
  /** Whether this difference requires a sync action (true) or is noise (false). */
  isActionable?: boolean;
  /** Human-facing action key, mirrors recommendation (e.g. "no_action", "import_to_binary"). */
  recommendedAction?: string;
};

/** Per-category count map present in semantic mode results. */
export type VbaSemanticSummary = Partial<Record<VbaSemanticCategory, number>>;

/**
 * Nested companion to the flat {@link VbaSemanticSummary} produced by
 * `verify_code` in semantic mode. Round 5 (PR5) ships this as an ADDITIVE
 * consumer-ready summary so callers do not have to re-parse the flat
 * `summary` map to know "how many to import" / "how many caseOnly vs
 * whitespaceOnly?". Every `total` is the sum of its named buckets and
 * `different` is the count of semantic-mode diffs (i.e. `diffs.length`,
 * not including `missingInSource` / `missingInBinary`).
 */
export type SummaryStructured = {
  matched: number;
  different: number;
  missingInSource: number;
  missingInBinary: number;
  actionable: {
    sourceNewer: number;
    binaryNewer: number;
    bothChanged: number;
    total: number;
  };
  nonActionable: {
    caseOnly: number;
    whitespaceOnly: number;
    attributeOnly: number;
    formSerializationOnly: number;
    encodingOnly: number;
    total: number;
  };
};

/** Warning produced when a module fails to export (e.g. form open in design view). */
export type ExportWarning = {
  module: string;
  error: string;
  message: string;
};

export type VbaVerifyResult = {
  operation: "verify_code";
  ok: boolean;
  dryRun: true;
  willModifyAccess: false;
  sourceRoot: string;
  matched: readonly VbaSourceComparisonEntry[];
  different: readonly VbaSourceComparisonEntry[];
  missingInSource: readonly VbaSourceComparisonEntry[];
  missingInBinary: readonly VbaSourceComparisonEntry[];
  diffs?: readonly VbaSourceDiffEntry[];
  // Additive semantic fields (present in semantic mode, absent in strict mode)
  summary?: VbaSemanticSummary;
  actionableDifferent?: readonly VbaSourceComparisonEntry[];
  nonActionableDifferent?: readonly VbaSourceComparisonEntry[];
  hasFunctionalDifferences?: boolean;
  actionableOk?: boolean;
  /** Aggregated human-facing recommendation for the whole comparison (semantic mode). */
  recommendation?: string;
  /** Machine key for the aggregated recommendation (semantic mode). */
  recommendedAction?: VbaRecommendation;
  /**
   * Nested companion to {@link summary} (semantic mode only). Same vocabulary
   * as the flat summary but shaped for direct consumption: top-level counts
   * plus `actionable.{sourceNewer,binaryNewer,bothChanged,total}` and
   * `nonActionable.{caseOnly,whitespaceOnly,attributeOnly,formSerializationOnly,encodingOnly,total}`.
   * `total`s are sum-of-named-buckets; `different` is the count of semantic
   * diffs (NOT including `missingIn*`). Strict mode leaves this undefined.
   */
  summaryStructured?: SummaryStructured;
  /**
   * Pre-computed list of module names that the source has and the binary is
   * missing or behind on, sorted lexicographically and deduped. Drop-in for
   * `import_modules({ moduleNames: bulkImportable })`. `bothChanged` modules
   * are excluded — those still need human review. Semantic mode only.
   */
  bulkImportable?: readonly string[];
  /** Length of {@link bulkImportable}. Equal to `bulkImportable.length`. */
  bulkImportableCount?: number;
  /**
   * Pre-computed list of module names that the binary has and the source is
   * missing or behind on, sorted lexicographically and deduped. Drop-in for
   * `export_modules({ moduleNames: bulkExportable })`. `bothChanged` modules
   * are excluded. Semantic mode only.
   */
  bulkExportable?: readonly string[];
  /** Length of {@link bulkExportable}. Equal to `bulkExportable.length`. */
  bulkExportableCount?: number;
  /**
   * Always-present caveat. verify_code compares on-disk source against the
   * on-disk binary only; it cannot observe the user's live Access/VBE in-memory
   * cache, which may hold a stale compiled image even when disk content matches.
   * A consumer that gets a clean result but the user still reports errors should
   * advise closing and reopening Access.
   */
  vbeCacheNote: string;
  /** Runtime package version that produced this result (e.g. "1.2.53"). */
  dysflowVersion?: string;
  /** Fingerprint of the active semantic-classification rule set. */
  classifierRules?: string;
  /**
   * Ambient runtime diagnostics — which Dysflow binary is running, through which
   * interface (CLI / MCP stdio / shared-core), and when it was built.
   */
  runtimeDiagnostics?: RuntimeDiagnostics;
  /**
   * Warnings from the export phase of verify_code. Present when one or more
   * modules failed to export (e.g. a form open in design view). The comparison
   * is still run on the modules that were successfully exported, but a consumer
   * should treat a non-empty warnings array as evidence that the result may be
   * incomplete and should not be assumed clean.
   */
  warnings?: readonly ExportWarning[];
};

export type VbaExecutionTarget = {
  accessPath?: string;
  destinationRoot: string;
  projectRoot?: string;
  timeoutMs?: number;
};

export type VbaExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  moduleNamesProvided?: boolean;
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
};

export type VbaExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type VbaComparisonContext = {
  scriptPath: string;
  accessPassword?: string;
  resolveExecutionTarget(
    params: Record<string, unknown>,
  ): Promise<OperationResult<VbaExecutionTarget>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: VbaExecutionTarget,
  ): OperationResult<undefined>;
  runPreflightCleanup(target: VbaExecutionTarget): Promise<AccessOperationPreflightCleanupResult>;
  runVbaManager(request: VbaExecutionRequest): Promise<VbaExecutionResult>;
};

export interface ComparisonFileSystemEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface ComparisonFileSystemPort {
  mkdtemp(prefix: string): Promise<string>;
  readdir(path: string): Promise<readonly ComparisonFileSystemEntry[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  /** Optional. When present, enables reliable encodingOnly detection via raw bytes. */
  readFileBytes?(path: string): Promise<Uint8Array>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  tmpdir(): string;
  /** Optional. When present, lets callers check path existence without throwing. */
  exists?(path: string): Promise<boolean>;
}

export async function compareSourceAgainstBinary(
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
  fileSystem: ComparisonFileSystemPort,
): Promise<OperationResult<VbaVerifyResult>> {
  const target = await ctx.resolveExecutionTarget(params);
  if (!target.ok) return target;
  const strict = ctx.validateStrictContext(params, target.data);
  if (!strict.ok) return strict;

  // Issue #807 (Feature 3) — internal chunking + parallel chunks. When
  // the chunking contract is absent (legacy default), the call falls
  // through to the single-flight path that has shipped since v2.3.x.
  // When any of `chunkSize` / `parallelChunks` / `onChunkTimeout` are
  // set, the chunked driver takes over and merges per-chunk results
  // back into the same shape. The legacy invariants are preserved:
  // missing modules stay in `missingInBinary` (issue #805 round-3),
  // `ok: true` is the default, and a single chunk timeout never
  // aborts the call unless `onChunkTimeout === "fail"`.
  const chunked = resolveChunkOptions(params);
  if (!chunked.disabled && target.data.destinationRoot !== undefined) {
    const requestedModules = stringArray(params.moduleNames);
    if (requestedModules.length > 0) {
      const chunkRun = await runChunkedVerify({
        params,
        ctx,
        fileSystem,
        requestedModules,
        options: chunked.options as ChunkedVerifyOptions,
      });
      return successResult(chunkRun);
    }
  }

  const password = ctx.accessPassword;
  const effectiveTimeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : (target.data.timeoutMs ?? 30000);
  const requestedModules = stringArray(params.moduleNames);
  if (Array.isArray(params.moduleNames) && requestedModules.length === 0) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "verify_code moduleNames was provided as an empty list. Omit moduleNames for a whole-project verify, or pass at least one module name for a focused verify.",
      ),
    );
  }

  const sourceRoot = target.data.destinationRoot;
  const tempExportRoot = await fileSystem.mkdtemp(
    resolve(fileSystem.tmpdir(), "dysflow-vba-verify-"),
  );
  const deadlineMs = Date.now() + effectiveTimeoutMs;
  let pendingResult: OperationResult<VbaVerifyResult> | undefined;
  let cleanupTempExportRoot = true;
  const finalize = (result: OperationResult<VbaVerifyResult>): OperationResult<VbaVerifyResult> => {
    pendingResult = result;
    return result;
  };
  try {
    const preflightTimeoutMs = phaseTimeoutBeforeDeadline(deadlineMs);
    const preflightCleanup = await withPhaseTimeout(
      ctx.runPreflightCleanup(target.data),
      preflightTimeoutMs,
      createVerifyCodePhaseTimeoutError({
        phase: "preflight",
        moduleNames: requestedModules,
        operationTimeoutMs: effectiveTimeoutMs,
        phaseTimeoutMs: preflightTimeoutMs,
      }),
    );
    if (!preflightCleanup.ok) {
      return finalize(failureResult(preflightCleanup.error, { durationMs: preflightTimeoutMs }));
    }
    const preflightDiagnostics = diagnosticsFromPreflightCleanup(preflightCleanup.data);
    const exportTimeoutMs = phaseTimeoutBeforeDeadline(deadlineMs);
    const request = {
      scriptPath: ctx.scriptPath,
      action: "Export",
      accessPath: target.data.accessPath,
      destinationRoot: tempExportRoot,
      moduleNames: requestedModules,
      moduleNamesProvided: requestedModules.length > 0,
      password,
      json: true,
      extra: {},
      timeoutMs: exportTimeoutMs,
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };

    const result = await ctx.runVbaManager(request);
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.timedOut) {
      const timeoutError = createDysflowError(
        "VBA_MANAGER_TIMEOUT",
        `verify_code export phase timed out after ${result.durationMs}ms for ${formatRequestedModules(requestedModules)}.`,
        {
          retryable: true,
          details: phaseTimeoutDetails({
            phase: "export",
            moduleNames: requestedModules,
            operationTimeoutMs: effectiveTimeoutMs,
            phaseTimeoutMs: exportTimeoutMs,
            durationMs: result.durationMs,
          }),
        },
      );
      const cleanupTimeoutMs = cleanupTimeoutBeforeDeadline(deadlineMs);
      // The export timed out: the PowerShell process is killed, but the Access COM
      // process it spawned is a separate process that survives as an orphan. Reap
      // it immediately by re-running the path/lock cleanup so a timeout never
      // leaks an Access process (orphans would otherwise linger until the next op).
      const timeoutCleanup = await withPhaseTimeout(
        reapOrphanedAccessOnTimeout(() => ctx.runPreflightCleanup(target.data)),
        cleanupTimeoutMs,
        createVerifyCodePhaseTimeoutError({
          phase: "cleanup",
          moduleNames: requestedModules,
          operationTimeoutMs: effectiveTimeoutMs,
          phaseTimeoutMs: cleanupTimeoutMs,
        }),
      );
      const timeoutCleanupDiagnostics = timeoutCleanup.ok
        ? timeoutCleanup.data
        : markCleanupTimedOut(timeoutError, cleanupTimeoutMs);
      return finalize(
        failureResult(timeoutError, {
          diagnostics: [...preflightDiagnostics, ...timeoutCleanupDiagnostics],
          durationMs: result.durationMs,
        }),
      );
    }
    if (result.exitCode !== 0) {
      return finalize(
        failureResult(
          createDysflowError(
            "VBA_MANAGER_FAILED",
            `verify export failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`,
          ),
          { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
        ),
      );
    }

    // Parse export stdout to extract warnings (issue #690). verify_code asks the
    // export action for JSON so per-module export failures are returned as
    // warnings instead of throwing away the rest of the comparison evidence.
    let exportWarnings: readonly ExportWarning[] = [];
    try {
      const parsed = extractResultPayload(result.stdout, secrets);
      if (isRecord(parsed) && parsed.ok === false) {
        const error = isRecord(parsed.error) ? parsed.error : {};
        const code = typeof error.code === "string" ? error.code : "EXPORT_RESULT_FAILED";
        const message =
          typeof error.message === "string"
            ? sanitizeSecrets(error.message, secrets)
            : "verify export returned a structured failure payload; export warning state is unknown.";
        exportWarnings = [
          {
            module: "__export__",
            error: code,
            message,
          },
        ];
      } else if (isRecord(parsed) && Array.isArray(parsed.warnings)) {
        exportWarnings = parsed.warnings;
      }
    } catch {
      exportWarnings = [
        {
          module: "__export__",
          error: "EXPORT_WARNING_PARSE_FAILED",
          message:
            "verify export succeeded, but its structured result payload could not be parsed; export warning state is unknown.",
        },
      ];
    }

    const comparisonMode: VbaComparisonMode = truthy(params.strict) ? "strict" : "semantic";
    const compareTimeoutMs = phaseTimeoutBeforeDeadline(deadlineMs);
    const comparison = await withPhaseTimeout(
      compareVbaSourceTrees(
        sourceRoot,
        tempExportRoot,
        requestedModules,
        truthy(params.diff),
        fileSystem,
        comparisonMode,
      ),
      compareTimeoutMs,
      createVerifyCodePhaseTimeoutError({
        phase: "compare",
        moduleNames: requestedModules,
        operationTimeoutMs: effectiveTimeoutMs,
        phaseTimeoutMs: compareTimeoutMs,
      }),
    );
    if (!comparison.ok) {
      cleanupTempExportRoot = false;
      return finalize(
        failureResult(comparison.error, {
          diagnostics: [
            ...preflightDiagnostics,
            {
              level: "warning",
              source: "verify_code:cleanup",
              message:
                "Skipped temporary export directory cleanup after compare timeout because the uncancelled comparison may still be reading from it.",
            },
          ],
          durationMs: result.durationMs + compareTimeoutMs,
        }),
      );
    }
    if (requestedModules.length > 0) {
      const found =
        comparison.data.matched.length +
        comparison.data.different.length +
        comparison.data.missingInSource.length +
        comparison.data.missingInBinary.length;
      if (found === 0) {
        return finalize(
          failureResult(
            createDysflowError(
              "MODULE_NOT_FOUND",
              `No requested module was found in source or binary export: ${requestedModules.join(", ")}.`,
            ),
            { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
          ),
        );
      }
    }
    return finalize(
      successResult(
        { operation: "verify_code", ...comparison.data, warnings: exportWarnings },
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      ),
    );
  } finally {
    if (cleanupTempExportRoot) {
      const cleanupDiagnostics = await cleanupTempExportRootBounded(
        () => fileSystem.rm(tempExportRoot, { recursive: true, force: true }),
        cleanupTimeoutBeforeDeadline(deadlineMs),
      );
      pendingResult?.diagnostics.push(...cleanupDiagnostics);
    }
  }
}

import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
import {
  type ChunkedVerifyOptions,
  resolveChunkOptions,
  runChunkedVerify,
} from "./vba-source-comparison-chunking.js";

/**
 * Always-present advisory on every verify_code result. verify_code is a
 * disk-vs-disk comparison and is blind to the user's live Access/VBE in-memory
 * cache, so a clean result does not rule out stale-cache errors in an open
 * session. See issue #559.
 */
export const VBE_CACHE_NOTE =
  "verify_code compares on-disk source against the on-disk binary only; it cannot " +
  "see the user's live Access/VBE in-memory cache. If the user still hits " +
  "'method or member not found' errors after this check passes, advise File > Close " +
  "and reopen Access to clear the stale VBE cache.";

const VERIFY_CODE_TIMEOUT_RESERVE_MIN_MS = 100;
const VERIFY_CODE_TIMEOUT_RESERVE_MAX_MS = 1000;
const VERIFY_CODE_TIMEOUT_RESERVE_RATIO = 0.1;
const VERIFY_CODE_CLEANUP_TIMEOUT_MAX_MS = 100;

type VerifyCodePhase = "preflight" | "export" | "compare" | "cleanup";

function phaseTimeoutBeforeOperationDeadline(operationTimeoutMs: number): number {
  const reserveMs = Math.min(
    VERIFY_CODE_TIMEOUT_RESERVE_MAX_MS,
    Math.max(
      VERIFY_CODE_TIMEOUT_RESERVE_MIN_MS,
      Math.floor(operationTimeoutMs * VERIFY_CODE_TIMEOUT_RESERVE_RATIO),
    ),
  );
  return Math.max(1, operationTimeoutMs - reserveMs);
}

function phaseTimeoutBeforeDeadline(deadlineMs: number): number {
  return phaseTimeoutBeforeOperationDeadline(Math.max(1, deadlineMs - Date.now()));
}

function cleanupTimeoutBeforeDeadline(deadlineMs: number): number {
  return Math.min(VERIFY_CODE_CLEANUP_TIMEOUT_MAX_MS, Math.max(1, deadlineMs - Date.now()));
}

function createVerifyCodePhaseTimeoutError(input: {
  phase: VerifyCodePhase;
  moduleNames: readonly string[];
  operationTimeoutMs: number;
  phaseTimeoutMs: number;
  durationMs?: number;
}): DysflowError {
  return createDysflowError(
    "VERIFY_CODE_PHASE_TIMEOUT",
    `verify_code ${input.phase} phase timed out after ${input.phaseTimeoutMs}ms for ${formatRequestedModules(input.moduleNames)}.`,
    {
      retryable: true,
      details: phaseTimeoutDetails(input),
    },
  );
}

function phaseTimeoutDetails(input: {
  phase: VerifyCodePhase;
  moduleNames: readonly string[];
  operationTimeoutMs: number;
  phaseTimeoutMs: number;
  durationMs?: number;
}): Record<string, unknown> {
  return {
    tool: "verify_code",
    phase: input.phase,
    moduleName: input.moduleNames.length === 1 ? input.moduleNames[0] : null,
    moduleNames: [...input.moduleNames],
    operationTimeoutMs: input.operationTimeoutMs,
    phaseTimeoutMs: input.phaseTimeoutMs,
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
  };
}

function formatRequestedModules(moduleNames: readonly string[]): string {
  if (moduleNames.length === 0) return "the whole project";
  if (moduleNames.length === 1) return `module '${moduleNames[0]}'`;
  return `modules ${moduleNames.map((name) => `'${name}'`).join(", ")}`;
}

function markCleanupTimedOut(error: DysflowError, cleanupTimeoutMs: number): Diagnostic[] {
  error.details = {
    ...(error.details ?? {}),
    cleanupTimedOut: true,
    cleanupTimeoutMs,
  };
  return [
    {
      level: "warning",
      source: "verify_code:cleanup",
      message: `Post-timeout Access orphan cleanup did not finish within ${cleanupTimeoutMs}ms; returning the typed verify_code timeout without waiting for cleanup to complete.`,
    },
  ];
}

async function cleanupTempExportRootBounded(
  cleanup: () => Promise<void>,
  cleanupTimeoutMs: number,
): Promise<Diagnostic[]> {
  try {
    const result = await withPhaseTimeout(
      cleanup(),
      cleanupTimeoutMs,
      createDysflowError(
        "VERIFY_CODE_CLEANUP_TIMEOUT",
        `verify_code temporary export directory cleanup timed out after ${cleanupTimeoutMs}ms.`,
        { retryable: true },
      ),
    );
    if (result.ok) return [];
    return [
      {
        level: "warning",
        source: "verify_code:cleanup",
        message:
          "verify_code temporary export directory cleanup timed out; returning without waiting for filesystem cleanup to complete.",
      },
    ];
  } catch (error) {
    return [
      {
        level: "warning",
        source: "verify_code:cleanup",
        message: `verify_code temporary export directory cleanup failed: ${String(error)}`,
      },
    ];
  }
}

async function withPhaseTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  error: DysflowError,
): Promise<{ ok: true; data: T } | { ok: false; error: DysflowError }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; error: DysflowError }>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ ok: false, error }), timeoutMs);
  });
  try {
    return await Promise.race([promise.then((data) => ({ ok: true as const, data })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function controlPropertyMismatchFields(
  sourceText: string,
  binaryText: string,
  moduleName: string,
): Pick<
  VbaSourceComparisonEntry,
  "category" | "controlName" | "propertyName" | "sourceValue" | "binaryValue"
> {
  try {
    const report = compareForms({
      left: parseFormTxt(sourceText, { name: moduleName }),
      right: parseFormTxt(binaryText, { name: moduleName }),
      leftName: moduleName,
      rightName: moduleName,
    });
    const mismatch = report.drifts.find(
      (drift) => drift.kind === "propertyChanged" && drift.actionable,
    );
    if (mismatch?.kind !== "propertyChanged" || mismatch.controlName === undefined || mismatch.key === undefined) {
      return {};
    }
    return {
      category: "control-property-mismatch",
      controlName: mismatch.controlName,
      propertyName: mismatch.key,
      sourceValue: mismatch.oldValue,
      binaryValue: mismatch.newValue,
    };
  } catch {
    return {};
  }
}

export async function compareVbaSourceTrees(
  sourceRoot: string,
  binaryExportRoot: string,
  moduleNames: readonly string[],
  includeDiffs: boolean,
  fileSystem: ComparisonFileSystemPort,
  mode: VbaComparisonMode = "semantic",
): Promise<Omit<VbaVerifyResult, "operation">> {
  const moduleFilter = new Set(moduleNames.map((name) => name.toLowerCase()));
  const sourceFiles = await collectVbaSourceFiles(sourceRoot, moduleFilter, fileSystem);
  const binaryFiles = await collectVbaSourceFiles(binaryExportRoot, moduleFilter, fileSystem);
  const sourceByKey = new Map(sourceFiles.map((file) => [comparisonKey(file), file]));
  const binaryByKey = new Map(binaryFiles.map((file) => [comparisonKey(file), file]));
  const matched: VbaSourceComparisonEntry[] = [];
  const different: VbaSourceComparisonEntry[] = [];
  const missingInSource: VbaSourceComparisonEntry[] = [];
  const missingInBinary: VbaSourceComparisonEntry[] = [];
  const diffs: VbaSourceDiffEntry[] = [];

  // Semantic mode accumulators
  const actionableDifferent: VbaSourceComparisonEntry[] = [];
  const nonActionableDifferent: VbaSourceComparisonEntry[] = [];
  const semanticSummary: Record<string, number> = {};

  for (const [key, binaryFile] of binaryByKey) {
    const sourceFile = sourceByKey.get(key);
    if (sourceFile === undefined) {
      missingInSource.push(toComparisonEntry(undefined, binaryFile));
      continue;
    }

    const [sourceText, binaryText] = await Promise.all([
      fileSystem.readFile(sourceFile.path, "utf8"),
      fileSystem.readFile(binaryFile.path, "utf8"),
    ]);
    const entry = toComparisonEntry(sourceFile, binaryFile);

    // --- Strict mode: byte-exact comparison (backward-compat behavior) ---
    if (mode === "strict") {
      if (sourceText === binaryText) {
        matched.push(entry);
      } else {
        different.push(entry);
        if (includeDiffs) {
          diffs.push({
            ...entry,
            sourceSnippet: firstDifferentLineSnippet(sourceText, binaryText, "source"),
            binarySnippet: firstDifferentLineSnippet(binaryText, sourceText, "binary"),
          });
        }
      }
      continue;
    }

    // --- Semantic mode: classify each differing pair ---
    // Fast path: raw equality (no need to classify)
    if (sourceText === binaryText) {
      matched.push(entry);
      continue;
    }

    // Read raw bytes if available (enables reliable encodingOnly detection)
    const [sourceBytes, binaryBytes] = fileSystem.readFileBytes
      ? await Promise.all([
          fileSystem.readFileBytes(sourceFile.path),
          fileSystem.readFileBytes(binaryFile.path),
        ])
      : [undefined, undefined];

    const classification = classifyVbaPair({
      sourceText,
      binaryText,
      sourceBytes,
      binaryBytes,
      fileType: sourceFile.fileType,
      mode: "semantic",
    });

    // If classifier resolves to "matched" (e.g. normalization equalized), treat as matched
    if (classification.classification === "matched") {
      matched.push(entry);
      continue;
    }

    // Add to different[] for backward compat
    const controlPropertyFields =
      sourceFile.fileType === "form.txt" || sourceFile.fileType === "report.txt"
        ? controlPropertyMismatchFields(sourceText, binaryText, sourceFile.moduleName)
        : {};
    different.push({ ...entry, ...controlPropertyFields });

    // Accumulate semantic summary
    const cat = classification.classification;
    semanticSummary[cat] = (semanticSummary[cat] ?? 0) + 1;

    // Bucket into actionable / nonActionable. Attach the classifier's
    // classification + reason to the entry so consumers can read the same
    // vocabulary from `nonActionableDifferent[*]` that they already read
    // from `diffs[*]` (round 5 / PR5 additive ergonomics).
    const entryWithClassification: VbaSourceComparisonEntry = {
      ...entry,
      ...controlPropertyFields,
      classification: classification.classification,
      reason:
        controlPropertyFields.category === "control-property-mismatch"
          ? `${classification.reason}; control "${controlPropertyFields.controlName}" property "${controlPropertyFields.propertyName}" differs`
          : classification.reason,
    };
    if (classification.actionable) {
      actionableDifferent.push(entryWithClassification);
    } else {
      nonActionableDifferent.push(entryWithClassification);
    }

    if (includeDiffs) {
      diffs.push({
        ...entry,
        ...controlPropertyFields,
        sourceSnippet: firstDifferentLineSnippet(sourceText, binaryText, "source"),
        binarySnippet: firstDifferentLineSnippet(binaryText, sourceText, "binary"),
        // Additive semantic fields
        classification: classification.classification,
        reason: classification.reason,
        srcUniqueFunctionalLines: classification.srcUniqueFunctionalLines,
        binaryUniqueFunctionalLines: classification.binaryUniqueFunctionalLines,
        recommendation: classification.recommendation,
        isActionable: classification.actionable,
        recommendedAction: classification.recommendation,
      });
    }
  }

  for (const [key, sourceFile] of sourceByKey) {
    if (!binaryByKey.has(key)) missingInBinary.push(toComparisonEntry(sourceFile, undefined));
  }

  const hasFunctionalDifferences =
    actionableDifferent.length > 0 || missingInSource.length > 0 || missingInBinary.length > 0;

  // Resolve real version once so top-level dysflowVersion and runtimeDiagnostics agree
  const runtimeDiagnostics = buildRuntimeDiagnostics();

  // Project the flat semanticSummary + array lengths into the nested
  // SummaryStructured shape (round 5 / PR5). Pure O(1) projection — no
  // second pass over the diffs. `different` is the count of semantic diffs
  // (diffs.length), not including missingIn*; missingInSource / missingInBinary
  // are surfaced as their own top-level counts so consumers do not have to
  // recompute them.
  const summaryStructured: SummaryStructured | undefined =
    mode === "semantic"
      ? {
          matched: matched.length,
          different: different.length,
          missingInSource: missingInSource.length,
          missingInBinary: missingInBinary.length,
          actionable: {
            sourceNewer: semanticSummary.sourceNewer ?? 0,
            binaryNewer: semanticSummary.binaryNewer ?? 0,
            bothChanged: semanticSummary.bothChanged ?? 0,
            total:
              (semanticSummary.sourceNewer ?? 0) +
              (semanticSummary.binaryNewer ?? 0) +
              (semanticSummary.bothChanged ?? 0),
          },
          nonActionable: {
            caseOnly: semanticSummary.caseOnly ?? 0,
            whitespaceOnly: semanticSummary.whitespaceOnly ?? 0,
            attributeOnly: semanticSummary.attributeOnly ?? 0,
            formSerializationOnly: semanticSummary.formSerializationOnly ?? 0,
            encodingOnly: semanticSummary.encodingOnly ?? 0,
            total:
              (semanticSummary.caseOnly ?? 0) +
              (semanticSummary.whitespaceOnly ?? 0) +
              (semanticSummary.attributeOnly ?? 0) +
              (semanticSummary.formSerializationOnly ?? 0) +
              (semanticSummary.encodingOnly ?? 0),
          },
        }
      : undefined;

  return {
    ok: different.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot,
    vbeCacheNote: VBE_CACHE_NOTE,
    dysflowVersion: runtimeDiagnostics.dysflowVersion,
    classifierRules: SEMANTIC_CLASSIFIER_RULES,
    runtimeDiagnostics,
    matched: sortComparisonEntries(matched),
    different: sortComparisonEntries(different),
    missingInSource: sortComparisonEntries(missingInSource),
    missingInBinary: sortComparisonEntries(missingInBinary),
    ...(includeDiffs ? { diffs: sortDiffEntries(diffs) } : {}),
    // Additive semantic fields (only in semantic mode)
    ...(mode === "semantic"
      ? {
          summary: semanticSummary as VbaSemanticSummary,
          actionableDifferent: sortComparisonEntries(actionableDifferent),
          nonActionableDifferent: sortComparisonEntries(nonActionableDifferent),
          hasFunctionalDifferences,
          actionableOk: !hasFunctionalDifferences,
          ...aggregateRecommendation(
            semanticSummary,
            missingInSource.length,
            missingInBinary.length,
            hasFunctionalDifferences,
          ),
          summaryStructured,
          ...deriveBulkLists(actionableDifferent, missingInBinary, missingInSource),
        }
      : {}),
  };
}

/**
 * Derives a single whole-comparison recommendation from the per-category summary
 * and the missing buckets. This is the aggregate the old `reconcile_binary`
 * surfaced, made classification-aware: the consumer reads one direction instead
 * of inferring it from the per-module diffs.
 *
 * - missingInBinary = present on disk, absent in the binary -> import to binary.
 * - missingInSource = present in the binary, absent on disk -> export to source.
 */
function aggregateRecommendation(
  summary: Record<string, number>,
  missingInSourceCount: number,
  missingInBinaryCount: number,
  hasFunctional: boolean,
): { recommendation: string; recommendedAction: VbaRecommendation } {
  if (!hasFunctional) {
    return {
      recommendedAction: "no_action",
      recommendation:
        "Source and the Access binary already match (ignoring non-functional noise); no sync needed.",
    };
  }
  const sourceNewer = summary.sourceNewer ?? 0;
  const binaryNewer = summary.binaryNewer ?? 0;
  const bothChanged = summary.bothChanged ?? 0;
  const wantsImport = sourceNewer > 0 || missingInBinaryCount > 0;
  const wantsExport = binaryNewer > 0 || missingInSourceCount > 0;
  if (bothChanged > 0 || (wantsImport && wantsExport)) {
    return {
      recommendedAction: "manual_merge",
      recommendation:
        "Both source and the Access binary changed; review the per-module diffs and merge manually before syncing.",
    };
  }
  if (wantsImport) {
    return {
      recommendedAction: "import_to_binary",
      recommendation: "Source is ahead; import the listed modules into the Access binary.",
    };
  }
  if (wantsExport) {
    return {
      recommendedAction: "export_to_src",
      recommendation: "The Access binary is ahead; export the listed modules to source.",
    };
  }
  return { recommendedAction: "no_action", recommendation: "No actionable differences." };
}

/**
 * Derives the consumer-ready bulk-import / bulk-export lists (round 5 / PR5).
 * Pure sibling of {@link aggregateRecommendation}; both consume the same
 * accumulators produced by the main diff loop. The four arrays are
 * computed once, here, so consumers can pass them straight to
 * `import_modules({ moduleNames: bulkImportable })` or
 * `export_modules({ moduleNames: bulkExportable })` without re-deriving.
 *
 * Semantics (matches the PR5 spec):
 *   bulkImportable = sourceNewer moduleNames ∪ missingInBinary moduleNames
 *   bulkExportable = binaryNewer moduleNames ∪ missingInSource moduleNames
 *   bothChanged excluded from BOTH (those still need human review)
 *
 * Dedup is `Set`-based; output is sorted lexicographically for byte-stable
 * determinism across runs. `bothChanged` is filtered out of BOTH lists
 * by virtue of the per-entry classification check (its entry.classification
 * is neither 'sourceNewer' nor 'binaryNewer').
 */
function deriveBulkLists(
  actionableDifferent: readonly VbaSourceComparisonEntry[],
  missingInBinary: readonly VbaSourceComparisonEntry[],
  missingInSource: readonly VbaSourceComparisonEntry[],
): {
  bulkImportable: string[];
  bulkImportableCount: number;
  bulkExportable: string[];
  bulkExportableCount: number;
} {
  const importSet = new Set<string>();
  const exportSet = new Set<string>();
  for (const e of actionableDifferent) {
    if (e.classification === "sourceNewer") {
      importSet.add(e.moduleName);
    } else if (e.classification === "binaryNewer") {
      exportSet.add(e.moduleName);
    }
    // bothChanged: silently skipped — same module appears in neither list
  }
  for (const e of missingInBinary) importSet.add(e.moduleName);
  for (const e of missingInSource) exportSet.add(e.moduleName);
  const bulkImportable = [...importSet].sort();
  const bulkExportable = [...exportSet].sort();
  return {
    bulkImportable,
    bulkImportableCount: bulkImportable.length,
    bulkExportable,
    bulkExportableCount: bulkExportable.length,
  };
}

export async function collectVbaSourceFiles(
  root: string,
  moduleFilter: ReadonlySet<string>,
  fileSystem: ComparisonFileSystemPort,
): Promise<VbaSourceComparisonFile[]> {
  const files: VbaSourceComparisonFile[] = [];
  async function visit(directory: string): Promise<void> {
    let entries: readonly ComparisonFileSystemEntry[];
    try {
      entries = await fileSystem.readdir(directory);
    } catch (err) {
      if (isMissingPathError(err)) {
        entries = [];
      } else {
        logSwallowedIoError("vba-source-comparison:readdir", err);
        entries = [];
      }
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileType = vbaSourceFileType(entry.name);
      if (fileType === undefined) continue;
      const moduleName = moduleNameFromVbaFile(entry.name);
      if (moduleFilter.size > 0 && !moduleFilter.has(moduleName.toLowerCase())) continue;
      files.push({
        moduleName,
        fileType,
        path,
        relativePath: relative(root, path).replace(/\\/g, "/"),
      });
    }
  }

  await visit(root);
  return files;
}

function vbaSourceFileType(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return "form.txt";
  if (lower.endsWith(".report.txt")) return "report.txt";
  const extension = extname(lower);
  if (extension === ".bas" || extension === ".cls" || extension === ".frm")
    return extension.slice(1);
  return undefined;
}

function moduleNameFromVbaFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return fileName.slice(0, -".form.txt".length);
  if (lower.endsWith(".report.txt")) return fileName.slice(0, -".report.txt".length);
  return parse(fileName).name;
}

function comparisonKey(file: VbaSourceComparisonFile): string {
  return `${file.moduleName.toLowerCase()}\0${file.fileType}`;
}

function toComparisonEntry(
  sourceFile: VbaSourceComparisonFile | undefined,
  binaryFile: VbaSourceComparisonFile | undefined,
): VbaSourceComparisonEntry {
  const file = sourceFile ?? binaryFile;
  return {
    moduleName: file?.moduleName ?? "",
    fileType: file?.fileType ?? "",
    sourcePath: sourceFile?.relativePath,
    binaryPath: binaryFile?.relativePath,
  };
}

function sortComparisonEntries(entries: VbaSourceComparisonEntry[]): VbaSourceComparisonEntry[] {
  return entries.sort((left, right) =>
    `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`),
  );
}

function sortDiffEntries(entries: VbaSourceDiffEntry[]): VbaSourceDiffEntry[] {
  return entries.sort((left, right) =>
    `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`),
  );
}

function firstDifferentLineSnippet(leftText: string, rightText: string, label: string): string {
  const leftLines = leftText.split(/\r?\n/);
  const rightLines = rightText.split(/\r?\n/);
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max; index += 1) {
    if (leftLines[index] !== rightLines[index])
      return `${label}:${index + 1}: ${leftLines[index] ?? ""}`;
  }
  return `${label}: files differ`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function isMissingPathError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
