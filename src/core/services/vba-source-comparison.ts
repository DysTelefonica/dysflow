import { extname, parse, relative, resolve } from "node:path";
import {
  createDysflowError,
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

  const sourceRoot = target.data.destinationRoot;
  const tempExportRoot = await fileSystem.mkdtemp(
    resolve(fileSystem.tmpdir(), "dysflow-vba-verify-"),
  );
  const password = ctx.accessPassword;
  const effectiveTimeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : (target.data.timeoutMs ?? 30000);
  try {
    const request = {
      scriptPath: ctx.scriptPath,
      action: "Export",
      accessPath: target.data.accessPath,
      destinationRoot: tempExportRoot,
      moduleNames: stringArray(params.moduleNames),
      password,
      json: true,
      extra: {},
      timeoutMs: effectiveTimeoutMs,
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };

    const preflightDiagnostics = diagnosticsFromPreflightCleanup(
      await ctx.runPreflightCleanup(target.data),
    );
    const result = await ctx.runVbaManager(request);
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.timedOut) {
      // The export timed out: the PowerShell process is killed, but the Access COM
      // process it spawned is a separate process that survives as an orphan. Reap
      // it immediately by re-running the path/lock cleanup so a timeout never
      // leaks an Access process (orphans would otherwise linger until the next op).
      const timeoutCleanupDiagnostics = await reapOrphanedAccessOnTimeout(() =>
        ctx.runPreflightCleanup(target.data),
      );
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_TIMEOUT",
          `verify export timed out after ${result.durationMs}ms`,
          { retryable: true },
        ),
        {
          diagnostics: [...preflightDiagnostics, ...timeoutCleanupDiagnostics],
          durationMs: result.durationMs,
        },
      );
    }
    if (result.exitCode !== 0) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_FAILED",
          `verify export failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`,
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
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
    const comparison = await compareVbaSourceTrees(
      sourceRoot,
      tempExportRoot,
      stringArray(params.moduleNames),
      truthy(params.diff),
      fileSystem,
      comparisonMode,
    );
    const requestedModules = stringArray(params.moduleNames);
    if (requestedModules.length > 0) {
      const found =
        comparison.matched.length +
        comparison.different.length +
        comparison.missingInSource.length +
        comparison.missingInBinary.length;
      if (found === 0) {
        return failureResult(
          createDysflowError(
            "MODULE_NOT_FOUND",
            `No requested module was found in source or binary export: ${requestedModules.join(", ")}.`,
          ),
          { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
        );
      }
    }
    return successResult(
      { operation: "verify_code", ...comparison, warnings: exportWarnings },
      { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
    );
  } finally {
    await fileSystem.rm(tempExportRoot, { recursive: true, force: true });
  }
}

import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";

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
    different.push(entry);

    // Accumulate semantic summary
    const cat = classification.classification;
    semanticSummary[cat] = (semanticSummary[cat] ?? 0) + 1;

    // Bucket into actionable / nonActionable
    if (classification.actionable) {
      actionableDifferent.push(entry);
    } else {
      nonActionableDifferent.push(entry);
    }

    if (includeDiffs) {
      diffs.push({
        ...entry,
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
