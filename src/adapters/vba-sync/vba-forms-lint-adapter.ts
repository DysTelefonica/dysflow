/**
 * Orchestrator adapter for `dysflow_lint_form_code`.
 *
 * Resolves the source `.form.txt` + `.cls` for the requested forms, hands the
 * parsed text + IR to the pure lint engine in `src/core/services/form-lint.ts`,
 * and returns an OperationResult envelope so the MCP stdio adapter can
 * serialize it without throwing.
 *
 * This adapter owns all filesystem reads. The engine itself is pure — see
 * `form-lint.ts`. Tests inject a `FormFileSystemPort` mock; production code
 * uses the Node.js real-fs implementation declared at the bottom of the file.
 *
 * The adapter is intentionally lightweight: it does NOT instantiate a
 * `VbaFormsAdapter` (which would create a circular dependency). It mirrors
 * the same orchestrator interface so it can be wired into `VbaSyncAdapter`
 * as a sibling.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import { lintFormCode } from "../../core/services/form-lint.js";
import {
  ALL_LINT_RULE_IDS,
  type LintDiagnostic,
  type LintRuleId,
} from "../../core/services/form-lint-types.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";

// ---------------------------------------------------------------------------
// Input types (the public MCP tool schema mirrors these)
// ---------------------------------------------------------------------------

export type LintFormCodeInput = {
  /** Either destinationRoot OR sourceRoot must resolve to a directory of forms/ and reports/. */
  destinationRoot?: string;
  sourceRoot?: string;
  /** Single-form lint. Mutually exclusive with `moduleNames`. */
  formName?: string;
  /** Multi-form lint. Each name must be `Form_*` or `Report_*`. */
  moduleNames?: string[];
  /** Subset of rule IDs. Defaults to ALL_LINT_RULE_IDS. */
  rules?: LintRuleId[];
  /** Elevate warnings to errors. */
  strict?: boolean;
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const FORM_PREFIX = /^Form_/;
const REPORT_PREFIX = /^Report_/;
const FORM_TXT_SUFFIX = /\.form\.txt$/i;
const REPORT_TXT_SUFFIX = /\.report\.txt$/i;
const CLS_SUFFIX = /\.cls$/i;

export class VbaFormsLintAdapter {
  constructor(private readonly fileSystem: FormFileSystemPort = nodeLintFileSystem) {}

  /**
   * Resolve inputs, read files, run the engine, and return the lint envelope.
   */
  async lintFormCode(input: LintFormCodeInput): Promise<OperationResult<unknown>> {
    const trimmedForm = stringValue(input.formName);
    const trimmedModuleNames = stringArray(input.moduleNames);
    if (trimmedForm !== undefined && trimmedModuleNames.length > 0) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "formName and moduleNames are mutually exclusive; pass only one.",
        ),
      );
    }

    const sourceRoot = resolveRoot(input.destinationRoot, input.sourceRoot);
    if (!sourceRoot) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "destinationRoot or sourceRoot is required (path that contains forms/ and/or reports/).",
        ),
      );
    }

    const rules = normalizeRules(input.rules);
    const targets = await this.resolveTargets(sourceRoot, trimmedForm, trimmedModuleNames);
    if ("error" in targets) {
      return failureResult(targets.error);
    }

    const diagnostics: LintDiagnostic[] = [];
    let formsScanned = 0;

    for (const target of targets.targets) {
      formsScanned++;
      let formTxt: string;
      try {
        formTxt = await this.fileSystem.readFile(target.formTxtPath);
      } catch (err) {
        diagnostics.push({
          severity: "error",
          rule: "form-control-binding",
          file: target.formTxtPath,
          line: 0,
          column: 0,
          message: `Cannot read ${target.formTxtPath}: ${errMessage(err)}`,
        });
        continue;
      }

      let clsSource = "";
      try {
        if (target.clsPath) {
          clsSource = await this.fileSystem.readFile(target.clsPath);
        }
      } catch (err) {
        diagnostics.push({
          severity: "warning",
          rule: "form-control-binding",
          file: target.clsPath ?? target.formTxtPath,
          line: 0,
          column: 0,
          message: `Cannot read ${target.clsPath}: ${errMessage(err)}`,
        });
      }

      let ir: import("../../core/models/form-ir.js").FormIR;
      try {
        ir = parseFormTxt(formTxt, { name: target.formName });
      } catch (err) {
        diagnostics.push({
          severity: "error",
          rule: "form-control-binding",
          file: target.formTxtPath,
          line: 0,
          column: 0,
          message: `Failed to parse ${target.formTxtPath}: ${errMessage(err)}`,
        });
        continue;
      }

      const result = lintFormCode(
        {
          formName: target.formName,
          formTxtPath: target.formTxtPath,
          ir,
          clsSource,
          clsPath: target.clsPath ?? target.formTxtPath,
        },
        { rules, strict: input.strict === true },
      );
      diagnostics.push(...result.diagnostics);
    }

    const summary = summarize(diagnostics, formsScanned);
    return successResult({
      ok: summary.errorsCount === 0 && summary.warningsCount === 0,
      summary,
      diagnostics,
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async resolveTargets(
    sourceRoot: string,
    formName: string | undefined,
    moduleNames: string[],
  ): Promise<{ targets: Array<ResolvedForm> } | { error: ReturnType<typeof createDysflowError> }> {
    if (formName !== undefined) {
      const resolved = await this.resolveSingle(sourceRoot, formName);
      if ("error" in resolved) return { error: resolved.error };
      return { targets: [resolved] };
    }
    if (moduleNames.length > 0) {
      const targets: Array<ResolvedForm> = [];
      for (const name of moduleNames) {
        if (!FORM_PREFIX.test(name) && !REPORT_PREFIX.test(name)) {
          return {
            error: createDysflowError(
              "MCP_INPUT_INVALID",
              `moduleNames entry '${name}' is not a form/report (must start with Form_ or Report_).`,
            ),
          };
        }
        const resolved = await this.resolveSingle(sourceRoot, name);
        if ("error" in resolved) return { error: resolved.error };
        targets.push(resolved);
      }
      return { targets };
    }
    // No filter — lint every form/report under forms/ and reports/.
    const targets: Array<ResolvedForm> = [];
    for (const subdir of ["forms", "reports"] as const) {
      const dir = resolve(sourceRoot, subdir);
      let entries: readonly string[];
      try {
        entries = await this.fileSystem.readdir(dir);
      } catch {
        continue; // folder absent — fine, no forms here
      }
      for (const entry of entries) {
        const lower = entry.toLowerCase();
        const isForm = lower.endsWith(".form.txt");
        const isReport = lower.endsWith(".report.txt");
        const isCls = lower.endsWith(".cls");
        if (!isForm && !isReport && !isCls) continue;
        // The .cls does not name the form on its own; skip it on full scans —
        // the .form.txt / .report.txt entry will pick up the same form via
        // resolveSingle which knows the sibling .cls convention.
        if (isCls) continue;
        const base = isForm
          ? entry.slice(0, -".form.txt".length)
          : entry.slice(0, -".report.txt".length);
        const resolved = await this.resolveSingle(sourceRoot, base);
        if ("error" in resolved) continue;
        if (!targets.some((t) => t.formName === resolved.formName)) {
          targets.push(resolved);
        }
      }
    }
    return { targets };
  }

  private async resolveSingle(
    sourceRoot: string,
    rawName: string,
  ): Promise<ResolvedForm | { error: ReturnType<typeof createDysflowError> }> {
    const isReport = REPORT_PREFIX.test(rawName);
    const isForm = FORM_PREFIX.test(rawName);
    if (!isForm && !isReport) {
      return {
        error: createDysflowError(
          "MCP_INPUT_INVALID",
          `formName '${rawName}' is not a form/report (must start with Form_ or Report_).`,
        ),
      };
    }
    // Accept the bare name OR the prefixed name.
    const formName = isForm || isReport ? rawName : `Form_${rawName}`;
    const folder = isReport ? "reports" : "forms";
    const txtSuffix = isReport ? ".report.txt" : ".form.txt";
    const candidates = [
      resolve(sourceRoot, folder, `${formName}${txtSuffix}`),
      resolve(sourceRoot, folder, `${formName.replace(/^Form_/, "")}${txtSuffix}`),
      resolve(sourceRoot, folder, `${formName.replace(/^Report_/, "")}${txtSuffix}`),
    ];
    let formTxtPath: string | undefined;
    for (const candidate of candidates) {
      try {
        await this.fileSystem.readFile(candidate);
        formTxtPath = candidate;
        break;
      } catch {
        // keep trying
      }
    }
    if (formTxtPath === undefined) {
      return {
        error: createDysflowError(
          "FORM_NOT_FOUND",
          `No .form.txt / .report.txt found for '${formName}' under ${resolve(sourceRoot, folder)}.`,
        ),
      };
    }
    // Sibling .cls (code-behind) — optional.
    const clsBase = basename(formTxtPath, txtSuffix);
    const clsCandidates = [
      resolve(sourceRoot, folder, `${clsBase}.cls`),
      resolve(sourceRoot, folder, `${clsBase.replace(/^Form_/, "")}.cls`),
      resolve(sourceRoot, folder, `${clsBase.replace(/^Report_/, "")}.cls`),
    ];
    let clsPath: string | undefined;
    for (const candidate of clsCandidates) {
      try {
        await this.fileSystem.readFile(candidate);
        clsPath = candidate;
        break;
      } catch {
        // keep trying
      }
    }
    return {
      formName,
      formTxtPath,
      clsPath,
    };
  }
}

type ResolvedForm = {
  formName: string;
  formTxtPath: string;
  clsPath: string | undefined;
};

// ---------------------------------------------------------------------------
// Filesystem port (Node.js default + tests inject a mock)
// ---------------------------------------------------------------------------

const nodeLintFileSystem: FormFileSystemPort = {
  mkdir: async (path, options) => {
    const { mkdir } = await import("node:fs/promises");
    return mkdir(path, options);
  },
  readdir: (path) => readdir(path),
  readFile: (path) => readFile(path, "utf8"),
  readJson: async <T>(path: string): Promise<T> => {
    const raw = await readFile(path, "utf8");
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Invalid JSON file: ${path}`);
    }
  },
  writeFile: async (path, data, encoding) => {
    const { writeFile } = await import("node:fs/promises");
    return writeFile(path, data, encoding);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRoot(
  destinationRoot: string | undefined,
  sourceRoot: string | undefined,
): string | undefined {
  const candidates = [destinationRoot, sourceRoot]
    .map((p) => stringValue(p))
    .filter((p): p is string => p !== undefined);
  return candidates[0];
}

function stringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string");
}

function normalizeRules(input: LintRuleId[] | undefined): LintRuleId[] {
  if (!Array.isArray(input) || input.length === 0) return [...ALL_LINT_RULE_IDS];
  const valid = new Set<string>(ALL_LINT_RULE_IDS);
  return input.filter((r): r is LintRuleId => valid.has(r));
}

function summarize(diagnostics: LintDiagnostic[], formsScanned: number) {
  let errorsCount = 0;
  let warningsCount = 0;
  let infoCount = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errorsCount++;
    else if (d.severity === "warning") warningsCount++;
    else infoCount++;
  }
  return {
    formsScanned,
    diagnosticsCount: diagnostics.length,
    errorsCount,
    warningsCount,
    infoCount,
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Suppress unused-import warnings for types referenced only via JSDoc.
void FORM_PREFIX;
void REPORT_PREFIX;
void FORM_TXT_SUFFIX;
void REPORT_TXT_SUFFIX;
void CLS_SUFFIX;
