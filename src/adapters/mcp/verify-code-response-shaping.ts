import { isRecord } from "../../core/utils/index.js";

type VerifyCodeDiagnosticOptions = {
  diagnostic: boolean;
};

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayOrEmpty(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function copyDefined(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key];
  }
}

/**
 * Issue #1535 — project the full core comparison onto the consumer-safe MCP
 * default. The core result stays untouched because sync_binary consumes its
 * diagnostic arrays internally. diagnostic:true restores that full evidence
 * at the public boundary.
 */
export function shapeVerifyCodeResponse<T>(raw: T, options: VerifyCodeDiagnosticOptions): T {
  if (!isRecord(raw) || raw.operation !== "verify_code") return raw;

  const structured = isRecord(raw.summaryStructured) ? raw.summaryStructured : {};
  const actionable = isRecord(structured.actionable) ? structured.actionable : {};
  const nonActionable = isRecord(structured.nonActionable) ? structured.nonActionable : {};
  const semanticSummary = isRecord(raw.summary) ? raw.summary : {};
  const bulkImportable = arrayOrEmpty(raw.bulkImportable);
  const bulkExportable = arrayOrEmpty(raw.bulkExportable);
  const matched = arrayOrEmpty(raw.matched);
  const actionableDifferent = arrayOrEmpty(raw.actionableDifferent);
  const nonActionableDifferent = arrayOrEmpty(raw.nonActionableDifferent);
  const hasSemanticSummary =
    isRecord(raw.summaryStructured) &&
    isRecord(raw.summaryStructured.actionable) &&
    isRecord(raw.summaryStructured.nonActionable);

  const compact: Record<string, unknown> = {
    operation: "verify_code",
    ok: raw.ok,
    dryRun: raw.dryRun,
    willModifyAccess: raw.willModifyAccess,
    sourceRoot: raw.sourceRoot,
    warnings: arrayOrEmpty(raw.warnings),
  };

  // Strict comparisons intentionally omit semantic classification. Preserve
  // that absence instead of manufacturing zero actionable counts and empty
  // sync lists that could be misread as a semantic no-op verdict.
  if (hasSemanticSummary) {
    compact.summaryStructured = {
      matched: numberOrZero(structured.matched ?? matched.length),
      actionableTotal: numberOrZero(actionable.total ?? actionableDifferent.length),
      nonActionableTotal: numberOrZero(nonActionable.total ?? nonActionableDifferent.length),
    };
    compact.summaryByCategory = {
      sourceNewer: numberOrZero(actionable.sourceNewer ?? semanticSummary.sourceNewer),
      binaryNewer: numberOrZero(actionable.binaryNewer ?? semanticSummary.binaryNewer),
      bothChanged: numberOrZero(actionable.bothChanged ?? semanticSummary.bothChanged),
    };
    compact.bulkImportable = bulkImportable;
    compact.bulkImportableCount = numberOrZero(raw.bulkImportableCount ?? bulkImportable.length);
    compact.bulkExportable = bulkExportable;
    compact.bulkExportableCount = numberOrZero(raw.bulkExportableCount ?? bulkExportable.length);
  }

  copyDefined(compact, raw, [
    "vbeCacheNote",
    "dysflowVersion",
    "classifierRules",
    "runtimeDiagnostics",
    "hasFunctionalDifferences",
    "actionableOk",
    "recommendedAction",
    // Chunk failures are correctness evidence, not classifier noise. Keep them
    // visible in the compact response so a partial verify never looks clean.
    "chunkFailures",
    "chunkTimedOut",
  ]);

  // Raw fields win in diagnostic mode so the richer nested classifier summary
  // is restored rather than replaced by the compact three-count projection.
  return (options.diagnostic ? { ...compact, ...raw } : compact) as T;
}

/**
 * `diagnostic` is an MCP response option, not a core comparison parameter.
 * Strip it before dispatch. Diagnostic evidence needs line snippets, so the
 * opt-in also enables the existing `diff` calculation.
 */
export function verifyCodeServiceInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const { diagnostic, ...rest } = input;
  return diagnostic === true ? { ...rest, diff: true } : rest;
}
