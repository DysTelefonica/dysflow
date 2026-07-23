// Service for the list_vba_modules MCP tool (#807 Feature 1).
//
// Topology:
//   1. PowerShell runner (`Invoke-ListVbaModulesAction`) walks the live
//      VBProject.VBComponents ONCE, releases every component COM reference
//      in `finally { FinalReleaseComObject }`, applies the optional
//      `typeFilter` and `namePattern` filters, and writes a structured
//      payload. The runner does NOT touch the source tree (no Access call
//      elsewhere; the cross-reference pass is filesystem-only).
//
//   2. This service consumes the runner output, normalizes it, pairs every
//      binary-side row with its source-side counterpart (filesystem walk of
//      the project's source root, again ONCE), and emits the cross-reference
//      contract the consumer cares about: per-module
//      `sourceExists` / `binaryExists` and a bucketed `summary`.
//
// Why two passes (binary via runner, source via filesystem)? Because the
// binary's VBComponents iteration requires COM and is the only authoritative
// source of VBE identity (VB_Name, form/report kinds, document modules).
// The source tree is a SET — we want to know which components are in BOTH,
// and which are on ONE side only. The runner provides binary; this service
// provides source. Merging happens here.

import {
  createDysflowError,
  type DysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  indexManagedSourceFiles,
  type ListVbaModulesResult,
  type ModuleFileIndexEntry,
  mapTypeFilterToVbComponentType,
  type VbaComponentType,
  type VbaFileType,
  type VbaModuleInfo,
  type VbaTypeFilterName,
} from "../models/vba-module-info.js";
import type { ComparisonFileSystemPort } from "./vba-source-comparison.js";

/**
 * Raw row emitted by the runner (PowerShell). Mirrors the dispatch contract
 * we negotiate with `Invoke-ListVbaModulesAction`. The TS service is the
 * ONLY consumer; the type is internal but exported so the adapter layer can
 * type the runner return shape.
 */
export type ListVbaModulesRunnerRow = {
  name: string;
  type: VbaComponentType;
  fileType: VbaFileType;
  binaryPath?: string;
};

/**
 * Runner envelope as emitted by the PowerShell `Invoke-ListVbaModulesAction`.
 * `appliedFilters` is reported so consumers can verify the dispatch honored
 * the requested `typeFilter` / `namePattern`.
 */
export type ListVbaModulesRunnerResult = {
  ok: true;
  components: readonly ListVbaModulesRunnerRow[];
  appliedFilters: {
    typeFilter: VbaTypeFilterName | null;
    namePattern: string | null;
  };
};

/**
 * Cross-reference context: identical shape to `VbaComparisonContext` for the
 * things we need (script path, target resolution, preflight cleanup, runner
 * callback). Reuses the existing `runVbaManager` runner signature so the
 * adapter doesn't need to learn a new executor port.
 */
export type ListVbaModulesContext = {
  scriptPath: string;
  accessPassword?: string;
  resolveExecutionTarget(
    params: Record<string, unknown>,
  ): Promise<OperationResult<{ accessPath?: string; destinationRoot: string; timeoutMs?: number }>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: { accessPath?: string; destinationRoot: string; projectRoot?: string },
  ): OperationResult<undefined>;
  runPreflightCleanup(target: { accessPath?: string; destinationRoot: string }): Promise<unknown>;
  runVbaManager(request: {
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
  }): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
  }>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const SUPPORTED_TYPE_FILTERS: ReadonlySet<VbaTypeFilterName> = new Set([
  "standard",
  "class",
  "form",
  "report",
  "document",
]);

/**
 * Translates `*-wildcard` glob patterns into a PowerShell-side substring
 * filter. The runner is intentionally simple here: a `*`-anchored pattern
 * degenerates to a substring match (most consumers want `Test_*` style
 * prefix globs; full glob support would require a regex engine in the runner,
 * and the substring form covers 95% of real callers without forking the
 * dispatch surface).
 *
 * Returning null means "no name filter"; an empty string means "match
 * nothing". The runner distinguishes the two cases.
 */
function translateNamePattern(pattern: string | undefined): string | null {
  if (pattern === undefined) return null;
  if (pattern === "") return ""; // explicit empty = match nothing
  // Strip leading and trailing `*` so the inner string is the only test.
  // Patterns like `mod0BD*` become `mod0BD` (prefix match); `*Issue*`
  // become `Issue` (substring); `Test_*` become `Test_`. Empty after trim?
  // Caller asked to filter to nothing.
  const trimmed = pattern.replace(/^\*+|\*+$/g, "");
  return trimmed.length === 0 ? "" : trimmed;
}

export type RunListVbaModulesInput = {
  typeFilter?: string;
  namePattern?: string;
  timeoutMs?: number;
};

/**
 * Entry point invoked by `VbaModulesAdapter.execute` for the `list_vba_modules`
 * tool. Returns a normalized `ListVbaModulesResult` with the
 * binary↔source cross-reference.
 */
export async function runListVbaModules(
  params: RunListVbaModulesInput,
  ctx: ListVbaModulesContext,
  fileSystem: Pick<ComparisonFileSystemPort, "readdir">,
): Promise<OperationResult<ListVbaModulesResult>> {
  const typeFilter = stringValue(params.typeFilter);
  if (typeFilter !== undefined && !SUPPORTED_TYPE_FILTERS.has(typeFilter as VbaTypeFilterName)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `list_vba_modules typeFilter must be one of standard|class|form|report|document, got: ${typeFilter}`,
      ),
    );
  }
  const namePattern = stringValue(params.namePattern);

  const target = await ctx.resolveExecutionTarget(params as unknown as Record<string, unknown>);
  if (!target.ok) return target;
  const strict = ctx.validateStrictContext(
    params as unknown as Record<string, unknown>,
    target.data,
  );
  if (!strict.ok) return strict;

  const effectiveTimeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : (target.data.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Defense-in-depth: the runner does the same preflight as the rest of the
  // vba-sync tools. The result is ignored here but a failed lock cleanup would
  // otherwise leave us with a stale COM session on the next retry.
  await ctx.runPreflightCleanup(target.data);

  const runnerTypeFilter =
    typeFilter === undefined ? null : (typeFilter as VbaTypeFilterName | null);
  const runnerNamePattern = namePattern === undefined ? null : translateNamePattern(namePattern);
  const result = await ctx.runVbaManager({
    scriptPath: ctx.scriptPath,
    action: "List-VbaModules",
    accessPath: target.data.accessPath,
    destinationRoot: target.data.destinationRoot,
    moduleNames: [],
    json: true,
    extra: {
      typeFilter: runnerTypeFilter ?? undefined,
      namePattern: runnerNamePattern ?? undefined,
      applyTypeFilter: runnerTypeFilter !== null,
      applyNamePattern: runnerNamePattern !== null,
    },
    password: ctx.accessPassword,
    timeoutMs: effectiveTimeoutMs,
  });

  if (result.timedOut) {
    return failureResult(
      createDysflowError(
        "VBA_MANAGER_TIMEOUT",
        `list_vba_modules timed out after ${result.durationMs}ms.`,
        {
          retryable: true,
          details: { toolName: "list_vba_modules", durationMs: result.durationMs },
        },
      ),
    );
  }

  let parsed: ListVbaModulesRunnerResult | { ok: false; error: { code: string; message: string } };
  try {
    parsed = JSON.parse(extractFirstJson(result.stdout));
  } catch (error) {
    return failureResult(
      createDysflowError(
        "VBA_MANAGER_INVALID_OUTPUT",
        `list_vba_modules runner output was not parseable: ${String(error)}`,
        { details: { stderrTail: result.stderr.slice(-2000) } },
      ),
    );
  }

  if (parsed.ok === false) {
    const err = parsed.error;
    return failureResult(
      createDysflowError(
        err.code ?? "VBA_MANAGER_FAILED",
        err.message ?? "list_vba_modules failed",
        {
          details: { toolName: "list_vba_modules" },
        },
      ),
    );
  }
  if (!Array.isArray(parsed.components)) {
    return failureResult(
      createDysflowError(
        "VBA_MANAGER_INVALID_OUTPUT",
        "list_vba_modules payload missing `components` array.",
      ),
    );
  }

  // Cross-reference: walk the source tree ONCE and pair every binary row
  // with its (case-insensitive) on-disk counterpart. We do NOT call Access
  // here — the binary side already came through the runner.
  const sourceIndex = await indexManagedSourceFiles(target.data.destinationRoot, fileSystem);
  const sourceByName = new Map<string, ModuleFileIndexEntry>();
  for (const entry of sourceIndex) {
    sourceByName.set(entry.moduleName.toLowerCase(), entry);
  }

  const filterTypeCodes: Set<VbaComponentType> = new Set(
    runnerTypeFilter === null ? [] : mapTypeFilterToVbComponentType(runnerTypeFilter),
  );

  const modules: VbaModuleInfo[] = [];
  let inBinaryOnly = 0;
  let inSourceOnly = 0;
  let inBoth = 0;

  for (const row of parsed.components) {
    const source = sourceByName.get(row.name.toLowerCase());
    const sourceExists = source !== undefined;
    const sourcePath = source?.relativePath;
    if (sourceExists) inBoth++;
    else inBinaryOnly++;
    modules.push({
      name: row.name,
      type: row.type,
      fileType: source?.fileType ?? row.fileType,
      sourcePath,
      binaryPath: row.binaryPath,
      sourceExists,
      binaryExists: true,
      // contentMatch is intentionally undefined when the runner did not
      // surface a payload with semantic diff markers — `unknown` would
      // over-promise. Consumers that need a real compare should follow up
      // with `verify_code({ moduleNames: [name] })`.
    });
  }

  // Source-only modules: the disk has a file whose name does not match any
  // VBComponent by VB_Name. These are exactly what `vba_orphan_audit` flags
  // for cleanup, so we emit them with `binaryExists: false` and let the
  // consumer decide what to do.
  const seenBinaryNames = new Set(parsed.components.map((row) => row.name.toLowerCase()));
  for (const [name, entry] of sourceByName) {
    if (seenBinaryNames.has(name)) continue;
    if (filterTypeCodes.size > 0 && !filterTypeCodes.has(fileTypeToVbType(entry.fileType))) {
      continue;
    }
    if (
      runnerNamePattern !== null &&
      nameInPattern(entry.moduleName, runnerNamePattern) === false
    ) {
      continue;
    }
    modules.push({
      name: entry.moduleName,
      type: fileTypeToVbType(entry.fileType),
      fileType: entry.fileType,
      sourcePath: entry.relativePath,
      binaryExists: false,
      sourceExists: true,
    });
    inSourceOnly++;
  }

  // Stable ordering for cross-test fixtures.
  modules.sort((left, right) => {
    const k = `${left.name.toLowerCase()}\0${left.fileType}`.localeCompare(
      `${right.name.toLowerCase()}\0${right.fileType}`,
    );
    return k;
  });
  return successResult({
    modules,
    summary: {
      total: modules.length,
      inBinaryOnly,
      inSourceOnly,
      inBoth,
      // #1057 (F3) — explicit-unit aliases. Same values; the field name
      // carries the unit (modules PRESENT, not content-drift counts —
      // use verify_code for drift).
      totalModules: modules.length,
      modulesInBinaryOnly: inBinaryOnly,
      modulesInSourceOnly: inSourceOnly,
      modulesInBoth: inBoth,
    },
  });
}

/**
 * Maps a source-side `fileType` back to a VBComponent.Type for the
 * source-only rows. This is a structural default, NOT a runtime lookup —
 * Access gives us the canonical type for binary-side rows; for source-only
 * files we derive it from the extension. `form` and `report` both map to
 * `3` (acForm), which we document on `fileTypeToVbType`.
 */
function fileTypeToVbType(fileType: VbaFileType): VbaComponentType {
  switch (fileType) {
    case "bas":
      return 1;
    case "cls":
      return 2;
    case "frm":
      return 3;
    case "form.txt":
      return 3;
    case "report.txt":
      return 3;
  }
}

/**
 * Substring match: a glob like `Test_*` becomes `Test_` and every binary
 * name starting with `Test_` matches. We deliberately do NOT implement
 * `?` (single-char wildcard) or `[…]` (character class) because the runner
 * contract documents a single `*` anchor.
 */
function nameInPattern(name: string, pattern: string): boolean {
  if (pattern.length === 0) return false;
  return name.toLowerCase().includes(pattern.toLowerCase());
}

function stringValue(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractFirstJson(stdout: string): string {
  // PowerShell emits `DYSFLOW_RESULT { ... }` as a sentinel. We unwrap the
  // first balanced JSON object so non-JSON log lines (Write-Status noise) do
  // not throw off the parser. Falls back to `trim()` if no sentinel present.
  const idx = stdout.indexOf("{");
  if (idx === -1) return stdout.trim();
  let depth = 0;
  for (let i = idx; i < stdout.length; i += 1) {
    const ch = stdout[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return stdout.slice(idx, i + 1);
    }
  }
  return stdout.slice(idx);
}

/**
 * Failure envelope expected by the runner-spawn failure path. Exported for
 * the adapter's `execute()` so it can layer typed errors.
 */
export type ListVbaModulesFailure = DysflowError;
