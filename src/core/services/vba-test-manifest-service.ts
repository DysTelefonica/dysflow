import { listVbaProcedures } from "./vba-procedure-service.js";

export type VbaTestManifestErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_TAG"
  | "PROCEDURE_NOT_FOUND"
  | "ARG_COUNT_MISMATCH"
  | "ARG_TYPE_MISMATCH"
  // Issue #1046 (Bug D) — `validate_manifest` allowlist coherence. When the
  // caller passes `validateManifestIncludesAllowlistCheck: true`, every
  // atom whose procedure is not in the resolved allowlist is surfaced as
  // an `invalid[]` entry with this code. The error code lives in the
  // INVALID family (it is a structural drift the manifest declares) but
  // is reported on the parallel `invalid[]` channel rather than `errors[]`
  // so existing consumers that branch on `errors[].code` keep working.
  | "PROCEDURE_NOT_IN_ALLOWLIST";

export interface VbaTestManifestDiagnostic {
  code: VbaTestManifestErrorCode;
  message: string;
  testIndex?: number;
  procedure?: string;
  index?: number;
  /**
   * Issue #1046 (Bug D) — `reason` is set on `invalid[]` entries when the
   * allowlist check surfaces drift. Carries the human-readable cause that
   * greps `/allowlist|allowedProcedures/i` so consumers can branch
   * programmatically (e.g. "auto-add to allowedProcedures") without
   * parsing the message body. Always populated alongside
   * `code === "PROCEDURE_NOT_IN_ALLOWLIST"`.
   */
  reason?: string;
}

export interface VbaTestManifestInvalidAtom {
  procedure: string;
  /**
   * Test index in the manifest (1-based for human consumption).
   * Matches `testIndex` on the parallel `errors[]` entries so consumers
   * can cross-reference.
   */
  testIndex: number;
  /**
   * Human-readable reason the atom is invalid. For allowlist drift the
   * reason matches `/allowlist|allowedProcedures/i` per the #1046 contract.
   */
  reason: string;
}

export interface VbaTestManifestReport {
  valid: boolean;
  errors: VbaTestManifestDiagnostic[];
  warnings: VbaTestManifestDiagnostic[];
  /**
   * Issue #1046 (Bug D) — parallel channel to `errors[]`. Carries atoms
   * the opt-in allowlist check rejects (`code:
   * "PROCEDURE_NOT_IN_ALLOWLIST"`). Always empty when the opt-in flag
   * is absent so the legacy shape is byte-compatible.
   */
  invalid: VbaTestManifestInvalidAtom[];
  summary: {
    totalTests: number;
    validTests: number;
    errorCount: number;
    warningCount: number;
    /**
     * Issue #1046 (Bug D) — count of allowlist-drift entries. Always 0
     * when the opt-in flag is absent.
     */
    invalidCount: number;
  };
}

interface NormalizedManifestTest {
  procedure: string;
  args: unknown[];
  tags: unknown[];
  index: number;
}

interface VbaParameter {
  name: string;
  type: string | undefined;
  optional: boolean;
}

/**
 * Validate a VBA test manifest. The legacy signature accepts only the
 * manifest + module map. Issue #1046 (Bug D) extends the signature with
 * `allowedProcedures` and an opt-in `includeAllowlistCheck` flag. The
 * legacy shape is preserved when both new params are omitted/empty —
 * every existing consumer keeps its byte-identical report.
 *
 * @param manifest — array or `{tests: [...]}` shape per the runner contract.
 * @param modules — module-name → source-code map (parsed for procedure signatures).
 * @param options.includeAllowlistCheck — when `true`, every atom whose
 *   procedure is NOT in `options.allowedProcedures` is reported on
 *   `report.invalid[]` with `reason: "allowlist_miss"`. Default `false`
 *   preserves the legacy JSON-shape-only behavior (Bug D fix path).
 * @param options.allowedProcedures — the allowlist to consult when
 *   `includeAllowlistCheck` is true. Ignored otherwise. Pass `undefined`
 *   or `[]` to mean "no allowlist declared" — the report's invalid
 *   channel stays empty in that case (the consumer that wants to know
 *   "no allowlist" can branch on `summary.invalidCount === 0` plus
 *   `includeAllowlistCheck === true` and a separate config probe).
 */
export function validateVbaTestManifest(
  manifest: unknown,
  modules: Record<string, string>,
  options: {
    includeAllowlistCheck?: boolean;
    allowedProcedures?: readonly string[];
  } = {},
): VbaTestManifestReport {
  const errors: VbaTestManifestDiagnostic[] = [];
  const invalid: VbaTestManifestInvalidAtom[] = [];
  const { tests, totalTests } = normalizeManifest(manifest, errors);
  const catalog = buildProcedureCatalog(modules);

  const includeAllowlistCheck = options.includeAllowlistCheck === true;
  const allowlist = options.allowedProcedures;
  const allowSet =
    includeAllowlistCheck && Array.isArray(allowlist) ? new Set(allowlist) : undefined;

  for (const test of tests) {
    for (let i = 0; i < test.tags.length; i += 1) {
      const tag = test.tags[i];
      if (typeof tag !== "string" || tag.trim().length === 0) {
        errors.push({
          code: "INVALID_TAG",
          message: `Test #${test.index + 1} tag #${i + 1} must be a non-empty string.`,
          testIndex: test.index + 1,
          procedure: test.procedure,
          index: i + 1,
        });
      }
    }

    const procedure = catalog.get(test.procedure.toLowerCase());
    if (procedure === undefined) {
      errors.push({
        code: "PROCEDURE_NOT_FOUND",
        message: `Procedure '${test.procedure}' was not found in the available VBA source modules.`,
        testIndex: test.index + 1,
        procedure: test.procedure,
      });
      continue;
    }

    validateArgs(test, procedure.parameters, errors);

    // Issue #1046 (Bug D) — opt-in allowlist drift surfacing. Runs AFTER
    // the JSON-shape checks so a malformed atom never blocks drift
    // detection on its siblings. Only fires when the caller explicitly
    // opted in via `includeAllowlistCheck: true` AND a non-empty allowlist
    // was supplied; the empty/undefined allowlist case leaves `invalid[]`
    // empty so consumers that use the opt-in to confirm drift are not
    // surprised by a config-only absence.
    if (allowSet !== undefined && !allowSet.has(test.procedure)) {
      invalid.push({
        procedure: test.procedure,
        testIndex: test.index + 1,
        reason: "allowlist_miss",
      });
    }
  }

  return {
    valid: errors.length === 0 && invalid.length === 0,
    errors,
    warnings: [],
    invalid,
    summary: {
      totalTests,
      validTests: Math.max(0, totalTests - new Set(errors.map((e) => e.testIndex)).size),
      errorCount: errors.length,
      warningCount: 0,
      invalidCount: invalid.length,
    },
  };
}

function normalizeManifest(
  manifest: unknown,
  errors: VbaTestManifestDiagnostic[],
): { tests: NormalizedManifestTest[]; totalTests: number } {
  const rawTests = Array.isArray(manifest)
    ? manifest
    : isRecord(manifest) && Array.isArray(manifest.tests)
      ? manifest.tests
      : undefined;
  if (rawTests === undefined) {
    errors.push({
      code: "INVALID_MANIFEST",
      message: 'Test manifest must be an array or an object with a "tests" array.',
    });
    return { tests: [], totalTests: 0 };
  }

  const tests: NormalizedManifestTest[] = [];
  for (let index = 0; index < rawTests.length; index += 1) {
    const item = rawTests[index];
    if (typeof item === "string") {
      const procedure = item.trim();
      if (procedure.length === 0) {
        errors.push({
          code: "INVALID_MANIFEST",
          message: `Test #${index + 1} is empty.`,
          testIndex: index + 1,
        });
        continue;
      }
      tests.push({ procedure, args: [], tags: [], index });
      continue;
    }
    if (!isRecord(item)) {
      errors.push({
        code: "INVALID_MANIFEST",
        message: `Test #${index + 1} must be a procedure name string or an object.`,
        testIndex: index + 1,
      });
      continue;
    }
    const procedure = stringValue(item.procedure) ?? stringValue(item.proc);
    if (procedure === undefined) {
      errors.push({
        code: "INVALID_MANIFEST",
        message: `Test #${index + 1} is missing a non-empty procedure field.`,
        testIndex: index + 1,
      });
      continue;
    }
    tests.push({
      procedure,
      args: Array.isArray(item.args) ? item.args : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      index,
    });
  }
  return { tests, totalTests: rawTests.length };
}

function buildProcedureCatalog(
  modules: Record<string, string>,
): Map<string, { parameters: VbaParameter[] }> {
  const catalog = new Map<string, { parameters: VbaParameter[] }>();
  for (const source of Object.values(modules)) {
    const procedures = listVbaProcedures(source);
    const lines = source.split(/\r?\n/);
    for (const procedure of procedures) {
      const declaration = collectDeclaration(lines, procedure.line);
      catalog.set(procedure.name.toLowerCase(), { parameters: parseParameters(declaration) });
    }
  }
  return catalog;
}

function collectDeclaration(lines: readonly string[], startLine: number): string {
  const parts: string[] = [];
  for (let i = startLine - 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    parts.push(line.trim().replace(/_$/, ""));
    if (!line.trimEnd().endsWith("_")) break;
  }
  return parts.join(" ");
}

function parseParameters(declaration: string): VbaParameter[] {
  const open = declaration.indexOf("(");
  const close = declaration.lastIndexOf(")");
  if (open < 0 || close <= open) return [];
  const raw = declaration.slice(open + 1, close).trim();
  if (raw.length === 0) return [];
  return raw.split(",").map((part) => parseParameter(part.trim()));
}

function parseParameter(raw: string): VbaParameter {
  const cleaned = raw.replace(/\b(ByVal|ByRef|ParamArray)\b/gi, "").trim();
  const optional = /\bOptional\b/i.test(raw);
  const withoutOptional = cleaned.replace(/\bOptional\b/gi, "").trim();
  const match = withoutOptional.match(
    /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\([^)]*\))?(?:\s+As\s+([A-Za-z_][A-Za-z0-9_]*))?/i,
  );
  return { name: match?.[1] ?? withoutOptional, type: match?.[2], optional };
}

function validateArgs(
  test: NormalizedManifestTest,
  parameters: readonly VbaParameter[],
  errors: VbaTestManifestDiagnostic[],
): void {
  const requiredCount = parameters.filter((parameter) => !parameter.optional).length;
  if (test.args.length < requiredCount || test.args.length > parameters.length) {
    errors.push({
      code: "ARG_COUNT_MISMATCH",
      message: `Procedure '${test.procedure}' expects ${requiredCount === parameters.length ? parameters.length : `${requiredCount}-${parameters.length}`} argument(s), but manifest provides ${test.args.length}.`,
      testIndex: test.index + 1,
      procedure: test.procedure,
    });
    return;
  }

  for (let i = 0; i < test.args.length; i += 1) {
    const parameter = parameters[i];
    if (parameter === undefined) continue;
    if (!argMatchesVbaType(test.args[i], parameter.type)) {
      errors.push({
        code: "ARG_TYPE_MISMATCH",
        message: `Argument #${i + 1} for '${test.procedure}' does not match VBA type ${parameter.type}.`,
        testIndex: test.index + 1,
        procedure: test.procedure,
        index: i + 1,
      });
    }
  }
}

function argMatchesVbaType(value: unknown, vbaType: string | undefined): boolean {
  if (vbaType === undefined) return true;
  switch (vbaType.toLowerCase()) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "byte":
    case "integer":
    case "long":
    case "longlong":
    case "single":
    case "double":
    case "currency":
      return typeof value === "number";
    case "variant":
      return true;
    default:
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
