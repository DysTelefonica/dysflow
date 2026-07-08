import { listVbaProcedures } from "./vba-procedure-service.js";

export const VBA_MODULE_LINT_RULES = [
  "option-declaration",
  "identifier-safety",
  "declaration-order",
  "arg-type-match",
  // F22 (2026-07-06) — flag identifiers that shadow VBA / Access / DAO globals
  // and reserved words. The orchestrator self-applies this rule (and the
  // `forbidden-name` MCP `lint_module` rule surfaces it to consumers).
  "forbidden-name",
] as const;

export type VbaModuleLintRule = (typeof VBA_MODULE_LINT_RULES)[number];
export type VbaModuleLintSeverity = "error" | "warning";

export interface VbaModuleLintDiagnostic {
  rule: VbaModuleLintRule;
  line: number;
  severity: VbaModuleLintSeverity;
  /** #731 — optional structured code (e.g. `LINT_SUPPRESSED` for opt-outs). */
  code?: string;
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
  /**
   * #731 — optional project context that drives per-rule overrides and
   * legacy auto-detection for `identifier-safety`. When omitted, the rule
   * defaults to its strict behavior (greenfield-safe).
   */
  projectRoot?: string;
  /**
   * #731 — operator's per-rule overrides from `.dysflow/project.json`
   * `capabilities.lint.rules`. Keys are rule ids. `enabled: false`
   * suppresses the rule entirely and emits a single `LINT_SUPPRESSED`
   * info diagnostic in its place.
   */
  lintRulesOverride?: Readonly<
    Partial<Record<VbaModuleLintRule, { enabled: boolean; reason?: string }>>
  >;
  /**
   * #731 — callback that returns `true` when the project root's `src/`
   * tree contains at least one non-ASCII identifier AND no
   * `.dysflow-no-auto-allow` marker is present. The marker check is
   * owned by the adapter (filesystem concern) and combined with the
   * legacy-signal walk into one result so this core service stays free
   * of `node:fs`. The lint service calls it at most once per lint
   * report. When omitted, the legacy auto-detection is skipped and the
   * rule behaves as today (strict greenfield severity).
   */
  hasNonAsciiIdentifierInProject?: () => boolean | Promise<boolean>;
  /**
   * Issue #789 — opt-in to the historical strict (error) severity for
   * non-ASCII identifiers inside `identifier-safety`. Defaults to `false`
   * so Spanish / Portuguese / French / German / Italian VBA identifiers
   * emit `warning` instead of `error` (VBA compiles them fine and the
   * import round-trip works). Project-level opt-in lives under
   * `capabilities.lint.identifierSafety.strictNonAscii`; the MCP layer
   * threads that into this field.
   *
   * `._` dot-underscore and reserved-word findings are unaffected by
   * this flag — they stay at `error` always because they are real
   * syntactic defects that block even the human compile.
   */
  strictNonAscii?: boolean;
}

const LINT_SUPPRESSED_DIAGNOSTIC_CODE = "LINT_SUPPRESSED";

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

/**
 * F22 (2026-07-06) — identifiers that shadow VBA / Access / DAO / ADO
 * / Scripting globals, intrinsic functions, or common reserved words.
 *
 * Declaring one of these as a local variable, parameter, constant, type,
 * enum, procedure, or property produces the misleading `Calificador no
 * válido` / `Invalid qualifier` error class — VBA still parses the
 * reference, the parser binds it to the shadowed global, and the
 * downstream member access fails at compile time with a line that does
 * not point at the source of the shadow.
 *
 * The list is case-insensitive at the match site; we normalize to
 * lowercase before lookup so `Err`, `err` and `ERR` all trigger the same
 * diagnostic.
 */
const FORBIDDEN_NAMES: ReadonlySet<string> = new Set([
  // Err object
  "err",
  "error",
  // Date / time
  "date",
  "time",
  "now",
  // String intrinsics (functions, not just types)
  "left",
  "right",
  "mid",
  "trim",
  "len",
  "replace",
  "format",
  // Containers
  "array",
  "collection",
  "dictionary",
  "object",
  // Primitive types
  "string",
  "integer",
  "long",
  "boolean",
  "double",
  "currency",
  "variant",
  // Access object model — these are GLOBAL identifiers at module scope
  "form",
  "report",
  "control",
  "recordset",
  "database",
  "field",
  "fields",
  "tabledef",
  "querydef",
  "docmd",
  "currentdb",
  "application",
  "screen",
  "forms",
  "reports",
  "me",
  "parent",
  // Keywords / pseudo-values
  "new",
  "nothing",
  "null",
  "empty",
  "true",
  "false",
  // Common member-like identifiers
  "name",
  "type",
]);

/**
 * F22 — recommended convention per forbidden name. Sourced from the
 * user-authored 2026-07-06 rule (orchestrator / multi-AI friction log).
 * The first element of the joined recommendation is the canonical pick
 * for that category; additional entries are listed as alternatives.
 */
const FORBIDDEN_NAME_RECOMMENDATIONS: Readonly<Record<string, readonly string[]>> = {
  err: ["errMsg", "mensajeError", "textoError"],
  error: ["errMsg", "mensajeError", "textoError"],
  date: ["fechaAlta", "fechaInicio", "fechaFin", "fechaActual"],
  time: ["horaAlta", "horaInicio", "horaFin", "horaActual"],
  now: ["fechaActual", "momentoActual"],
  left: ["ladoIzquierdo", "posicionIzquierda", "resto"],
  right: ["ladoDerecho", "posicionDerecha"],
  mid: ["subcadena", "valorCentral", "tramoMedio"],
  trim: ["textoLimpio", "valorRecortado"],
  len: ["longitud", "tamano"],
  replace: ["reemplazarEn", "sustituirEn", "valorReemplazado"],
  format: ["formatearA", "cadenaFormateada"],
  array: ["arreglo", "vector", "listaValores"],
  collection: ["col", "colItems", "colAnexos", "colResultados"],
  dictionary: ["dict", "dictAnexos", "dictValores"],
  object: ["objeto", "elemento", "entidad"],
  string: ["texto", "cadena"],
  integer: ["entero", "conteo", "numeroEntero"],
  long: ["valor", "numero", "id", "contador"],
  boolean: ["esValido", "tieneValor", "cumpleCondicion"],
  double: ["valor", "importe", "porcentaje"],
  currency: ["importe", "monto", "valorMoneda"],
  variant: ["valor", "dato", "resultado"],
  form: ["nombreFormulario", "frm"],
  report: ["nombreReporte", "rpt"],
  control: ["nombreControl", "ctrl"],
  recordset: ["rs", "rsRiesgos", "rsAnexos"],
  database: ["db"],
  field: ["campo", "nombreCampo", "valorCampo"],
  fields: ["campos", "listaCampos"],
  tabledef: ["tdf", "definicionTabla"],
  querydef: ["qdf", "definicionConsulta"],
  docmd: ["comando", "accion"],
  currentdb: ["base", "baseActual"],
  application: ["app", "aplicacion"],
  screen: ["pantalla"],
  forms: ["formularios", "coleccionFormularios"],
  reports: ["reportes", "coleccionReportes"],
  me: ["moduloActual", "self"],
  parent: ["elementoPadre", "parentForm", "contenedorPadre"],
  new: ["esNuevo", "crearNuevo"],
  nothing: ["vacio", "sinValor"],
  null: ["vacio", "ausente", "sinValor"],
  empty: ["vacio", "sinValor"],
  true: ["esVerdadero", "activo"],
  false: ["esFalso", "inactivo"],
  name: ["nombre", "nombreUsuario", "nombreCampo", "nombreTabla"],
  type: ["tipo", "tipoRegistro", "tipoRiesgo", "tipoAnexo"],
};

/**
 * F22 — diagnostic code emitted by the `forbidden-name` rule. Consumers
 * (CI gates, AI agents) can match on this code to distinguish shadowing
 * findings from other identifier-safety problems.
 */
const FORBIDDEN_NAME_DIAGNOSTIC_CODE = "FORBIDDEN_NAME";

function recommendFor(forbidden: string): readonly string[] {
  return (
    FORBIDDEN_NAME_RECOMMENDATIONS[forbidden] ?? [
      "<choose a domain-specific name that does not shadow a VBA global>",
    ]
  );
}

function formatRecommendation(forbidden: string): string {
  const picks = recommendFor(forbidden);
  return `use one of: ${picks.join(", ")}`;
}

export function lintVbaModule(
  request: VbaModuleLintRequest,
): VbaModuleLintReport | Promise<VbaModuleLintReport> {
  const rules = normalizeRules(request.rules);
  const flatDiagnostics: VbaModuleLintDiagnostic[] = [];
  const byRule: Partial<Record<VbaModuleLintRule, VbaModuleLintDiagnostic[]>> = {};
  const lines = request.source.split(/\r?\n/);

  for (const rule of rules) {
    byRule[rule] = [];
  }

  if (rules.includes("identifier-safety")) {
    // #731 — three-way resolution for identifier-safety:
    //   Path A: explicit operator opt-out  →  emit a single LINT_SUPPRESSED info.
    //   Path B: project has ≥1 non-ASCII identifier AND no marker file AND no
    //           override  →  downgrade severity from "error" to "warning".
    //   Path C: greenfield (no override, no legacy signal, or marker present)  →  keep error severity.
    return resolveIdentifierSafety(request, rules, lines, byRule, flatDiagnostics);
  }

  return finishLintReport(request, rules, byRule, flatDiagnostics);
}

function resolveIdentifierSafety(
  request: VbaModuleLintRequest,
  rules: VbaModuleLintRule[],
  lines: readonly string[],
  byRule: Partial<Record<VbaModuleLintRule, VbaModuleLintDiagnostic[]>>,
  flatDiagnostics: VbaModuleLintDiagnostic[],
): VbaModuleLintReport | Promise<VbaModuleLintReport> {
  const override = request.lintRulesOverride?.["identifier-safety"];

  // Path A — explicit operator opt-out wins everything, even if
  // `strictNonAscii: true` is also passed (#789). The opt-out emits a
  // single audit marker and yields no per-identifier findings.
  if (override?.enabled === false) {
    const suppressed: VbaModuleLintDiagnostic = {
      rule: "identifier-safety",
      line: 1,
      severity: "warning",
      code: LINT_SUPPRESSED_DIAGNOSTIC_CODE,
      message: `identifier-safety rule suppressed via project config${
        override.reason ? ` ("${override.reason}")` : ""
      }`,
    };
    flatDiagnostics.push(suppressed);
    byRule["identifier-safety"]?.push(suppressed);
    return finishLintReport(request, rules, byRule, flatDiagnostics);
  }

  // Issue #789 — `strictNonAscii` only applies to the greenfield path
  // (Path C). Path B's auto-detection already proves the project ships
  // non-ASCII identifiers in production, so an opt-in to strict severity
  // there would punish code that compiled and shipped. Keep Path B at
  // the relaxed "warning" regardless of the project opt-in.
  const proceed = (strictNonAscii: boolean): VbaModuleLintReport => {
    const found = lintIdentifierSafety(lines, strictNonAscii);
    flatDiagnostics.push(...found);
    byRule["identifier-safety"]?.push(...found);
    return finishLintReport(request, rules, byRule, flatDiagnostics);
  };

  // Path B — auto-detect when the operator did NOT set an override AND we
  // were given a detection callback. The callback already accounts for the
  // `.dysflow-no-auto-allow` marker so this core layer stays free of
  // `node:fs` (#731 + architectural core-I/O-port-boundary test).
  //
  // #789 — Path B keeps the historical "always warning" downgrade
  // because the auto-detection callback has ALREADY proven that the
  // project ships non-ASCII identifiers in production. Promoting them
  // to `error` would create churn for code that compiles and ships.
  // When the callback returns `false` (e.g. `.dysflow-no-auto-allow`
  // marker opted out of auto-detection), fall through to Path C and
  // honor the `strictNonAscii` opt-in as a regular greenfield check.
  if (override === undefined && request.hasNonAsciiIdentifierInProject !== undefined) {
    return Promise.resolve(request.hasNonAsciiIdentifierInProject()).then((legacy) =>
      legacy ? proceed(false) : proceed(request.strictNonAscii === true),
    );
  }

  // Path C — greenfield or no project context. Respect the project
  // opt-in via `request.strictNonAscii` (#789).
  return proceed(request.strictNonAscii === true);
}

function finishLintReport(
  request: VbaModuleLintRequest,
  rules: VbaModuleLintRule[],
  byRule: Partial<Record<VbaModuleLintRule, VbaModuleLintDiagnostic[]>>,
  flatDiagnostics: VbaModuleLintDiagnostic[],
): VbaModuleLintReport {
  // Run the remaining non-identifier-safety rules. The identifier-safety
  // branch above already populated its slice before delegating here.
  const lines = request.source.split(/\r?\n/);
  if (rules.includes("option-declaration")) {
    const found = lintOptionDeclarations(lines);
    flatDiagnostics.push(...found);
    byRule["option-declaration"]?.push(...found);
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
  if (rules.includes("forbidden-name")) {
    const found = lintForbiddenName(request.source, lines);
    flatDiagnostics.push(...found);
    byRule["forbidden-name"]?.push(...found);
  }

  // #731 — `LINT_SUPPRESSED` is an audit marker, not a real finding; it
  // surfaces in `diagnostics.<rule>` for traceability but does NOT count
  // toward `isClean` or `summary`. Without this, a deliberate opt-out
  // would falsely fail the import-modules pre-import gate.
  //
  // Issue #789 — `isClean` reflects "no real defects", i.e. no
  // error-severity diagnostics. Warnings are advisory (non-ASCII,
  // arg-type-match) and do NOT block `isClean`. This matches the
  // acceptance contract from the issue:
  //   `isClean: false` only when there are real defects;
  //   non-ASCII alone does not block.
  const realDiagnostics = flatDiagnostics.filter((d) => d.code !== LINT_SUPPRESSED_DIAGNOSTIC_CODE);
  const errors = realDiagnostics.filter((d) => d.severity === "error").length;
  const warnings = realDiagnostics.filter((d) => d.severity === "warning").length;

  return {
    module: request.module,
    rules,
    isClean: errors === 0,
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

function lintIdentifierSafety(
  lines: readonly string[],
  strictNonAscii: boolean,
): VbaModuleLintDiagnostic[] {
  // Issue #789 — invert the default for the non-ASCII check.
  // VBA accepts Unicode identifiers natively: Spanish / Portuguese /
  // French / German / Italian identifiers compile fine in Access and
  // round-trip through `import_modules` / `verify_code`. The historical
  // `error` severity was a false positive that broke ~50+ production
  // identifiers across HPS, gestion_riesgos, no_conformidades, condor,
  // cadete, etc. — see issue #789 for the cross-fleet tally.
  //
  // The new contract:
  //   - `strictNonAscii === false` (default) → "warning" — non-ASCII is
  //     audited but does not block `import_modules` or any other gate.
  //   - `strictNonAscii === true`            → "error"   — restores the
  //     old behavior for projects that opt-in via
  //     `capabilities.lint.identifierSafety.strictNonAscii: true`.
  //
  // The dot-underscore (`._`) and reserved-word findings stay at "error"
  // REGARDLESS of `strictNonAscii` — those are real syntactic defects
  // that block even the human compile.
  const nonAsciiSeverity: VbaModuleLintSeverity = strictNonAscii ? "error" : "warning";
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
          severity: nonAsciiSeverity,
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

/**
 * F22 (2026-07-06) — flag every identifier declared in the module whose
 * name shadows a VBA / Access / DAO global, intrinsic function, or
 * reserved word. The check covers:
 *
 * - module-level variables: `Dim X`, `Private X`, `Public X`,
 *   `Static X`, `Const X`, `Type X`, `Enum X`, `Declare ... Function X`
 * - procedure names: `Sub X`, `Function X`, `Property Get/Let/Set X`
 * - parameter names inside any procedure header
 * - `With ... End With` is NOT a declaration, so it is excluded
 *
 * The match is case-insensitive (we normalize to lowercase) and only
 * fires on the EXACT forbidden identifier — `ErrorMessage` does not
 * trigger the `Error` rule, `dimErr` does not trigger the `Dim` rule.
 *
 * Severity is `error`: a shadowed identifier compiles in some code paths
 * and breaks in others with a misleading `Calificador no válido` error.
 */
function lintForbiddenName(_source: string, lines: readonly string[]): VbaModuleLintDiagnostic[] {
  const diagnostics: VbaModuleLintDiagnostic[] = [];
  const reported = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? "";
    const code = stripStringsAndComments(raw);

    for (const { kind, name, column } of collectForbiddenNameMatches(code)) {
      if (!FORBIDDEN_NAMES.has(name.toLowerCase())) continue;
      const dedupeKey = `${lineNumber}:${column}:${name.toLowerCase()}`;
      if (reported.has(dedupeKey)) continue;
      reported.add(dedupeKey);

      diagnostics.push({
        rule: "forbidden-name",
        line: lineNumber,
        severity: "error",
        code: FORBIDDEN_NAME_DIAGNOSTIC_CODE,
        message: `Identifier '${name}' shadows VBA global '${name.toLowerCase()}' (${kind}); ${formatRecommendation(name.toLowerCase())}.`,
      });
    }
  }

  return diagnostics;
}

interface ForbiddenNameMatch {
  kind: "variable" | "parameter" | "procedure" | "constant" | "type" | "enum";
  name: string;
  /** 1-based column where the offending identifier starts. */
  column: number;
}

/**
 * F22 helper — extract every declaration / parameter / procedure name
 * from a single stripped line. The line is assumed to be already free
 * of strings and comments (`stripStringsAndComments`).
 */
function collectForbiddenNameMatches(code: string): ForbiddenNameMatch[] {
  const matches: ForbiddenNameMatch[] = [];
  if (code.trim().length === 0) return matches;

  // Procedure header: `Sub Foo`, `Function Foo`, `Property Get Foo`, etc.
  const procedureHeader = code.match(
    /^\s*(?:Public|Private|Friend|Static)?\s*(?:Sub|Function|Property(?:\s+(?:Get|Let|Set))?)\s+([A-Za-z_][A-Za-z0-9_]*)/i,
  );
  if (procedureHeader?.[1] !== undefined) {
    matches.push({
      kind: "procedure",
      name: procedureHeader[1],
      column: 1 + (procedureHeader.index ?? 0),
    });
  }

  // Module-level constant: `Const X = ...`
  pushMatch(
    matches,
    code,
    /^\s*(?:Public|Private|Friend|Global)\s+Const\s+([A-Za-z_][A-Za-z0-9_]*)/i,
    "constant",
  );
  pushMatch(matches, code, /^\s*Const\s+([A-Za-z_][A-Za-z0-9_]*)/i, "constant");

  // Module-level type: `Type X ... End Type`
  pushMatch(matches, code, /^\s*(?:Public|Private)\s+Type\s+([A-Za-z_][A-Za-z0-9_]*)/i, "type");
  pushMatch(matches, code, /^\s*Type\s+([A-Za-z_][A-Za-z0-9_]*)/i, "type");

  // Module-level enum: `Enum X ... End Enum`
  pushMatch(matches, code, /^\s*(?:Public|Private)\s+Enum\s+([A-Za-z_][A-Za-z0-9_]*)/i, "enum");
  pushMatch(matches, code, /^\s*Enum\s+([A-Za-z_][A-Za-z0-9_]*)/i, "enum");

  // Declare PtrSafe / non-PtrSafe: `Declare PtrSafe Function X Lib ...`
  pushMatch(
    matches,
    code,
    /^\s*(?:Public|Private)\s+Declare\s+(?:PtrSafe\s+)?(?:Sub|Function)\s+([A-Za-z_][A-Za-z0-9_]*)/i,
    "procedure",
  );

  // Variable declarations at module scope. The pattern is permissive —
  // any line that starts with one of the recognized prefixes and names
  // an identifier triggers the check, because VBA is lenient about the
  // order of `Dim`/`Private`/`Public`/etc. and we want to be safe.
  // We exclude lines that already matched a procedure header above.
  const isProcedureHeader = procedureHeader !== null;
  if (!isProcedureHeader) {
    pushMatch(
      matches,
      code,
      /^\s*(?:Public|Private|Friend|Global|Static)\s+(?!Sub\b|Function\b|Property\b|Const\b|Declare\b|Type\b|Enum\b)([A-Za-z_][A-Za-z0-9_]*)/i,
      "variable",
    );
    pushMatch(matches, code, /^\s*Dim\s+([A-Za-z_][A-Za-z0-9_]*)/i, "variable");
  }

  // Parameter list — only when a procedure header is present on this
  // line. We capture the full parenthesized expression and walk the
  // comma-separated parameter specs.
  const parenMatch = code.match(
    /^\s*(?:Public|Private|Friend|Static)?\s*(?:Sub|Function|Property(?:\s+(?:Get|Let|Set))?)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/i,
  );
  if (parenMatch?.[1] !== undefined) {
    const params = parenMatch[1];
    const paramsOffset =
      (parenMatch.index ?? 0) + code.slice(parenMatch.index ?? 0).indexOf("(") + 1;
    for (const spec of splitTopLevelCommas(params)) {
      const name = firstParameterName(spec);
      if (name === undefined) continue;
      const columnInLine = paramsOffset + params.indexOf(name);
      matches.push({
        kind: "parameter",
        name,
        column: Math.max(1, columnInLine + 1),
      });
    }
  }

  return matches;
}

function pushMatch(
  matches: ForbiddenNameMatch[],
  code: string,
  pattern: RegExp,
  kind: ForbiddenNameMatch["kind"],
): void {
  const match = code.match(pattern);
  if (match?.[1] === undefined) return;
  matches.push({ kind, name: match[1], column: 1 + (match.index ?? 0) });
}

function firstParameterName(spec: string): string | undefined {
  // Strip Optional, ByVal, ByRef, ParamArray — order in VBA is
  // (Optional) (ByVal|ByRef) (ParamArray) name [( )] (As Type).
  // We only need the identifier that follows those modifiers.
  const cleaned = spec
    .replace(/\bOptional\b/gi, " ")
    .replace(/\bByVal\b/gi, " ")
    .replace(/\bByRef\b/gi, " ")
    .replace(/\bParamArray\b/gi, " ")
    .trim();
  const match = cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] ?? "";
    if (char === "(") parenDepth += 1;
    if (char === ")" && parenDepth > 0) parenDepth -= 1;
    if (char === "," && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0 || value.length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
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
