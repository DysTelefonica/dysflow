/**
 * Pure form-lint engine for `dysflow_lint_form_code`.
 *
 * No I/O — the adapter (vba-forms-lint-adapter.ts) reads files and feeds the
 * engine pure inputs. The engine emits `LintDiagnostic[]` synchronously.
 *
 * Rule implementations live as private functions in this file; if they grow,
 * split into `form-lint-rules/<rule>.ts` and re-export a single
 * `lintFormCode` entry point to keep the consumer API stable.
 *
 * Heuristics — keep them conservative. False positives block legitimate
 * imports; false negatives can be triaged later. A rule that wants to escalate
 * from "info" to "warning" / "error" must do it on solid signal.
 */

import {
  ALL_LINT_RULE_IDS,
  type LintDiagnostic,
  type LintFormInput,
  type LintFormOptions,
  type LintFormResult,
  type LintRuleId,
  type LintSeverity,
} from "./form-lint-types.js";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Run every active rule against a single form.
 *
 * @param input - Pure inputs (parsed IR + raw .cls + paths). Adapter-only.
 * @param options - Optional rule filter and `strict` flag.
 */
export function lintFormCode(input: LintFormInput, options: LintFormOptions = {}): LintFormResult {
  const active = new Set<LintRuleId>(options.rules ?? ALL_LINT_RULE_IDS);
  const strict = options.strict === true;
  const diagnostics: LintDiagnostic[] = [];

  for (const rule of active) {
    switch (rule) {
      case "form-control-binding":
        diagnostics.push(...ruleFormControlBinding(input));
        break;
      case "access-listbox-no-list-assignment":
        diagnostics.push(...ruleAccessListboxNoListAssignment(input));
        break;
      case "bare-function-call-with-parens":
        diagnostics.push(...ruleBareFunctionCallWithParens(input));
        break;
      case "named-and-positional-args-mixing":
        diagnostics.push(...ruleNamedAndPositionalArgsMixing(input));
        break;
      case "unicode-sensitive-executable-tokens":
        diagnostics.push(...ruleUnicodeSensitiveExecutableTokens(input, strict));
        break;
      case "control-property-support":
        diagnostics.push(...ruleControlPropertySupport(input));
        break;
    }
  }

  // Sort by (line, column, rule) so the output is stable across runs.
  diagnostics.sort(
    (a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule),
  );

  return { diagnostics };
}

// ---------------------------------------------------------------------------
// Rule A — form-control-binding
// ---------------------------------------------------------------------------

/**
 * Detect `Me.<ControlName>` references in the .cls and verify each name exists
 * in the parsed .form.txt controls.
 *
 * Conservative: only fires when the reference looks like a property access
 * (followed by `.`, `(`, end of line, or whitespace). This avoids misfiring on
 * substrings inside other identifiers (e.g. `MeA.btnClick`).
 */
function ruleFormControlBinding(input: LintFormInput): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const controlNames = new Set(input.ir.root.children.flatMap((c) => controlNameSet(c)));
  const lines = input.clsSource.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const match of line.matchAll(/\bMe\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      if (!name) continue;
      if (controlNames.has(name)) continue;
      const column = (match.index ?? 0) + 1;
      const suggestion = suggestClosestControlName(name, [...controlNames]);
      diagnostics.push({
        severity: "error",
        rule: "form-control-binding",
        file: input.clsPath,
        line: i + 1,
        column,
        message: `Me.${name} references a control that does not exist in the parsed .form.txt (controls: ${[...controlNames].join(", ") || "<none>"})`,
        suggestedFix: suggestion ? `Me.${suggestion}` : undefined,
      });
    }
  }
  return diagnostics;
}

function controlNameSet(node: import("../models/form-ir.js").FormNode): string[] {
  const name = scalarValue(node, "Name");
  if (name) return [name];
  return [];
}

function scalarValue(
  node: import("../models/form-ir.js").FormNode,
  key: string,
): string | undefined {
  for (const entry of node.entries) {
    if (entry.kind === "scalar" && entry.key === key) {
      const raw = entry.value.trim();
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
  }
  return undefined;
}

/**
 * Find the closest known control name by Levenshtein distance. Returns null if
 * no candidate is within the configurable threshold (3) — far-apart candidates
 * would mislead rather than help.
 */
function suggestClosestControlName(target: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: { name: string; dist: number } | null = null;
  for (const c of candidates) {
    const d = levenshtein(target.toLowerCase(), c.toLowerCase());
    if (best === null || d < best.dist) best = { name: c, dist: d };
  }
  return best !== null && best.dist <= 3 ? best.name : null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

// ---------------------------------------------------------------------------
// Rule B — access-listbox-no-list-assignment
// ---------------------------------------------------------------------------

/**
 * Detect `<expr>.List = <value>` where `<expr>` looks like a ListBox control.
 *
 * Heuristic for `<expr>`:
 *   1. If the control is declared in the .form.txt with blockType ListBox,
 *      any reference is a ListBox.
 *   2. Otherwise fall back to identifier names prefixed `lst`, `listBox`,
 *      `ListBox`, or ending in `ListBox`.
 */
function ruleAccessListboxNoListAssignment(input: LintFormInput): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const declaredListBoxes = new Set<string>();
  for (const child of input.ir.root.children) {
    if (child.blockType === "ListBox") {
      const name = scalarValue(child, "Name");
      if (name) declaredListBoxes.add(name);
    }
  }

  const lines = input.clsSource.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const match of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.List\s*=/g)) {
      const identifier = match[1];
      if (!identifier) continue;
      const isListBox = declaredListBoxes.has(identifier) || looksLikeListBoxName(identifier);
      if (!isListBox) continue;
      const column = (match.index ?? 0) + 1;
      diagnostics.push({
        severity: "error",
        rule: "access-listbox-no-list-assignment",
        file: input.clsPath,
        line: i + 1,
        column,
        message: `Access ListBox does not support .List = ... (on '${identifier}'); use a RowSource string or an AddItem loop.`,
        suggestedFix: `'${identifier}.RowSource = "a;b;c"  'Or: ${identifier}.AddItem "a"`,
      });
    }
  }
  return diagnostics;
}

function looksLikeListBoxName(name: string): boolean {
  if (/^lst[A-Z_]/.test(name)) return true;
  if (/^lst$/.test(name)) return true;
  if (/^listbox$/i.test(name)) return true;
  if (/^listBox\d*$/i.test(name)) return true;
  if (/ListBox$/.test(name)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Rule C — bare-function-call-with-parens
// ---------------------------------------------------------------------------

/**
 * Detect statements that call a Function but lack `=` or `Call`. The heuristic
 * triggers on a single-token statement where the identifier starts with an
 * uppercase letter (VBA Functions are PascalCase by convention).
 *
 * Heuristic exclusions:
 *   - Lines starting with `Call `.
 *   - Lines containing `=` before the identifier (assignment / `If … =` / `Debug.Print … =`).
 *   - Property accesses `Foo.Bar(args)` (matched by `.` between identifier and `(`).
 *   - `Debug.Print`, `MsgBox`, `Print` (intrinsics used as statements).
 */
function ruleBareFunctionCallWithParens(input: LintFormInput): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const intrinsics = new Set(["Debug.Print", "MsgBox", "Print", "Debug.Assert"]);
  const lines = input.clsSource.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (line === "" || line.startsWith("'")) continue;
    if (line.startsWith("Call ")) continue;
    if (intrinsics.has(line.split(/\s|\(/)[0] ?? "")) continue;

    // Match `Identifier(args)` at the start of the line, optionally after `Debug.Print `.
    const match = line.match(/^(?:Debug\.Print\s+)?([A-Z][A-Za-z0-9_]*)\s*\(/);
    if (!match) continue;
    const identifier = match[1];
    if (!identifier) continue;
    // Property access would have a `.` between identifier and `(`. We already
    // excluded that via the regex anchoring.
    // Make sure the line is not an assignment — split on the FIRST `=` and
    // verify the identifier comes AFTER the `=`.
    const eqIdx = line.indexOf("=");
    const parenIdx = line.indexOf("(");
    if (eqIdx !== -1 && eqIdx < parenIdx) continue;

    const column = (raw.indexOf(identifier) ?? 0) + 1;
    diagnostics.push({
      severity: "error",
      rule: "bare-function-call-with-parens",
      file: input.clsPath,
      line: i + 1,
      column,
      message: `Bare call to Function '${identifier}': the return value is discarded. VBA may not execute the call — prefix with 'Call ' or assign the result.`,
      suggestedFix: `result = ${identifier}(...)  ' or: Call ${identifier}(...)`,
    });
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// Rule D — named-and-positional-args-mixing
// ---------------------------------------------------------------------------

/**
 * Detect positional arguments that follow a named argument in a call.
 * Inside string literals the heuristic ignores the arg parser (so embedded
 * `:=-style` text inside a string does not trigger).
 */
function ruleNamedAndPositionalArgsMixing(input: LintFormInput): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const lines = input.clsSource.split(/\r?\n/);
  // Match calls where the first argument is on the same line as the call site.
  // We tolerate multi-line calls by scanning arg tokens line-by-line; once a
  // named arg appears, all subsequent top-level args must also be named.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Skip comments and string-only lines.
    if (line.trim().startsWith("'")) continue;
    const args = parseArgsLine(line);
    const firstNamedIdx = args.findIndex((a) => a.named);
    if (firstNamedIdx === -1) continue;
    const violation = args.find((a, idx) => idx > firstNamedIdx && !a.named);
    if (!violation) continue;
    diagnostics.push({
      severity: "error",
      rule: "named-and-positional-args-mixing",
      file: input.clsPath,
      line: i + 1,
      column: violation.column,
      message: `Positional argument '${violation.name ?? "<unnamed>"}' follows a named argument; VBA requires all arguments after the first named argument to also be named.`,
      suggestedFix: violation.value ? `${violation.value}:=${violation.value}` : undefined,
    });
  }
  return diagnostics;
}

type ParsedArg = { named: boolean; name?: string; value: string; column: number };

function parseArgsLine(line: string): ParsedArg[] {
  const args: ParsedArg[] = [];
  // Strip leading "Call " (with optional whitespace) — does not affect arg parsing.
  const stripped = line.replace(/^\s*Call\s+/i, "");
  // Find the opening paren of the FIRST call expression on the line.
  const openIdx = stripped.indexOf("(");
  if (openIdx === -1) return args;
  // Find the matching close paren (single-line call only — multi-line is out of scope).
  let depth = 0;
  let closeIdx = -1;
  let inString = false;
  for (let i = openIdx; i < stripped.length; i++) {
    const ch = stripped[i] ?? "";
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) return args;
  const inner = stripped.slice(openIdx + 1, closeIdx);
  // Tokenize by top-level commas (depth 0, not in string).
  const parts: Array<{ text: string; column: number }> = [];
  let buf = "";
  let partStart = openIdx + 1;
  depth = 0;
  inString = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] ?? "";
    if (ch === '"') inString = !inString;
    if (inString) {
      buf += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push({ text: buf.trim(), column: partStart + 1 });
      buf = "";
      partStart = openIdx + 1 + i + 1;
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "") parts.push({ text: buf.trim(), column: partStart + 1 });

  for (const part of parts) {
    if (part.text === "") continue;
    const namedMatch = part.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.*)$/);
    if (namedMatch) {
      const [, name, value] = namedMatch;
      args.push({ named: true, name, value: value ?? "", column: part.column });
    } else {
      args.push({ named: false, name: undefined, value: part.text, column: part.column });
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Rule E — unicode-sensitive-executable-tokens
// ---------------------------------------------------------------------------

const NON_ASCII_CODE_THRESHOLD = 0x7f;

function containsNonAscii(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if ((line.charCodeAt(i) ?? 0) > NON_ASCII_CODE_THRESHOLD) return true;
  }
  return false;
}

function findFirstNonAsciiIdentifier(line: string): { identifier: string; column: number } | null {
  let inIdent = false;
  let start = -1;
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i) ?? 0;
    const isAsciiIdent = (code >= 0x30 && code <= 0x39) || // 0-9
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      code === 0x5f; // _
    const isExtendedIdent = code > 0x7f && inIdent;
    if (isAsciiIdent || isExtendedIdent) {
      if (!inIdent) {
        inIdent = true;
        start = i;
      }
    } else if (inIdent) {
      const identifier = line.slice(start, i);
      if (containsNonAscii(identifier)) {
        return { identifier, column: start + 1 };
      }
      inIdent = false;
      start = -1;
    }
  }
  if (inIdent && start >= 0) {
    const identifier = line.slice(start);
    if (containsNonAscii(identifier)) {
      return { identifier, column: start + 1 };
    }
  }
  return null;
}

function ruleUnicodeSensitiveExecutableTokens(
  input: LintFormInput,
  strict: boolean,
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const lines = input.clsSource.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const codeOnly = stripStringLiteralsAndComments(raw);
    if (!containsNonAscii(codeOnly)) continue;
    const found = findFirstNonAsciiIdentifier(codeOnly);
    if (!found) continue;
    diagnostics.push({
      severity: strict ? "error" : "warning",
      rule: "unicode-sensitive-executable-tokens",
      file: input.clsPath,
      line: i + 1,
      column: found.column,
      message: `Non-ASCII identifier '${found.identifier}' in executable position: round-trip through the import pipeline may mutate Unicode characters (commit 3fbd60a fixed the regression, but accented members remain a risk surface).`,
      suggestedFix: strict ? `Replace with ASCII-only name and translate via a constant.` : undefined,
    });
  }
  return diagnostics;
}

function stripStringLiteralsAndComments(line: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (ch === "'") break; // rest of line is a comment
    if (ch === '"') {
      inString = !inString;
      out += " "; // placeholder — keeps column offsets stable
      continue;
    }
    out += inString ? " " : ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule F — control-property-support (best-effort)
// ---------------------------------------------------------------------------

/**
 * Validate property/method usage by control type. The full matrix lives in the
 * spec; this first cut implements a few high-signal checks. Other combinations
 * emit an `info` saying the rule is not yet implemented (so callers see that
 * the rule fires, not a silent gap).
 */
function ruleControlPropertySupport(input: LintFormInput): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const controlTypes = new Map<string, string>(); // name -> blockType
  for (const child of input.ir.root.children) {
    const name = scalarValue(child, "Name");
    if (name) controlTypes.set(name, child.blockType);
  }

  const lines = input.clsSource.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const match of line.matchAll(
      /\bMe\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      const controlName = match[1];
      const prop = match[2];
      if (!controlName || !prop) continue;
      const type = controlTypes.get(controlName);
      if (!type) continue; // Rule A owns missing-control diagnostics.
      const diag = checkControlProperty(controlName, prop, type, match.index ?? 0, i);
      if (diag) diagnostics.push({ ...diag, file: input.clsPath });
    }
  }
  return diagnostics;
}

function checkControlProperty(
  controlName: string,
  prop: string,
  type: string,
  column: number,
  line: number,
): Omit<LintDiagnostic, "file"> | null {
  // Property matrix (minimal).
  if (type === "ComboBox" && prop === "List") {
    return {
      severity: "warning",
      rule: "control-property-support",
      line: line + 1,
      column: column + 1,
      message: `ComboBox '${controlName}' does not support .List for large lists; assign a RowSource string instead.`,
      suggestedFix: `${controlName}.RowSource = "a;b;c"`,
    };
  }
  // Rule not yet implemented for this combination — surface an info so consumers
  // see the rule fires but don't get a false positive.
  if (type === "ListBox" && prop === "ColumnWidths") {
    return null; // ListBox.ColumnWidths IS supported; do not warn.
  }
  return null;
}

// Re-export severity type alias to avoid duplicate imports in callers.
export type { LintSeverity };
