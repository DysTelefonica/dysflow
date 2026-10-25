// Issue #1863 — error-propagation rules for the `p_Error` convention.
//
// Every method that declares `p_Error` must take it as its last parameter,
// declared `Optional ByRef p_Error As String`, and must write it from its error
// handler. A caller that invokes another `p_Error` method inside the same module
// must check the error variable before going on, and a `Test_*` function must
// return it. Methods without `p_Error` are never inspected, so legacy code
// stays clean.

export const ERROR_PROPAGATION_RULES = [
  "error-param-last",
  "error-propagation-check",
  "error-handler-writes-perror",
  "test-ignores-perror",
] as const;

export type ErrorPropagationRule = (typeof ERROR_PROPAGATION_RULES)[number];

/**
 * Structurally identical to the module-lint diagnostic. Declared here so this
 * module does not import the lint service, which imports this module back.
 */
export type ErrorPropagationDiagnostic = {
  rule: ErrorPropagationRule;
  line: number;
  severity: "error" | "warning";
  message: string;
};

type Procedure = {
  name: string;
  declarationIndex: number;
  endIndex: number;
  params: string[];
};

const DECLARATION_RE =
  /^\s*(?:Public\s+|Private\s+|Friend\s+)?(?:Static\s+)?(?:Sub|Function|Property\s+(?:Get|Let|Set))\s+(\w+)\s*\(([^)]*)\)/i;
const END_RE = /^\s*End\s+(?:Sub|Function|Property)\b/i;
const CALL_WITH_PARENS_RE = /^\s*(?:Call\s+)?(\w+)\s*\((.*)\)\s*$/i;
const CALL_BARE_RE = /^\s*(?:Call\s+)?(\w+)(?:\s+(.*))?$/i;
const ASSIGNED_CALL_RE = /^\s*[\w.]+\s*=\s*(\w+)\s*\((.*)\)\s*$/i;
const P_ERROR_PARAM_RE = /^\s*Optional\s+ByRef\s+p_Error\s+As\s+String\s*$/i;

/** Remove string literal contents and trailing comments; keeps `""` markers. */
function codeOf(line: string): string {
  return line
    .replace(/"[^"]*"/g, '""')
    .replace(/'.*$/, "")
    .trim();
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function collectProcedures(lines: readonly string[]): Procedure[] {
  const procedures: Procedure[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = DECLARATION_RE.exec(codeOf(lines[i] ?? ""));
    if (match === null) continue;
    let endIndex = i + 1;
    while (endIndex < lines.length && !END_RE.test(codeOf(lines[endIndex] ?? ""))) endIndex += 1;
    procedures.push({
      name: match[1] ?? "",
      declarationIndex: i,
      endIndex,
      params: splitTopLevelCommas(match[2] ?? ""),
    });
  }
  return procedures;
}

function declaresPError(procedure: Procedure): boolean {
  return procedure.params.some((param) =>
    /^(?:Optional\s+)?(?:ByRef\s+|ByVal\s+)?p_Error\b/i.test(param),
  );
}

function lintParamLast(procedure: Procedure, line: number): ErrorPropagationDiagnostic[] {
  const last = procedure.params[procedure.params.length - 1] ?? "";
  const isLast = /\bp_Error\b/i.test(last);
  const declaredCanonically = P_ERROR_PARAM_RE.test(last);
  if (isLast && declaredCanonically) return [];
  const message = isLast
    ? `${procedure.name}: p_Error must be declared "Optional ByRef p_Error As String".`
    : `${procedure.name}: p_Error must be the last parameter.`;
  return [{ rule: "error-param-last", line, severity: "error", message }];
}

/** The variable a call receives as its error argument, or undefined when omitted. */
type CallSite = { name: string; line: number; errorVar: string | undefined; statement: string };

function callSiteOf(
  code: string,
  line: number,
  targets: ReadonlySet<string>,
): CallSite | undefined {
  const assigned = ASSIGNED_CALL_RE.exec(code);
  const parens = assigned ?? CALL_WITH_PARENS_RE.exec(code);
  if (parens !== null) {
    const name = parens[1] ?? "";
    if (!targets.has(name.toLowerCase())) return undefined;
    const args = splitTopLevelCommas(parens[2] ?? "");
    return { name, line, errorVar: argumentVariable(args), statement: code };
  }
  const bare = CALL_BARE_RE.exec(code);
  if (bare === null) return undefined;
  const name = bare[1] ?? "";
  if (!targets.has(name.toLowerCase())) return undefined;
  const args = splitTopLevelCommas(bare[2] ?? "");
  return { name, line, errorVar: argumentVariable(args), statement: code };
}

function argumentVariable(args: string[]): string | undefined {
  const last = args[args.length - 1];
  if (last === undefined) return undefined;
  return /^\w+$/.test(last) ? last : undefined;
}

function checksVariable(code: string, variable: string): boolean {
  const escaped = variable.replace(/[$]/g, "\\$");
  const check = new RegExp(`^If\\s+(?:${escaped}\\s*<>\\s*""|Len\\(${escaped}\\)\\s*>\\s*0)`, "i");
  return check.test(code);
}

function lintPropagation(
  procedure: Procedure,
  codes: readonly string[],
  targets: ReadonlySet<string>,
): ErrorPropagationDiagnostic[] {
  const diagnostics: ErrorPropagationDiagnostic[] = [];
  for (let i = procedure.declarationIndex + 1; i < procedure.endIndex; i += 1) {
    const code = codes[i] ?? "";
    const site = callSiteOf(code, i + 1, targets);
    if (site === undefined) continue;
    if (site.errorVar === undefined) {
      diagnostics.push({
        rule: "error-propagation-check",
        line: site.line,
        severity: "warning",
        message: `${procedure.name}: call to ${site.name} omits its p_Error argument.`,
      });
      continue;
    }
    if (/^p_Error$/i.test(site.errorVar)) continue;
    const next = codes.slice(i + 1, procedure.endIndex).find((line) => line.length > 0);
    if (next !== undefined && checksVariable(next, site.errorVar)) continue;
    diagnostics.push({
      rule: "error-propagation-check",
      line: site.line,
      severity: "error",
      message: `${procedure.name}: the error returned by ${site.name} is not checked before the next statement.`,
    });
  }
  return diagnostics;
}

function lintTestIgnoresPError(
  procedure: Procedure,
  codes: readonly string[],
  targets: ReadonlySet<string>,
): ErrorPropagationDiagnostic[] {
  const diagnostics: ErrorPropagationDiagnostic[] = [];
  for (let i = procedure.declarationIndex + 1; i < procedure.endIndex; i += 1) {
    const site = callSiteOf(codes[i] ?? "", i + 1, targets);
    if (site === undefined || site.errorVar === undefined) continue;
    const variable = new RegExp(`\\b${site.errorVar}\\b`, "i");
    const used = codes.slice(i + 1, procedure.endIndex).some((line) => variable.test(line));
    if (used) continue;
    diagnostics.push({
      rule: "test-ignores-perror",
      line: site.line,
      severity: "error",
      message: `${procedure.name}: the p_Error returned by ${site.name} is discarded; return it in the JSON error field.`,
    });
  }
  return diagnostics;
}

function lintHandlerWritesPError(
  procedure: Procedure,
  codes: readonly string[],
): ErrorPropagationDiagnostic[] {
  let onErrorLine: number | undefined;
  let label: string | undefined;
  for (let i = procedure.declarationIndex + 1; i < procedure.endIndex; i += 1) {
    const match = /^On\s+Error\s+GoTo\s+(\w+)$/i.exec(codes[i] ?? "");
    if (match !== null) {
      onErrorLine = i + 1;
      label = match[1];
      break;
    }
  }
  if (onErrorLine === undefined || label === undefined) return [];
  const labelRe = new RegExp(`^${label}:$`, "i");
  const labelIndex = codes.findIndex(
    (line, index) => index > onErrorLine - 1 && index < procedure.endIndex && labelRe.test(line),
  );
  if (labelIndex === -1) return [];
  const handler = codes.slice(labelIndex + 1, procedure.endIndex);
  const writes = handler.some((line) => /^p_Error\s*=/i.test(line));
  const raisesOrShows = handler.some((line) => /\b(?:MsgBox|Err\.Raise)\b/i.test(line));
  if (writes && !raisesOrShows) return [];
  return [
    {
      rule: "error-handler-writes-perror",
      line: onErrorLine,
      severity: "error",
      message: `${procedure.name}: the error handler must assign p_Error and must not MsgBox or Err.Raise.`,
    },
  ];
}

/**
 * Run the error-propagation rules over one module. Only the rules named in
 * `rules` are evaluated; the caller decides which rules are enabled.
 */
export function lintErrorPropagation(
  source: string,
  rules: readonly ErrorPropagationRule[],
): Partial<Record<ErrorPropagationRule, ErrorPropagationDiagnostic[]>> {
  const lines = source.split(/\r?\n/);
  const codes = lines.map(codeOf);
  const procedures = collectProcedures(lines);
  const withPError = procedures.filter(declaresPError);
  const targets = new Set(withPError.map((procedure) => procedure.name.toLowerCase()));
  const result: Partial<Record<ErrorPropagationRule, ErrorPropagationDiagnostic[]>> = {};
  const push = (rule: ErrorPropagationRule, found: ErrorPropagationDiagnostic[]) => {
    result[rule] = [...(result[rule] ?? []), ...found];
  };

  for (const procedure of withPError) {
    if (rules.includes("error-param-last")) {
      push("error-param-last", lintParamLast(procedure, procedure.declarationIndex + 1));
    }
    if (rules.includes("error-propagation-check")) {
      push("error-propagation-check", lintPropagation(procedure, codes, targets));
    }
    if (rules.includes("error-handler-writes-perror")) {
      push("error-handler-writes-perror", lintHandlerWritesPError(procedure, codes));
    }
  }

  if (rules.includes("test-ignores-perror")) {
    for (const procedure of procedures) {
      if (!/^Test_/i.test(procedure.name)) continue;
      push("test-ignores-perror", lintTestIgnoresPError(procedure, codes, targets));
    }
  }
  return result;
}
