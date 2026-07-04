/**
 * Pure VBA procedure introspection service.
 *
 * Provides read-only parsing of VBA source code to enumerate procedures
 * and extract their signatures and bodies. No I/O, no Access dependency —
 * suitable for both MCP adapter use and unit testing without fixtures.
 *
 * Architecture: this module lives in `src/core/services/` so it can be
 * unit-tested in isolation and imported by the MCP adapter without
 * carrying any Node.js-specific imports. The adapter layer handles
 * source resolution (file read vs. inline source) and error translation.
 */

/**
 * A single procedure catalog entry returned by `listVbaProcedures`.
 */
export interface VbaProcedureEntry {
  name: string;
  /** Procedure kind: Sub, Function, or Property */
  kind: "Sub" | "Function" | "Property";
  /** Visibility modifier; empty string when absent */
  visibility: "Public" | "Private" | "Friend" | "Static" | "";
  /** 1-based line number of the procedure declaration */
  line: number;
}

export type VbaProcedureKindFilter = "Sub" | "Function" | "Property" | "both";

/**
 * Detailed procedure record returned by `getVbaProcedure`.
 */
export interface VbaProcedureDetail {
  name: string;
  kind: "Sub" | "Function" | "Property";
  visibility: "Public" | "Private" | "Friend" | "Static" | "";
  startLine: number;
  endLine: number;
  body: string;
}

/**
 * Result of `listVbaProcedures`.
 */
export interface ListProceduresResult {
  module: string;
  procedures: VbaProcedureEntry[];
}

/**
 * Result of `getVbaProcedure`.
 */
export interface GetProcedureResult {
  module: string;
  procedure: string;
  startLine: number;
  endLine: number;
  body: string;
}

/** @internal */
function stripStrings(text: string): string {
  return text.replace(/"([^"]|"")*"/g, "''");
}

/** @internal */
const DECLARATION_RE =
  /^(?:(?:Public|Private|Friend|Static)[ \t]+)*?(Sub|Function|Property)(?:[ \t]+(?:Get|Let|Set))?[ \t]+([A-Za-z_][A-Za-z0-9_]*)/i;

const END_RE = /^End[ \t]+(Sub|Function|Property)\b/i;

/**
 * Parse all procedure declarations from VBA source.
 * Comments (full-line `'`) and `Rem` statements are skipped before matching.
 * String literals are blanked so `"Public Sub Test()"` inside a string is not
 * detected as a declaration.
 *
 * The result is ordered by increasing line number.
 */
export function listVbaProcedures(
  source: string,
  kindFilter: VbaProcedureKindFilter = "both",
): VbaProcedureEntry[] {
  const entries: VbaProcedureEntry[] = [];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("'")) continue;
    if (/^Rem\b/i.test(trimmed)) continue;

    const withoutStrings = stripStrings(rawLine);
    const match = withoutStrings.match(DECLARATION_RE);
    if (match === null) continue;

    const kind = match[1] as "Sub" | "Function" | "Property";
    const name = match[2];
    if (name === undefined) continue;
    if (kindFilter !== "both" && kind !== kindFilter) continue;

    // Derive visibility from the full stripped line (before the identifier)
    let visibility: VbaProcedureEntry["visibility"] = "";
    const lower = withoutStrings.toLowerCase();
    if (lower.includes("public ")) visibility = "Public";
    else if (lower.includes("private ")) visibility = "Private";
    else if (lower.includes("friend ")) visibility = "Friend";
    else if (lower.includes("static ")) visibility = "Static";

    entries.push({ name, kind, visibility, line: lineNum });
  }

  return entries;
}

/**
 * Find the detailed record for a single named procedure in VBA source.
 * Returns `undefined` when the procedure is not found.
 *
 * Handles:
 * - Single-line and multi-line declarations
 * - Property Get/Let/Set variants (normalised to kind "Property")
 * - Visibility modifiers
 * - **Case-insensitive procedure name match** — VBA is case-insensitive at the
 *   identifier level (VBA re-cases identifiers in the editor on import), and
 *   callers commonly reach this function with a lowercased or differently-cased
 *   name. The returned `name` field preserves the **canonical casing** from the
 *   source so a downstream consumer can diff against the binary verbatim.
 */
export function getVbaProcedure(
  source: string,
  procedureName: string,
): VbaProcedureDetail | undefined {
  const lines = source.split(/\r?\n/);
  const procedures = listVbaProcedures(source);
  // Case-insensitive lookup. The `target.name` we return below still carries
  // the original casing from `listVbaProcedures`, so the response surfaces
  // canonical casing while the lookup itself is forgiving.
  const target = procedures.find(
    (entry) => entry.name.toLowerCase() === procedureName.toLowerCase(),
  );
  if (target === undefined) return undefined;

  const bodyLines: string[] = [];
  let endLine = lines.length;

  for (let i = target.line; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i] ?? "";

    if (END_RE.test(stripStrings(rawLine))) {
      endLine = lineNum;
      break;
    }

    bodyLines.push(rawLine);
  }

  return {
    name: target.name,
    kind: target.kind,
    visibility: target.visibility,
    startLine: target.line,
    endLine,
    body: bodyLines.join("\r\n").trim(),
  };
}

export interface VbaReferenceEntry {
  module: string;
  kind: "Sub" | "Function" | "Property" | "module";
  line: number;
  context: string;
}

export interface FindReferencesResult {
  symbol: string;
  scope: string;
  references: VbaReferenceEntry[];
  totalCount: number;
}

export interface VbaProcedureRange {
  name: string;
  kind: "Sub" | "Function" | "Property";
  startLine: number;
  endLine: number;
}

// ─── Dead-code detection (issue #705) ─────────────────────────────────────────

/**
 * Kind of a dead-code finding. Lowercase identifiers to match the consumer
 * contract documented in `openspec/changes/detect-dead-code/tasks.md` (the
 * tasks surface `kind: "sub"`, `kind: "function"`, `kind: "property"`,
 * `kind: "declaration"` — Capitalised forms are reserved for the existing
 * `VbaProcedureEntry.kind` to keep internal naming consistent).
 */
export type DeadCodeKind = "sub" | "function" | "property" | "declaration";

/** Risk tier assigned by the dead-code analyser. */
export type DeadCodeRisk = "Low" | "Med" | "High";

/**
 * Special-name allowlist (issue #705). Every symbol whose name matches any
 * of these patterns is suppressed from the dead-code report because Access
 * the host runtime calls it by name even when nothing in the parsed
 * VBA source mentions it.
 *
 * Patterns are case-insensitive (VBA is case-insensitive at the identifier
 * level) and produce no false positives against the common Access event
 * surface:
 *
 *   - `AutoExec` (and `AutoOpen`/`AutoClose`/`AutoExit`/`AutoNew`/`AutoCompact`)
 *   - `NewConnection` (Access data-project lifecycle)
 *   - `^(Form|Report|Class)_<Name>` — form/report/class lifecycle methods
 *     such as `Form_Load`, `Report_Open`, `Class_Initialize`.
 *   - `_<Event>` — Access control-event handler suffixes such as
 *     `cmdSave_Click`, `txtName_AfterUpdate`, `btnSubmit_DblClick`.
 */
export const EXCLUDED_NAME_PATTERNS = {
  /** Auto* VBA lifecycle names. Access invokes these without VBA source needing to call them. */
  autoLifecycle: /^Auto(?:Exec|Open|Close|Exit|New|Compact)$/i,
  /** Access data-project lifecycle entry point. */
  newConnection: /^NewConnection$/i,
  /**
   * Form / report / class lifecycle methods (`Form_Load`, `Report_Open`,
   * `Class_Terminate`, …). The first letter of the suffix must be uppercase
   * so that PascalCase method names like `Form_LoadIt` still match (form
   * lifecycle is conventional), but generic underscored identifiers such as
   * `my_form_load` do not. Case-insensitive so `form_load` is also covered.
   */
  formLifecycle: /^(?:Form|Report|Class)_[A-Z]\w+$/i,
  /**
   * Access control-event handlers. The list mirrors the canonical event
   * suffixes a class module would expose for a control on a form. The
   * handler name is `<Control>_<Event>`, so the suffix `_Click`,
   * `_AfterUpdate`, etc., is the decisive signal.
   */
  controlEvent:
    /_(?:Click|DblClick|Change|GotFocus|LostFocus|KeyPress|KeyDown|KeyUp|MouseDown|MouseUp|MouseMove|BeforeUpdate|AfterUpdate|BeforeInsert|AfterInsert|BeforeDelConfirm|AfterDelConfirm|Enter|Exit|NotInList|Updated|Dirty|Undo|Filter)$/i,
} as const;

/**
 * True when a symbol name is a member of the Access special-name allowlist
 * (lifecycle + event handlers + reserved globals). Such symbols are never
 * classified as dead code because the host runtime dispatches to them by
 * name from sources the parser cannot see (form layout, expression
 * service, control bindings, etc.).
 */
function isExcludedName(name: string): boolean {
  return (
    EXCLUDED_NAME_PATTERNS.autoLifecycle.test(name) ||
    EXCLUDED_NAME_PATTERNS.newConnection.test(name) ||
    EXCLUDED_NAME_PATTERNS.formLifecycle.test(name) ||
    EXCLUDED_NAME_PATTERNS.controlEvent.test(name)
  );
}

export interface DeadCodeEvidence {
  /** Sorted list of every module name that participated in the scan. */
  scannedModules: string[];
  /** Number of references discovered across the scanned modules (0 for dead code). */
  referenceCount: number;
  /** Verbatim source line where the symbol was defined. */
  definitionSnippet: string;
}

export interface DeadCodeFinding {
  symbol: string;
  module: string;
  kind: DeadCodeKind;
  /** 1-based line number where the symbol was defined. */
  line: number;
  evidence: DeadCodeEvidence;
  risk: DeadCodeRisk;
}

export interface DeadCodeSummary {
  total: number;
  low: number;
  med: number;
  high: number;
}

export interface DeadCodeReport {
  scope: "binary" | "source" | "module";
  /** Echoed back from `detectDeadCode({ module: ... })` for caller introspection. */
  module?: string;
  /** Sorted list of every module name that participated in the scan. */
  scannedModules: string[];
  /** ISO 8601 timestamp captured at the start of the scan. */
  scannedAt: string;
  findings: DeadCodeFinding[];
  summary: DeadCodeSummary;
}

/**
 * Module-level declaration (Const / Public Var / Private Const / etc.)
 * parsed independently of `listVbaProcedures`. Used by `detectDeadCode` to
 * surface dead `Public Const` declarations, which the procedure parser
 * intentionally ignores.
 */
interface ModuleLevelDeclaration {
  name: string;
  line: number;
  /** Visibility modifier; empty string when absent. */
  visibility: "Public" | "Private" | "Friend" | "" | "Global";
}

/**
 * Match a module-level Const / Dim / Public variable / Private variable
 * declaration line. The leading visibility modifier is optional so
 * `Const FOO = 1` (default visibility) and `Public Const FOO = 1` both
 * match. Procedure declarations such as `Public Sub Foo()` do NOT match
 * because `Sub` is not in the type group.
 *
 * Issue #705 review (#1): the original regex only covered `Const|Dim`
 * with optional visibility, so `Public Foo As Long`, `Private Bar As String`,
 * `Global Foo As Long`, `Type Point`, and `Enum Color` were silently
 * dropped. The extended form keeps the original match in group 1 AND
 * adds two more groups (one for `Type`/`Enum` block declarations, one
 * for typed variable declarations such as `Public Foo As Long`).
 *
 * The first non-empty capture group wins; the regex is structured so a
 * Type/Enum body line such as `    X As Long` cannot match because none
 * of the three forms allows a bare identifier before `As`.
 */
const MODULE_LEVEL_CONST_RE =
  /^(?:\s+)?(?:(?:Public|Private|Global|Friend)\s+)?(?:Const|Dim)\s+([A-Za-z_][A-Za-z0-9_]*)/i;
const MODULE_LEVEL_VAR_RE =
  /^(?:\s+)?(?:(?:Public|Private|Global|Friend)\s+)([A-Za-z_][A-Za-z0-9_]*)\s+As\s+/i;
const MODULE_LEVEL_BLOCK_RE =
  /^(?:\s+)?(?:(?:Public|Private)\s+)?(?:Type|Enum)\s+([A-Za-z_][A-Za-z0-9_]*)/i;

function listVbaModuleLevelDeclarations(
  source: string,
): ModuleLevelDeclaration[] {
  const declarations: ModuleLevelDeclaration[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("'")) continue;
    if (/^Rem\b/i.test(trimmed)) continue;

    const withoutStrings = stripStrings(rawLine);
    const stripped = withoutStrings.trim();
    const constMatch = stripped.match(MODULE_LEVEL_CONST_RE);
    const varMatch = constMatch === null ? stripped.match(MODULE_LEVEL_VAR_RE) : null;
    const blockMatch =
      constMatch === null && varMatch === null
        ? stripped.match(MODULE_LEVEL_BLOCK_RE)
        : null;

    let capturedName: string | undefined;
    if (constMatch !== null && constMatch[1] !== undefined) {
      capturedName = constMatch[1];
    } else if (varMatch !== null && varMatch[1] !== undefined) {
      capturedName = varMatch[1];
    } else if (blockMatch !== null && blockMatch[1] !== undefined) {
      capturedName = blockMatch[1];
    } else {
      continue;
    }

    let visibility: ModuleLevelDeclaration["visibility"] = "";
    const lower = withoutStrings.toLowerCase();
    if (lower.includes("public ")) visibility = "Public";
    else if (lower.includes("global ")) visibility = "Global";
    else if (lower.includes("private ")) visibility = "Private";
    else if (lower.includes("friend ")) visibility = "Friend";

    declarations.push({ name: capturedName, line: i + 1, visibility });
  }
  return declarations;
}

/**
 * Classify the risk tier of a finding from its visibility, scope, and
 * declaration kind. The order of checks matters: a Public or Global
 * module-level Const stays `High` even under a narrowed scope because
 * the analyst cannot prove the constant is not bound from an unparsed
 * source.
 */
function classifyRisk(
  kind: DeadCodeKind,
  visibility: ModuleLevelDeclaration["visibility"],
  narrowed: boolean,
): DeadCodeRisk {
  if (kind === "declaration" && (visibility === "Public" || visibility === "Global")) {
    return "High";
  }
  if (narrowed) return "Med";
  if (visibility === "Private") return "Low";
  return "Med";
}

/** Look up the raw source line where a definition lives (1-based line). */
function readDefinitionSnippet(
  modules: Record<string, string>,
  moduleName: string,
  line: number,
): string {
  const source = modules[moduleName];
  if (source === undefined) return "";
  const lines = source.split(/\r?\n/);
  return (lines[line - 1] ?? "").trim();
}

/**
 * Walk every module's procedures and module-level declarations, run the
 * patched `findVbaReferences` (string-stripped, word-boundary) once per
 * symbol, and emit a structured report listing every unreferenced symbol
 * that is not part of the Access special-name allowlist.
 *
 * Pure: no filesystem access, no Access COM. The `scope` and `module`
 * options are echoed back on the report but do not change which modules
 * are searched — narrowing is what restricts the search set.
 *
 * Returns `undefined` when the caller narrows to a module that does not
 * exist in the supplied `modules` map (case-insensitive match). The MCP
 * adapter translates `undefined` into a `MODULE_NOT_FOUND` envelope so
 * the caller can distinguish "no dead code in this module" from "module
 * was not resolved". An empty inline `modules` map without a module
 * constraint is a valid scan and returns an empty report; unresolved
 * project-source fallback is handled at the MCP adapter boundary.
 */
export function detectDeadCode(
  modules: Record<string, string>,
  opts?: { scope?: "binary" | "source" | "module"; module?: string },
): DeadCodeReport | undefined {
  const scope: "binary" | "source" | "module" = opts?.scope ?? "binary";
  const narrowModuleName = opts?.module;

  const allModuleNames = Object.keys(modules);

  // If the caller narrows to a specific module, verify it actually
  // exists in the supplied map before running the analysis. A narrowing
  // miss is a typed error — the empty-success shape would otherwise be
  // indistinguishable from "scan ran and found nothing".
  if (narrowModuleName !== undefined) {
    const exists = allModuleNames.some(
      (name) => name.toLowerCase() === narrowModuleName.toLowerCase(),
    );
    if (!exists) return undefined;
  }

  // If the caller narrows to a specific module, restrict the analysis to
  // that module only — both for reference discovery AND for the candidate
  // enumeration (a symbol defined in another module is invisible to a
  // narrowed scan).
  const searchModules: Record<string, string> =
    narrowModuleName === undefined
      ? modules
      : Object.fromEntries(
          Object.entries(modules).filter(
            ([name]) => name.toLowerCase() === narrowModuleName.toLowerCase(),
          ),
        );

  // #705 review blocker #4 — `scannedModules` reflects the modules that
  // actually participated in the scan (the narrowed set when narrowing
  // is requested), NOT every module in the input map. The first review
  // flagged this as misleading — the analyst cannot trust `scannedModules`
  // to tell them what was actually scanned.
  const scannedModules = [...Object.keys(searchModules)].sort();

  const narrowed = narrowModuleName !== undefined;
  const findings: DeadCodeFinding[] = [];

  for (const [moduleName, source] of Object.entries(searchModules)) {
    // Enumerate every candidate (procedure + module-level declaration)
    // defined in this module. Procedure names are deduplicated against
    // declarations because a public constant and a public procedure can
    // share an identifier and we want the procedure entry to win (it
    // carries the better `kind` and visibility signal).
    const procedures = listVbaProcedures(source);
    const declarations = listVbaModuleLevelDeclarations(source);

    type Candidate = {
      name: string;
      module: string;
      kind: DeadCodeKind;
      line: number;
      visibility: ModuleLevelDeclaration["visibility"];
    };
    const candidates: Candidate[] = [];
    for (const proc of procedures) {
      candidates.push({
        name: proc.name,
        module: moduleName,
        kind: proc.kind.toLowerCase() as DeadCodeKind,
        line: proc.line,
        visibility: proc.visibility as ModuleLevelDeclaration["visibility"],
      });
    }
    for (const decl of declarations) {
      const sameAs = procedures.some(
        (p) => p.name.toLowerCase() === decl.name.toLowerCase(),
      );
      if (sameAs) continue;
      candidates.push({
        name: decl.name,
        module: moduleName,
        kind: "declaration",
        line: decl.line,
        visibility: decl.visibility,
      });
    }

    for (const candidate of candidates) {
      if (isExcludedName(candidate.name)) continue;

      const refs = findVbaReferences(
        searchModules,
        candidate.name,
        "binary",
        narrowModuleName,
      );
      const referenceCount = refs?.totalCount ?? 0;
      if (referenceCount > 0) continue;

      findings.push({
        symbol: candidate.name,
        module: candidate.module,
        kind: candidate.kind,
        line: candidate.line,
        evidence: {
          scannedModules,
          referenceCount: 0,
          definitionSnippet: readDefinitionSnippet(
            modules,
            candidate.module,
            candidate.line,
          ),
        },
        risk: classifyRisk(candidate.kind, candidate.visibility, narrowed),
      });
    }
  }

  const summary: DeadCodeSummary = {
    total: findings.length,
    low: findings.filter((f) => f.risk === "Low").length,
    med: findings.filter((f) => f.risk === "Med").length,
    high: findings.filter((f) => f.risk === "High").length,
  };

  // Deterministic ordering so the report is reproducible for snapshotting.
  findings.sort((a, b) => {
    if (a.module < b.module) return -1;
    if (a.module > b.module) return 1;
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    return a.line - b.line;
  });

  return {
    scope,
    module: narrowModuleName,
    scannedModules,
    scannedAt: new Date().toISOString(),
    findings,
    summary,
  };
}

/** @internal */
function removeComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inString = !inString;
    } else if (char === "'" && !inString) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** @internal */
function isDefinitionLine(cleanLine: string, symbol: string): boolean {
  const trimmed = cleanLine.trim();

  // 1. Check procedure declaration
  const declMatch = trimmed.match(DECLARATION_RE);
  if (declMatch?.[2] && declMatch[2].toLowerCase() === symbol.toLowerCase()) {
    return true;
  }

  // 2. Check variable / constant / event / type declaration
  const varDeclRe = new RegExp(
    `^(?:(?:Public|Private|Dim|Global|Const|Friend|Event|Type)[ \\t]+)+${symbol}\\b`,
    "i",
  );
  if (varDeclRe.test(trimmed)) {
    return true;
  }

  return false;
}

export function getModuleProcedureRanges(source: string): VbaProcedureRange[] {
  const procedures = listVbaProcedures(source);
  const lines = source.split(/\r?\n/);

  return procedures.map((p) => {
    let endLine = lines.length;
    for (let i = p.line; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i] ?? "";
      if (END_RE.test(stripStrings(rawLine).trim())) {
        endLine = lineNum;
        break;
      }
    }
    return {
      name: p.name,
      kind: p.kind,
      startLine: p.line,
      endLine,
    };
  });
}

/**
 * Find all references to a given symbol across a set of modules.
 * Returns undefined if the symbol is not defined anywhere in the modules.
 */
export function findVbaReferences(
  modules: Record<string, string>,
  symbol: string,
  scope = "all",
  moduleConstraint?: string,
): FindReferencesResult | undefined {
  let isDefined = false;
  const references: VbaReferenceEntry[] = [];

  // Check if the symbol is defined in any of the modules
  for (const source of Object.values(modules)) {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i] ?? "";
      const cleanLine = removeComment(rawLine);
      if (isDefinitionLine(cleanLine, symbol)) {
        isDefined = true;
        break;
      }
    }
    if (isDefined) break;
  }

  if (!isDefined) {
    return undefined;
  }

  // Find all references
  const searchRegex = new RegExp(`\\b${symbol}\\b`, "i");

  for (const [modName, source] of Object.entries(modules)) {
    if (
      moduleConstraint !== undefined &&
      modName.toLowerCase() !== moduleConstraint.toLowerCase()
    ) {
      continue;
    }

    const lines = source.split(/\r?\n/);
    const ranges = getModuleProcedureRanges(source);

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i] ?? "";
      const cleanLine = removeComment(rawLine);

      // issue #705 — string-strip the search line so a symbol that lives
      // inside a string literal (e.g. `Application.Run "ProcName"`) does
      // not count as a reference. The definition phase still uses the
      // un-stripped `cleanLine` so a body like
      // `Public Sub X() : Const M = "X" : End Sub` still recognises `X` as
      // its own definition site.
      const searchLine = stripStrings(cleanLine);

      if (searchRegex.test(searchLine)) {
        // Skip definition lines
        if (isDefinitionLine(cleanLine, symbol)) {
          continue;
        }

        // Find containing procedure
        const proc = ranges.find((r) => r.startLine <= lineNum && lineNum <= r.endLine);

        references.push({
          module: modName,
          kind: proc ? proc.kind : "module",
          line: lineNum,
          context: rawLine.trim(),
        });
      }
    }
  }

  return {
    symbol,
    scope,
    references,
    totalCount: references.length,
  };
}
