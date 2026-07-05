import { listVbaProcedures } from "./vba-procedure-service.js";

export const VBA_MODULE_LINT_RULES = [
  "option-declaration",
  "identifier-safety",
  "declaration-order",
  "arg-type-match",
] as const;

export type VbaModuleLintRule = (typeof VBA_MODULE_LINT_RULES)[number];
export type VbaModuleLintSeverity = "error" | "warning";

export interface VbaModuleLintDiagnostic {
  rule: VbaModuleLintRule;
  line: number;
  severity: VbaModuleLintSeverity;
  message: string;
}

/**
 * Lint report structured with diagnostics grouped by rule name.
 *
 * Diagnostics are primarily indexed by rule so a consumer can efficiently
 * consume findings per rule without filtering a flat array.
 * A flat array is preserved under `flatDiagnostics` for callers that
 * need the legacy shape (backward compatibility).
 */
export interface VbaModuleLintReport {
  module: string;
  rules: VbaModuleLintRule[];
  isClean: boolean;
  /** Diagnostics keyed by rule name — the preferred consumer shape. */
  diagnostics: Partial<Record<VbaModuleLintRule, VbaModuleLintDiagnostic[]>>;
  /** Flat diagnostics array — preserved for backward compatibility. */
  flatDiagnostics: VbaModuleLintDiagnostic[];
  summary: {
    errors: number;
    warnings: number;
  };
}

export interface VbaModuleLintRequest {
  module: string;
  source: string;
  rules?: readonly VbaModuleLintRule[];
}

interface VbaParameter {
  name: string;
  type: string | undefined;
  optional: boolean;
}

interface VbaProcedureSignature {
  name: string;
  parameters: VbaParameter[];
}

const PROCEDURE_DECLARATION_RE =
  /^(?:(?:Public|Private|Friend|Static)[ \t]+)*?(Sub|Function|Property)(?:[ \t]+(?:Get|Let|Set))?[ \t]+([A-Za-z_][A-Za-z0-9_]*)/i;
const PROCEDURE_END_RE = /^End[ \t]+(Sub|Function|Property)\b/i;
const MODULE_LEVEL_DECLARATION_RE =
  /^(?:(?:Public|Private|Friend|Global|Static)[ \t]+)?(?:Dim|Const|Declare|Type|Enum)\b|^(?:Public|Private|Friend|Global|Static)[ \t]+(?!Sub\b|Function\b|Property\b|Const\b|Declare\b|Type\b|Enum\b)[A-Za-z_][A-Za-z0-9_]*\b/i;
const VBA_IDENTIFIER_RE = /[\p{L}_][\p{L}\p{N}_]*/gu;

const RESERVED_WORDS = new Set([
  "as",
  "byref",
  "byval",
  "call",
  "case",
  "const",
  "dim",
  "do",
  "else",
  "end",
  "enum",
  "false",
  "for",
  "function",
  "if",
  "loop",
  "me",
  "new",
  "next",
  "not",
  "nothing",
  "option",
  "private",
  "property",
  "public",
  "rem",
  "select",
  "set",
  "sub",
  "then",
  "true",
  "type",
  "wend",
  "while",
  "with",
]);

const NUMERIC_VBA_TYPES = new Set([
  "byte",
  "integer",
  "long",
  "longlong",
  "single",
  "double",
  "currency",
  "decimal",
]);

export function lintVbaModule(request: VbaModuleLintRequest): VbaModuleLintReport {
  const rules = normalizeRules(request.rules);
  const flatDiagnostics: VbaModuleLintDiagnostic[] = [];
  const byRule: Partial<Record<VbaModuleLintRule, VbaModuleLintDiagnostic[]>> = {};
  const lines = request.source.split(/\r?\n/);

  for (const rule of rules) {
    byRule[rule] = [];
  }

  if (rules.includes("option-declaration")) {
    const found = lintOptionDeclarations(lines);
    flatDiagnostics.push(...found);
    byRule["option-declaration"]?.push(...found);
  }
  if (rules.includes("identifier-safety")) {
    const found = lintIdentifierSafety(lines);
    flatDiagnostics.push(...found);
    byRule["identifier-safety"]?.push(...found);
  }
  if (rules.includes("declaration-order")) {
    const found = lintDeclarationOrder(lines);
    flatDiagnostics.push(...found);
    byRule["declaration-order"]?.push(...found);
  }
  if (rules.includes("arg-type-match")) {
    const found = lintArgumentTypeMatches(request.source, lines);
    flatDiagnostics.push(...found);
    byRule["arg-type-match"]?.push(...found);
  }

  const errors = flatDiagnostics.filter((d) => d.severity === "error").length;
  const warnings = flatDiagnostics.filter((d) => d.severity === "warning").length;

  return {
    module: request.module,
    rules,
    isClean: flatDiagnostics.length === 0,
    diagnostics: byRule,
    flatDiagnostics,
    summary: { errors, warnings },
  };
}

function normalizeRules(rules: readonly VbaModuleLintRule[] | undefined): VbaModuleLintRule[] {
  if (rules === undefined) return [...VBA_MODULE_LINT_RULES];
  // Explicit [] means "no rules applied" — produces a clean report.
  if (rules.length === 0) return [];
  const allowed = new Set<VbaModuleLintRule>(VBA_MODULE_LINT_RULES);
  const normalized: VbaModuleLintRule[] = [];
  for (const rule of rules) {
    if (allowed.has(rule) && !normalized.includes(rule)) normalized.push(rule);
  }
  return normalized.length > 0 ? normalized : [...VBA_MODULE_LINT_RULES];
}

function lintOptionDeclarations(lines: readonly string[]): VbaModuleLintDiagnostic[] {
  const optionLines: string[] = [];
  let anchorLine = 1;
  let inClassHeaderBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed.length === 0 || trimmed.startsWith("'") || /^Rem\b/i.test(trimmed)) continue;
    if (/^Attribute\b/i.test(trimmed)) continue;
    if (/^VERSION\s+\d+(?:\.\d+)?\s+CLASS\b/i.test(trimmed)) continue;
    if (/^BEGIN\b/i.test(trimmed)) {
      inClassHeaderBlock = true;
      continue;
    }
    if (inClassHeaderBlock) {
      if (/^END\b/i.test(trimmed)) inClassHeaderBlock = false;
      continue;
    }
    if (/^Option\b/i.test(trimmed)) {
      optionLines.push(trimmed);
      anchorLine = lineNumber;
      continue;
    }
    anchorLine = optionLines.length === 0 ? lineNumber : anchorLine;
    break;
  }

  const hasCompareDatabase = optionLines.some((line) =>
    /^Option\s+Compare\s+Database\b/i.test(line),
  );
  const hasExplicit = optionLines.some((line) => /^Option\s+Explicit\b/i.test(line));
  const diagnostics: VbaModuleLintDiagnostic[] = [];

  if (!hasCompareDatabase) {
    diagnostics.push({
      rule: "option-declaration",
      line: anchorLine,
      severity: "error",
      message: "Module header must include Option Compare Database in the leading Option block.",
    });
  }
  if (!hasExplicit) {
    diagnostics.push({
      rule: "option-declaration",
      line: anchorLine,
      severity: "error",
      message: "Module header must include Option Explicit in the leading Option block.",
    });
  }
  return diagnostics;
}

function lintIdentifierSafety(lines: readonly string[]): VbaModuleLintDiagnostic[] {
  const diagnostics: VbaModuleLintDiagnostic[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const code = stripStringsAndComments(lines[i] ?? "");
    if (code.includes("._")) {
      diagnostics.push({
        rule: "identifier-safety",
        line: lineNumber,
        severity: "error",
        message:
          "Unsafe dot-underscore sequence found; VBA parses ._ as member access plus line continuation.",
      });
    }

    const seenNonAscii = new Set<string>();
    for (const match of code.matchAll(VBA_IDENTIFIER_RE)) {
      const identifier = match[0];
      if (hasNonAscii(identifier) && !seenNonAscii.has(identifier)) {
        seenNonAscii.add(identifier);
        diagnostics.push({
          rule: "identifier-safety",
          line: lineNumber,
          severity: "error",
          message: `Identifier '${identifier}' contains non-ASCII characters; use ASCII-safe VBA identifiers for reliable import/compile round-trips.`,
        });
      }
    }

    const reservedIdentifier = findReservedWordIdentifier(code);
    if (reservedIdentifier !== undefined) {
      diagnostics.push({
        rule: "identifier-safety",
        line: lineNumber,
        severity: "error",
        message: `Identifier '${reservedIdentifier}' is a VBA reserved word and is unsafe as a declaration name.`,
      });
    }
  }
  return diagnostics;
}

function findReservedWordIdentifier(code: string): string | undefined {
  const candidates = [
    code.match(/\bDim\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1],
    code.match(/\bConst\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1],
    code.match(/\b(?:Sub|Function)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1],
    code.match(/\bProperty\s+(?:Get|Let|Set)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1],
    code.match(
      /^\s*(?:Public|Private|Friend|Global|Static)\s+(?!Sub\b|Function\b|Property\b|Const\b|Declare\b|Type\b|Enum\b)([A-Za-z_][A-Za-z0-9_]*)\b/i,
    )?.[1],
  ].filter((candidate): candidate is string => candidate !== undefined);

  return candidates.find((candidate) => RESERVED_WORDS.has(candidate.toLowerCase()));
}

function lintDeclarationOrder(lines: readonly string[]): VbaModuleLintDiagnostic[] {
  const diagnostics: VbaModuleLintDiagnostic[] = [];
  let seenProcedure = false;
  let inProcedure = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const code = stripStringsAndComments(lines[i] ?? "").trim();
    if (code.length === 0) continue;

    if (PROCEDURE_DECLARATION_RE.test(code)) {
      seenProcedure = true;
      inProcedure = true;
      continue;
    }
    if (inProcedure) {
      if (PROCEDURE_END_RE.test(code)) inProcedure = false;
      continue;
    }
    if (seenProcedure && MODULE_LEVEL_DECLARATION_RE.test(code)) {
      diagnostics.push({
        rule: "declaration-order",
        line: lineNumber,
        severity: "error",
        message:
          "Module-level declarations must appear before the first procedure; move this declaration into the header area.",
      });
    }
  }

  return diagnostics;
}

function lintArgumentTypeMatches(
  source: string,
  lines: readonly string[],
): VbaModuleLintDiagnostic[] {
  const signatures = buildProcedureSignatures(source, lines);
  const diagnostics: VbaModuleLintDiagnostic[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const rawCode = stripCommentsOnly(lines[i] ?? "").trim();
    const safeCode = stripStringsAndComments(lines[i] ?? "").trim();
    if (rawCode.length === 0) continue;
    if (PROCEDURE_DECLARATION_RE.test(safeCode) || PROCEDURE_END_RE.test(safeCode)) continue;

    const call = extractConservativeCall(rawCode, safeCode);
    if (call === undefined) continue;
    const signature = signatures.get(call.name.toLowerCase());
    if (signature === undefined) continue;

    const args = splitArguments(call.args);
    const requiredCount = signature.parameters.filter((parameter) => !parameter.optional).length;
    if (args.length < requiredCount || args.length > signature.parameters.length) continue;

    for (let argIndex = 0; argIndex < args.length; argIndex += 1) {
      const parameter = signature.parameters[argIndex];
      if (parameter === undefined) continue;
      const actualType = literalType(args[argIndex] ?? "");
      if (actualType === undefined) continue;
      if (!literalMatchesVbaType(actualType, parameter.type)) {
        diagnostics.push({
          rule: "arg-type-match",
          line: lineNumber,
          severity: "warning",
          message: `Call to '${signature.name}' passes ${actualType} literal to parameter '${parameter.name}'${parameter.type ? ` As ${parameter.type}` : ""}.`,
        });
      }
    }
  }

  return diagnostics;
}

function buildProcedureSignatures(
  source: string,
  lines: readonly string[],
): Map<string, VbaProcedureSignature> {
  const signatures = new Map<string, VbaProcedureSignature>();
  for (const procedure of listVbaProcedures(source)) {
    const declaration = collectDeclaration(lines, procedure.line);
    signatures.set(procedure.name.toLowerCase(), {
      name: procedure.name,
      parameters: parseParameters(declaration),
    });
  }
  return signatures;
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
  return splitArguments(raw).map((part) => parseParameter(part.trim()));
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

function extractConservativeCall(
  rawCode: string,
  safeCode: string,
): { name: string; args: string } | undefined {
  const callStatement = rawCode.match(/^Call\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i);
  if (callStatement?.[1] !== undefined && callStatement[2] !== undefined) {
    return { name: callStatement[1], args: callStatement[2] };
  }

  const assignmentCall = rawCode.match(/=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i);
  if (assignmentCall?.[1] !== undefined && assignmentCall[2] !== undefined) {
    return { name: assignmentCall[1], args: assignmentCall[2] };
  }

  const functionStatement = rawCode.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i);
  if (functionStatement?.[1] !== undefined && functionStatement[2] !== undefined) {
    return { name: functionStatement[1], args: functionStatement[2] };
  }

  const bareCall = rawCode.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i);
  if (bareCall?.[1] !== undefined && bareCall[2] !== undefined) {
    const firstToken = bareCall[1].toLowerCase();
    if (!RESERVED_WORDS.has(firstToken) && !/^\s*(Debug|DoCmd)\./i.test(safeCode)) {
      return { name: bareCall[1], args: bareCall[2] };
    }
  }

  return undefined;
}

function splitArguments(raw: string): string[] {
  const args: string[] = [];
  let current = "";
  let inString = false;
  let parenDepth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i] ?? "";
    const next = raw[i + 1] ?? "";
    if (char === '"') {
      current += char;
      if (inString && next === '"') {
        current += next;
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "(") parenDepth += 1;
      if (char === ")" && parenDepth > 0) parenDepth -= 1;
      if (char === "," && parenDepth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim().length > 0 || raw.trim().length > 0) args.push(current.trim());
  return args;
}

function literalType(value: string): "string" | "number" | "boolean" | undefined {
  const trimmed = value.trim();
  if (/^"(?:[^"]|"")*"$/.test(trimmed)) return "string";
  if (/^(True|False)$/i.test(trimmed)) return "boolean";
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[ED][+-]?\d+)?$/i.test(trimmed)) return "number";
  return undefined;
}

function literalMatchesVbaType(
  actualType: "string" | "number" | "boolean",
  vbaType: string | undefined,
): boolean {
  if (vbaType === undefined) return true;
  const normalized = vbaType.toLowerCase();
  if (normalized === "variant") return true;
  if (normalized === "string") return actualType === "string";
  if (normalized === "boolean") return actualType === "boolean";
  if (NUMERIC_VBA_TYPES.has(normalized)) return actualType === "number";
  return true;
}

function stripStringsAndComments(line: string): string {
  return stripStrings(stripCommentsOnly(line));
}

function stripCommentsOnly(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inString && next === '"') {
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && char === "'") return line.slice(0, i);
  }

  const remMatch = line.match(/^(\s*)Rem\b/i);
  if (remMatch !== null) return remMatch[1] ?? "";
  return line;
}

function stripStrings(line: string): string {
  return line.replace(/"([^"]|"")*"/g, '""');
}

function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) return true;
  }
  return false;
}
