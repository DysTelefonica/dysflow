import { listVbaProcedures } from "./vba-procedure-service.js";

export type VbaTestManifestErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_TAG"
  | "PROCEDURE_NOT_FOUND"
  | "ARG_COUNT_MISMATCH"
  | "ARG_TYPE_MISMATCH";

export interface VbaTestManifestDiagnostic {
  code: VbaTestManifestErrorCode;
  message: string;
  testIndex?: number;
  procedure?: string;
  index?: number;
}

export interface VbaTestManifestReport {
  valid: boolean;
  errors: VbaTestManifestDiagnostic[];
  warnings: VbaTestManifestDiagnostic[];
  summary: {
    totalTests: number;
    validTests: number;
    errorCount: number;
    warningCount: number;
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

export function validateVbaTestManifest(
  manifest: unknown,
  modules: Record<string, string>,
): VbaTestManifestReport {
  const errors: VbaTestManifestDiagnostic[] = [];
  const { tests, totalTests } = normalizeManifest(manifest, errors);
  const catalog = buildProcedureCatalog(modules);

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
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    summary: {
      totalTests,
      validTests: Math.max(0, totalTests - new Set(errors.map((e) => e.testIndex)).size),
      errorCount: errors.length,
      warningCount: 0,
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
