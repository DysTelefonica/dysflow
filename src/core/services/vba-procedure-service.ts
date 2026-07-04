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

      if (searchRegex.test(cleanLine)) {
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
