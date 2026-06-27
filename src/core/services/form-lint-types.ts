/**
 * Type definitions for `dysflow_lint_form_code`.
 *
 * A lint rule inspects a single form (its parsed `.form.txt` + `.cls` code-behind)
 * and emits zero or more `LintDiagnostic` entries. The lint engine is a pure,
 * synchronous function over text and IR — no I/O, no Access. The adapter owns
 * all filesystem reads and feeds the engine pure inputs.
 *
 * Severity ladder:
 *   - "error"   — the code will fail at runtime or import time. Block imports.
 *   - "warning" — the code is suspicious and should be reviewed. Allow imports
 *                  but surface a hint.
 *   - "info"    — best-practice advisory or rule not yet implemented.
 *
 * `strict: true` elevates warnings to errors so CI pipelines can gate on a
 * stricter policy without rewriting rule defaults.
 */

export type LintSeverity = "info" | "warning" | "error";

export type LintRuleId =
  | "form-control-binding"
  | "access-listbox-no-list-assignment"
  | "bare-function-call-with-parens"
  | "named-and-positional-args-mixing"
  | "unicode-sensitive-executable-tokens"
  | "control-property-support";

export const ALL_LINT_RULE_IDS: readonly LintRuleId[] = [
  "form-control-binding",
  "access-listbox-no-list-assignment",
  "bare-function-call-with-parens",
  "named-and-positional-args-mixing",
  "unicode-sensitive-executable-tokens",
  "control-property-support",
];

export type LintDiagnostic = {
  severity: LintSeverity;
  rule: LintRuleId;
  /** Repository-relative path to the .cls file (preferred) or .form.txt. */
  file: string;
  /** 1-based line number in the .cls source. 0 when the diagnostic is form-level. */
  line: number;
  /** 1-based column number in the .cls source. 0 when the diagnostic is form-level. */
  column: number;
  message: string;
  /** Optional actionable suggestion — copy-pasteable replacement when feasible. */
  suggestedFix?: string;
};

/**
 * Inputs to the pure lint engine. The adapter assembles these from the
 * filesystem; the engine never reads or writes the disk.
 */
export type LintFormInput = {
  /** Form name (e.g. "Form_FormExpedientesGestion"). Used in diagnostic `file`. */
  formName: string;
  /** Repository-relative path to the .form.txt file (canonical form). */
  formTxtPath: string;
  /** Parsed FormIR for the .form.txt — controls + structure. */
  ir: import("../models/form-ir.js").FormIR;
  /** Raw .cls source text. Empty string is allowed (form with no code-behind). */
  clsSource: string;
  /** Repository-relative path to the .cls file (canonical form). */
  clsPath: string;
};

/**
 * Engine options. `rules` defaults to ALL_LINT_RULE_IDS when omitted.
 * `strict` elevates warnings to errors (CI hardening).
 */
export type LintFormOptions = {
  rules?: readonly LintRuleId[];
  strict?: boolean;
};

/**
 * Engine output — every diagnostic is an instance of an ACTIVE rule. The
 * adapter wraps this in an OperationResult envelope.
 */
export type LintFormResult = {
  diagnostics: LintDiagnostic[];
};
